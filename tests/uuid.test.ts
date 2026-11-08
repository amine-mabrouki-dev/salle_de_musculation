import { describe, expect, it } from "vitest";
import {
  cartographierIdentifiantsInvalides,
  isUuid,
  remplacerReferencesLegacy,
  verifierIdentifiantsLigne,
} from "../src/lib/uuid";

describe("validation des identifiants UUID", () => {
  it("reconnaît les UUID v4 et refuse les identifiants préfixés", () => {
    expect(isUuid("10000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isUuid("subscription:legacy")).toBe(false);
  });

  it("convertit un ancien abonnement et conserve son lien vers le membre", () => {
    const membreAncien = "member:legacy";
    const abonnementAncien = "subscription:legacy";
    const cartographie = cartographierIdentifiantsInvalides([
      { table: "members", id: membreAncien },
      { table: "subscriptions", id: abonnementAncien },
    ]);

    const abonnement = remplacerReferencesLegacy("subscriptions", {
      id: abonnementAncien,
      member_id: membreAncien,
      section_id: "30000000-0000-4000-8000-000000000001",
      tariff_id: "40000000-0000-4000-8000-000000000001",
    }, cartographie);

    expect(abonnement.id).toBe(cartographie.get("subscriptions")?.get(abonnementAncien));
    expect(abonnement.member_id).toBe(cartographie.get("members")?.get(membreAncien));
    expect(isUuid(abonnement.id)).toBe(true);
    expect(isUuid(abonnement.member_id)).toBe(true);
  });

  it("refuse clairement un identifiant invalide avant une écriture", () => {
    expect(() => verifierIdentifiantsLigne({ id: "payment:legacy" })).toThrow("Identifiant invalide");
  });
});
