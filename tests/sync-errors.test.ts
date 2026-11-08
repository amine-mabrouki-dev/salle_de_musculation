import { describe, expect, it } from "vitest";
import { messageErreurSynchronisation } from "../src/lib/syncErrors";

describe("messages de configuration de synchronisation", () => {
  it("explique comment configurer les colonnes Supabase manquantes", () => {
    expect(messageErreurSynchronisation(new Error('column sections.updated_at does not exist')))
      .toContain("exécutez supabase/migrations/010_sync.sql");
  });

  it("garde le message des autres erreurs", () => {
    expect(messageErreurSynchronisation(new Error("Réseau indisponible")))
      .toBe("Réseau indisponible");
  });

  it("affiche les détails structurés d’une erreur Supabase", () => {
    expect(messageErreurSynchronisation({
      code: "23503",
      message: "insert or update violates foreign key constraint",
      details: "Key (tariff_id)=(...) is not present in table tariffs.",
      hint: "Check the referenced tariff.",
    })).toBe(
      "insert or update violates foreign key constraint — Key (tariff_id)=(...) is not present in table tariffs. — Indice : Check the referenced tariff. — Code : 23503",
    );
  });

  it("garde une erreur passée directement sous forme de chaîne", () => {
    expect(messageErreurSynchronisation("Réseau indisponible"))
      .toBe("Réseau indisponible");
  });

  it("explique clairement le refus d’un abonnement qui chevauche une période existante", () => {
    expect(messageErreurSynchronisation({
      code: "23P01",
      message: "conflicting key value violates exclusion constraint",
    })).toContain("chevauche une autre période");
  });

  it("remplace l’erreur technique d’UUID par un message compréhensible", () => {
    expect(messageErreurSynchronisation({
      code: "22P02",
      message: 'invalid input syntax for type uuid: "subscription:legacy"',
    })).toContain("Identifiant invalide");
  });
});
