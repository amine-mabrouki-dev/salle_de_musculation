import { describe, expect, it } from "vitest";
import {
  ajouterJoursAbonnement,
  calculerProfit,
  calculerResteAPayer,
  calculerSeuilRentabilite,
  resteAbonnementsMois,
  valeurAbonnementsMois,
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

describe("valeur des abonnements enregistrés", () => {
  it("compte les prix au mois de création locale et inclut les abonnements non payés", () => {
    expect(valeurAbonnementsMois([
      { id: "subscription-1", price: 45, start_date: "2026-10-01", local_created_at: "2026-11-09T12:00:00.000Z" },
      { id: "subscription-1", price: 45, start_date: "2026-10-01", local_created_at: "2026-11-09T12:00:00.000Z" },
      { price: "320.125", start_date: "2026-11-01", local_created_at: "2026-11-09T13:00:00.000Z" },
      { id: "demo-subscription", member_id: "demo-1", price: 500, start_date: "2026-11-01", local_created_at: "2026-11-09T13:00:00.000Z" },
      { price: 99, start_date: "2026-11-01", local_created_at: "2026-12-01T00:30:00.000Z" },
    ], "2026-11", new Set(["demo-1"]))).toBe(365.125);
  });

  it("utilise le début de période pour les anciens abonnements et ignore les supprimés", () => {
    expect(valeurAbonnementsMois([
      { price: 40, start_date: "2026-11-01" },
      { price: 30, start_date: "2026-11-01", deleted_at: "2026-11-05T00:00:00.000Z" },
    ], "2026-11")).toBe(40);
  });

  it("additionne le reste à payer des abonnements du mois, sans doublons ni données démo", () => {
    expect(resteAbonnementsMois([
      { id: "sub-1", member_id: "member-1", price: 45, amount_due: 20, start_date: "2026-11-01" },
      { id: "sub-1", member_id: "member-1", price: 45, amount_due: 20, start_date: "2026-11-01" },
      { id: "sub-demo", member_id: "demo-1", price: 100, amount_due: 100, start_date: "2026-11-02" },
      { id: "sub-old", member_id: "member-2", price: 70, amount_due: 30, start_date: "2026-10-31" },
    ], "2026-11", new Set(["demo-1"]))).toBe(20);
  });
});
