import { supabase } from "./supabase";
import {
  ecrireMetaLocale,
  compterOutbox,
  fusionnerLigneDistante,
  lireMetaLocale,
  lireOutbox,
  acquitterOutbox,
  echouerOutbox,
  type LigneLocale,
  type TableSynchronisee,
  TABLES_SYNCHRONISEES,
  EVENEMENT_DONNEES_LOCALES_MAJ,
} from "./localDatabase";
import {
  delaiNouvelleTentative,
  envoyerOutboxDansOrdre,
  payloadPourSynchronisation,
} from "./syncQueue";
import { messageErreurSynchronisation } from "./syncErrors";
import { verifierIdentifiantsLigne } from "./uuid";
import { nettoyerAnciennesPhotosMembres, synchroniserPhotosMembres } from "./memberPhotoSync";

export const EVENEMENT_ETAT_SYNCHRONISATION = "gym4you-sync-state-changed";
export const EVENEMENT_SYNCHRONISATION_TERMINEE = "gym4you-sync-completed";

export type EtatSynchronisation = "en-ligne" | "hors-ligne" | "synchronisation" | "erreur";

export interface InstantaneSynchronisation {
  status: EtatSynchronisation;
  pending: number;
  error: string | null;
  storageWarning: string | null;
  lastSync: string | null;
}

let synchronisationActive: Promise<void> | null = null;
const tentativesEchoueesA = new Map<string, number>();
const minuteursNouvelleTentative = new Map<string, number>();

async function annoncerEtat(
  status: EtatSynchronisation,
  ownerId: string,
  error: string | null = null,
): Promise<void> {
  const [pending, lastSync] = await Promise.all([
    compterOutbox(ownerId).catch(() => 0),
    lireMetaLocale(ownerId, "last_sync:completed").catch(() => null),
  ]);
  const storageWarning = typeof window !== "undefined"
    ? (window as Window & { gym4youStorageWarning?: string }).gym4youStorageWarning ?? null
    : null;
  window.dispatchEvent(new CustomEvent(EVENEMENT_ETAT_SYNCHRONISATION, {
    detail: { status, pending, error, storageWarning, lastSync } satisfies InstantaneSynchronisation,
  }));
}

function messageErreur(erreur: unknown): string {
  return messageErreurSynchronisation(erreur);
}

