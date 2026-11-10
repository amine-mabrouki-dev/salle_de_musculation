import { enregistrerLocalement, nouvelleLigne } from "./localRepository";
import { synchroniserBaseLocale } from "./syncEngine";
import { utilisateurConnecteId } from "./offlineStore";
import type { LigneLocale, TableSynchronisee } from "./localDatabase.types";
import { supabase } from "./supabase";

export interface VersionMembre {
  id: string;
  entity_table: "members" | "subscriptions";
  entity_id: string;
  previous_payload: LigneLocale;
  user_id: string;
  changed_at: string;
}

function jourTunis(date: Date): string {
  if (!Number.isFinite(date.getTime())) return "";
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const partie = (type: string) => parties.find((item) => item.type === type)?.value ?? "";
  return `${partie("year")}-${partie("month")}-${partie("day")}`;
}

export function versionsQuotidiennesUniques(versions: readonly VersionMembre[]): VersionMembre[] {

  const versionDuJour = new Map<string, VersionMembre>();
  for (const version of versions) {
    const jour = jourTunis(new Date(version.changed_at));
    const cle = jour
      ? `${version.entity_table}:${version.entity_id}:${jour}`
      : `${version.entity_table}:${version.entity_id}:${version.id}`;
    const existante = versionDuJour.get(cle);
    if (!existante || Date.parse(version.changed_at) < Date.parse(existante.changed_at)) {
      versionDuJour.set(cle, version);
    }
  }
  return [...versionDuJour.values()]
    .sort((a, b) => {
      const dateA = Date.parse(a.changed_at);
      const dateB = Date.parse(b.changed_at);
      if (!Number.isFinite(dateA)) return Number.isFinite(dateB) ? 1 : 0;
      if (!Number.isFinite(dateB)) return -1;
      return dateB - dateA;
    });
}

export function versionsDuJourTunis(
  versions: readonly VersionMembre[],
  dateReference = new Date(),
): VersionMembre[] {
  const jour = jourTunis(dateReference);
  return versionsQuotidiennesUniques(versions)
    .filter((version) => jourTunis(new Date(version.changed_at)) === jour);
}

function estLigneLocale(value: unknown): value is LigneLocale {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string"
    && typeof row.updated_at === "string"
    && (row.deleted_at === null || typeof row.deleted_at === "string");
}

export async function chargerHistoriqueMembres(gymId: string): Promise<VersionMembre[]> {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const depuis = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const records: Record<string, unknown>[] = [];
    for (let debut = 0; ; debut += 500) {
      const { data, error } = await supabase
        .from("member_history")
        .select("id,entity_table,entity_id,previous_payload,user_id,changed_at")
        .eq("gym_id", gymId)
        .gte("changed_at", depuis)
        .order("changed_at", { ascending: false })
        .range(debut, debut + 499);
      if (error) throw error;
      records.push(...(data ?? []) as Record<string, unknown>[]);
      if (!data || data.length < 500) break;
    }

    const versions = records.flatMap((record): VersionMembre[] => {
      if (
        typeof record.id !== "string"
        || (record.entity_table !== "members" && record.entity_table !== "subscriptions")
        || typeof record.entity_id !== "string"
        || typeof record.user_id !== "string"
        || typeof record.changed_at !== "string"
        || !estLigneLocale(record.previous_payload)
      ) return [];
      return [{
        id: record.id,
        entity_table: record.entity_table,
        entity_id: record.entity_id,
        previous_payload: record.previous_payload,
        user_id: record.user_id,
        changed_at: record.changed_at,
      }];
    });
    return versionsDuJourTunis(versions);
  } catch {
    return [];
  }
}

export async function chargerNomsMembresSalle(gymId: string): Promise<Record<string, string>> {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  try {
    const { data, error } = await supabase
      .from("gym_memberships")
      .select("user_id,display_name")
      .eq("gym_id", gymId);
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((member) => [member.user_id, member.display_name]));
  } catch {
    return {};
  }
}

export async function restaurerVersionMembre(version: VersionMembre): Promise<void> {
  const ownerId = await utilisateurConnecteId();
  const { previous_payload: snapshot } = version;
  const table: TableSynchronisee = version.entity_table;
  await enregistrerLocalement(ownerId, table, nouvelleLigne({
    ...snapshot,
    id: version.entity_id,
    updated_at: new Date().toISOString(),
  }));
  await synchroniserBaseLocale(ownerId, true);
}
