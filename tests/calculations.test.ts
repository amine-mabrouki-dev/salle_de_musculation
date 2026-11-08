import { describe, expect, it } from "vitest";
import {
  ajouterJoursAbonnement,
  calculerProfit,
  calculerResteAPayer,
  calculerSeuilRentabilite,
  statutAbonnement,
} from "../src/lib/calculations";

describe("statut d’abonnement", () => {
  it("marque comme expirée une fin antérieure à aujourd’hui", () => {
    expect(statutAbonnement("2026-11-02", "2026-11-03")).toBe("expire");
  });

  it.each([0, 7])("marque une échéance dans %i jour(s) comme bientôt", (jours) => {
    const dateFin = new Date("2026-11-03T00:00:00Z");
    dateFin.setUTCDate(dateFin.getUTCDate() + jours);
    expect(statutAbonnement(dateFin.toISOString().slice(0, 10), "2026-11-03")).toBe("bientot");
  });

  it("marque une échéance à plus de sept jours comme active", () => {
    expect(statutAbonnement("2026-11-11", "2026-11-03")).toBe("actif");
  });
});

describe("dates de fin d’abonnement", () => {
  it("ajoute exactement 30 jours pour un abonnement mensuel", () => {
    expect(ajouterJoursAbonnement("2026-01-31", "monthly")).toBe("2026-03-02");
  });

  it("ajoute exactement 365 jours pour un abonnement annuel, même une année bissextile", () => {
    expect(ajouterJoursAbonnement("2024-02-29", "annual")).toBe("2025-02-28");
  });
});

describe("reste à payer", () => {
  it("soustrait un paiement partiel et garde trois décimales", () => {
    expect(calculerResteAPayer(45, 12.345)).toBe(32.655);
  });

  it("ramène à zéro un paiement complet ou supérieur au solde", () => {
    expect(calculerResteAPayer(35, 35)).toBe(0);
    expect(calculerResteAPayer(35, 40)).toBe(0);
  });
});

describe("profit et seuil de rentabilité", () => {
  it("calcule le profit encaissé moins les dépenses", () => {
    expect(calculerProfit(1250.5, 400.25)).toBe(850.25);
    expect(calculerProfit(100, 150)).toBe(-50);
  });

  it("arrondit au nombre d’abonnés supérieur à partir du tarif moyen", () => {
    expect(calculerSeuilRentabilite(401, [40, 50])).toBe(9);
  });

  it("renvoie null quand aucun tarif mensuel positif n’est disponible", () => {
    expect(calculerSeuilRentabilite(400, [0])).toBeNull();
  });
});