async function envoyerOutbox(ownerId: string, force: boolean): Promise<void> {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const client = supabase;
  const pending = await lireOutbox(ownerId);
  const firstRetry = pending[0] ? tentativesEchoueesA.get(pending[0].id) : undefined;
  if (!force && firstRetry !== undefined && firstRetry > Date.now()) return;
  const result = await envoyerOutboxDansOrdre(ownerId, {
    lire: lireOutbox,
    acquitter: acquitterOutbox,
    echouer: echouerOutbox,
  }, async (entry) => {
    const payload = payloadPourSynchronisation(entry.table_name, entry.payload);
    if (entry.entity_id !== payload.id) throw new Error("Identifiant invalide");
    verifierIdentifiantsLigne(payload);
    if (["payments", "expenses", "payment_cancellations", "expense_cancellations"].includes(entry.table_name)) {
      const { data: existing, error: existingError } = await client
        .from(entry.table_name)
        .select("id")
        .eq("id", entry.entity_id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return;

      const ligneAppendOnly = entry.operation === "delete"
        ? { ...payload, deleted_at: null }
        : payload;
      const { error } = await client.from(entry.table_name).insert(ligneAppendOnly);
      if (error?.code === "23505") {
        const { data: duplicate, error: duplicateError } = await client
          .from(entry.table_name)
          .select("id")
          .eq("id", entry.entity_id)
          .maybeSingle();
        if (!duplicateError && duplicate) return;
      }
      if (error) throw error;
      tentativesEchoueesA.delete(entry.id);
      return;
    }

    const { data: distant, error: erreurLecture } = await client
      .from(entry.table_name)
      .select("*")
      .eq("id", entry.entity_id)
      .maybeSingle();
    if (erreurLecture) throw erreurLecture;
    if (distant) {
      const gagnant = await fusionnerLigneDistante(
        ownerId,
        entry.table_name,
        distant as unknown as LigneLocale,
      );
      if (gagnant === "remote") return;
    }

    const { error } = await client
      .from(entry.table_name)
      .upsert(payload, { onConflict: "id" });
    if (error) throw error;
    tentativesEchoueesA.delete(entry.id);
    const timer = minuteursNouvelleTentative.get(entry.id);
    if (timer !== undefined) window.clearTimeout(timer);
    minuteursNouvelleTentative.delete(entry.id);
  });
  if (result.erreur) {
    const entry = result.entreeEchouee;
    if (entry) {
      const delay = delaiNouvelleTentative(entry.attempts + 1);
      tentativesEchoueesA.set(entry.id, Date.now() + delay);
      const currentTimer = minuteursNouvelleTentative.get(entry.id);
      if (currentTimer !== undefined) window.clearTimeout(currentTimer);
      minuteursNouvelleTentative.set(entry.id, window.setTimeout(() => {
        minuteursNouvelleTentative.delete(entry.id);
        if (navigator.onLine) void synchroniserBaseLocale(ownerId).catch(() => undefined);
      }, delay));
    }
    throw result.erreur;
  }
}

async function recupererTable(ownerId: string, table: TableSynchronisee, startedAt: string): Promise<void> {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const cursorKey = `last_sync:${table}`;
  const cursor = await lireMetaLocale(ownerId, cursorKey);
  let offset = 0;
  let maximum = cursor ?? "";
  const pageSize = 500;

  while (true) {
    let query = supabase.from(table).select("*")
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true });
    if (cursor) query = query.gte("updated_at", cursor);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as LigneLocale[];
    for (const row of rows) {
      if (!row.id || !row.updated_at) continue;
      verifierIdentifiantsLigne(row);
      await fusionnerLigneDistante(ownerId, table, row);
      if (row.updated_at > maximum) maximum = row.updated_at;
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
  }

  await ecrireMetaLocale(ownerId, cursorKey, maximum || startedAt);
}

async function executerSynchronisation(ownerId: string, force: boolean): Promise<void> {
  if (!navigator.onLine) return;
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const startedAt = new Date().toISOString();
  await envoyerOutbox(ownerId, force);
  if (await synchroniserPhotosMembres(ownerId)) {
    await envoyerOutbox(ownerId, force);
  }
  if (await nettoyerAnciennesPhotosMembres(ownerId)) {
    await envoyerOutbox(ownerId, force);
  }
  for (const table of TABLES_SYNCHRONISEES) {
    await recupererTable(ownerId, table, startedAt);
  }
  await ecrireMetaLocale(ownerId, "last_sync:completed", new Date().toISOString());
  window.dispatchEvent(new Event(EVENEMENT_DONNEES_LOCALES_MAJ));
  window.dispatchEvent(new Event(EVENEMENT_SYNCHRONISATION_TERMINEE));
}

export async function synchroniserBaseLocale(ownerId: string, force = false): Promise<void> {
  if (synchronisationActive) return synchronisationActive;
  void annoncerEtat("synchronisation", ownerId);
  synchronisationActive = executerSynchronisation(ownerId, force).then(async () => {
    await annoncerEtat("en-ligne", ownerId);
  }).catch(async (error: unknown) => {
    const message = messageErreur(error);
    await annoncerEtat("erreur", ownerId, message);
    throw new Error(message, { cause: error });
  }).finally(() => {
    synchronisationActive = null;
  });
  return synchronisationActive;
}

export async function lireInstantaneSynchronisation(
  ownerId: string,
  storageWarning: string | null = null,
): Promise<InstantaneSynchronisation> {
  const [pending, lastSync] = await Promise.all([
    compterOutbox(ownerId),
    lireMetaLocale(ownerId, "last_sync:completed"),
  ]);
  return {
    status: !navigator.onLine ? "hors-ligne" : "en-ligne",
    pending,
    error: null,
    storageWarning,
    lastSync,
  };
}
