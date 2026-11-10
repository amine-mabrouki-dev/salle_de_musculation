import { describe, expect, it } from "vitest";
import {
  versionsDuJourTunis,
  versionsQuotidiennesUniques,
  type VersionMembre,
} from "../src/lib/memberHistory";

function version(
  id: string,
  entityTable: VersionMembre["entity_table"],
  entityId: string,
  changedAt: string,
): VersionMembre {
  return {
    id,
    entity_table: entityTable,
    entity_id: entityId,
    previous_payload: {
      id: entityId,
      updated_at: changedAt,
      deleted_at: null,
    },
    user_id: "manager-1",
    changed_at: changedAt,
  };
}

describe("historique quotidien des membres", () => {
  it("garde le premier état de chaque membre et abonnement par jour tunisien", () => {
    const premiereModification = version("member-early", "members", "member-1", "2026-11-09T09:00:00Z");
    const versions = versionsQuotidiennesUniques([
      version("member-late", "members", "member-1", "2026-11-09T12:00:00Z"),
      version("subscription", "subscriptions", "subscription-1", "2026-11-09T12:30:00Z"),
      version("next-day", "members", "member-1", "2026-11-09T23:30:00Z"),
      premiereModification,
    ]);

    expect(versions).toHaveLength(3);
    expect(versions).toContain(premiereModification);
    expect(versions.map((item) => item.id)).not.toContain("member-late");
    expect(versions.map((item) => item.id)).toContain("next-day");
    expect(versions.map((item) => item.id)).toContain("subscription");
  });

  it("affiche uniquement les versions de la date actuelle en Tunisie", () => {
    const aujourdHui = version("today", "members", "member-1", "2026-11-09T23:30:00Z");
    const hier = version("yesterday", "members", "member-1", "2026-11-09T00:30:00Z");

    expect(versionsDuJourTunis(
      [aujourdHui, hier],
      new Date("2026-11-10T07:00:00+01:00"),
    )).toEqual([aujourdHui]);
  });
});
