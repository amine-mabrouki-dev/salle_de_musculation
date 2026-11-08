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
    const { data, error } = await supabase
      .from("member_history")
      .select("id,entity_table,entity_id,previous_payload,user_id,changed_at")
      .eq("gym_id", gymId)
      .gte("changed_at", depuis)
      .order("changed_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    return (data ?? []).flatMap((record) => {
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
