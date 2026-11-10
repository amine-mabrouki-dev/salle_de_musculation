import type { EntreeOutbox, LigneLocale, TableSynchronisee } from "./localDatabase.types";

export interface AdaptateurOutbox {
  lire(ownerId: string): Promise<EntreeOutbox[]>;
  acquitter(ownerId: string, id: string): Promise<void>;
  echouer(ownerId: string, id: string, error: string): Promise<void>;
}

export interface ResultatOutbox {
  synchronises: number;
  erreur: unknown | null;
  entreeEchouee: EntreeOutbox | null;
}

export function delaiNouvelleTentative(attempts: number): number {
  return Math.min(60_000, 1_000 * (2 ** Math.min(Math.max(attempts - 1, 0), 6)));
}

export async function synchroniserJusquaConfirmation(
  synchroniser: () => Promise<void>,
  mutationEnAttente: () => Promise<boolean>,
  tentativesMax = 3,
): Promise<void> {
  for (let tentative = 0; tentative < tentativesMax; tentative += 1) {
    await synchroniser();
    if (!(await mutationEnAttente())) return;
  }
  throw new Error("La modification est toujours en attente de synchronisation.");
}

export function vainqueurConflit(localUpdatedAt: string, remoteUpdatedAt: string): "local" | "remote" {
  return Date.parse(localUpdatedAt) > Date.parse(remoteUpdatedAt) ? "local" : "remote";
}

export function payloadPourSynchronisation(
  table: TableSynchronisee,
  payload: LigneLocale,
): LigneLocale {
  const obsoleteByTable: Partial<Record<TableSynchronisee, string[]>> = {
    members: ["photo_pending_data", "photo_pending_delete_path"],
    subscriptions: ["created_at", "local_created_at", "amount_due", "renew_on_payment", "status"],
    payments: [
      "renewal_applied",
      "renewal_previous_start_date",
      "renewal_previous_end_date",
      "previous_amount_due",
      "previous_price",
      "previous_renew_on_payment",
      "previous_start_date",
      "previous_end_date",
    ],
  };
  const obsoleteFields = new Set(obsoleteByTable[table] ?? []);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !obsoleteFields.has(key))) as LigneLocale;
}

export function conserverDateCreationLocaleAbonnement(
  table: TableSynchronisee,
  local: LigneLocale | null,
  distante: LigneLocale,
): LigneLocale {
  if (
    table !== "subscriptions"
    || !local
    || !("local_created_at" in local)
    || typeof local.local_created_at !== "string"
    || "local_created_at" in distante
  ) {
    return distante;
  }
  return Object.assign({}, distante, { local_created_at: local.local_created_at });
}

export function conserverPhotoLocaleMembre(
  table: TableSynchronisee,
  local: LigneLocale | null,
  distante: LigneLocale,
): LigneLocale {
  if (table !== "members" || !local) return distante;

  const pendingData = "photo_pending_data" in local ? local.photo_pending_data : null;
  const pendingDeletePath = "photo_pending_delete_path" in local ? local.photo_pending_delete_path : null;
  if (typeof pendingData !== "string" && typeof pendingDeletePath !== "string") return distante;

  const localPhoto = local as LigneLocale & Record<string, unknown>;
  const merged: LigneLocale & Record<string, unknown> = {
    ...distante,
    photo_path: typeof localPhoto.photo_path === "string" ? localPhoto.photo_path : null,
  };
  if (typeof pendingData === "string") merged.photo_pending_data = pendingData;
  if (typeof pendingDeletePath === "string") merged.photo_pending_delete_path = pendingDeletePath;
  return merged;
}

export async function envoyerOutboxDansOrdre(
  ownerId: string,
  adaptateur: AdaptateurOutbox,
  envoyer: (entry: EntreeOutbox) => Promise<void>,
): Promise<ResultatOutbox> {
  const entries = await adaptateur.lire(ownerId);
  let synchronises = 0;
  for (const entry of entries) {
    try {
      await envoyer(entry);
      await adaptateur.acquitter(ownerId, entry.id);
      synchronises += 1;
    } catch (error: unknown) {
      await adaptateur.echouer(ownerId, entry.id, error instanceof Error ? error.message : String(error));
      return { synchronises, erreur: error, entreeEchouee: entry };
    }
  }
  return { synchronises, erreur: null, entreeEchouee: null };
}
