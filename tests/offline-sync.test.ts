import { describe, expect, it } from "vitest";
import type { EntreeOutbox, LigneLocale, TableSynchronisee } from "../src/lib/localDatabase.types";
import { construirePaiementHorsLigne } from "../src/lib/offlinePayments";
import { construireAnnulationDepense } from "../src/lib/expenseCancellations";
import {
  ajouterPaiementUnique,
  calculerResumeFinancierMensuel,
  resteAbonnement,
  totalEncaissementsDuMois,
  totalPaiements,
} from "../src/lib/financialLedger";
import {
  delaiNouvelleTentative,
  envoyerOutboxDansOrdre,
  conserverDateCreationLocaleAbonnement,
  payloadPourSynchronisation,
  vainqueurConflit,
} from "../src/lib/syncQueue";

function outboxEntry(
  id: string,
  table: TableSynchronisee,
  payload: LigneLocale,
  createdAt: string,
): EntreeOutbox {
  return {
    id,
    owner_id: "user-1",
    entity_id: payload.id,
    table_name: table,
    operation: "upsert",
    payload,
    created_at: createdAt,
    attempts: 0,
    last_error: null,
  };
}

function memoireOutbox(entries: EntreeOutbox[]) {
  return {
    entries,
    async lire() {
      return [...this.entries].sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async acquitter(_ownerId: string, id: string) {
      this.entries = this.entries.filter((entry) => entry.id !== id);
    },
    async echouer(_ownerId: string, id: string, error: string) {
      this.entries = this.entries.map((entry) =>
        entry.id === id ? { ...entry, attempts: entry.attempts + 1, last_error: error } : entry,
      );
    },
  };
}

describe("synchronisation de l’outbox", () => {
  it("retire les champs absents du schéma Supabase des anciens payloads d’abonnement", () => {
    const payload = {
      id: "subscription-id",
      updated_at: "2026-11-08T12:00:00.000Z",
      deleted_at: null,
      created_at: "2026-11-08T11:00:00.000Z",
      local_created_at: "2026-11-08T11:00:00.000Z",
    };

    expect(payloadPourSynchronisation("subscriptions", payload)).not.toHaveProperty("created_at");
    expect(payloadPourSynchronisation("subscriptions", payload)).not.toHaveProperty("local_created_at");
    expect(payloadPourSynchronisation("members", payload)).toHaveProperty("created_at");
  });

  describe("encaissements mensuels", () => {
    it("compte une seule fois les paiements du mois tunisien, bornes incluses, sans données annulées, supprimées ou démo", () => {
      const paiement = {
        id: "payment-1",
        member_id: "member-1",
        amount: "12.345",
        paid_at: "2026-11-01T00:00:00+01:00",
      };
      expect(totalEncaissementsDuMois([
        paiement,
        { ...paiement, amount: 99 },
        { ...paiement, id: "payment-2", amount: 20, paid_at: "2026-11-30T23:59:59+01:00" },
        { ...paiement, id: "payment-3", paid_at: "2026-10-31T23:59:59+01:00" },
        { ...paiement, id: "payment-4", paid_at: "2026-12-01T00:00:00+01:00" },
        { ...paiement, id: "payment-5", cancelled_at: "2026-11-10T00:00:00Z" },
        { ...paiement, id: "payment-6", deleted_at: "2026-11-10T00:00:00Z" },
        { ...paiement, id: "payment-7", member_id: "demo-1" },
      ], "2026-11", new Set(["demo-1"]))).toBe(32.345);
    });

    it("applique les mêmes règles aux encaissements, dépenses et bénéfice mensuels", () => {
      const paiement = {
        id: "payment-1",
        member_id: "member-1",
        amount: "407.000",
        paid_at: "2026-11-30T22:30:00Z",
      };
      const depense = {
        id: "expense-1",
        label: "Loyer",
        amount: "305.000",
        spent_at: "2026-11-01T00:30:00Z",
      };

      expect(calculerResumeFinancierMensuel([
        paiement,
        { ...paiement, amount: 99 },
        { ...paiement, id: "payment-demo", member_id: "demo-1", amount: 50 },
        { ...paiement, id: "payment-cancelled", amount: 80, cancelled_at: "2026-11-15T00:00:00Z" },
      ], [
        depense,
        { ...depense, amount: 99 },
        { ...depense, id: "expense-demo", label: "[DÉMO] Équipement", amount: 20 },
        { ...depense, id: "expense-deleted", label: "Ancienne dépense", amount: 10, deleted_at: "2026-11-15T00:00:00Z" },
      ], "2026-11", new Set(["demo-1"]))).toEqual({
        encaissements: 407,
        depenses: 305,
        benefice: 102,
      });
    });
  });

  it("conserve localement la date de création d’un abonnement absente du serveur", () => {
    const local = {
      id: "50000000-0000-4000-8000-000000000001",
      updated_at: "2026-11-08T10:00:00.000Z",
      deleted_at: null,
      local_created_at: "2026-11-08T09:00:00.000Z",
    };
    const distante = {
      id: local.id,
      updated_at: "2026-11-08T10:00:00.000Z",
      deleted_at: null,
    };

    expect(conserverDateCreationLocaleAbonnement("subscriptions", local, distante))
      .toHaveProperty("local_created_at", local.local_created_at);
    expect(conserverDateCreationLocaleAbonnement("payments", local, distante)).toBe(distante);
  });

  it("reprend après une erreur avec le même identifiant sans créer de doublon", async () => {
    const row = {
      id: "50000000-0000-4000-8000-000000000001",
      updated_at: "2026-11-08T10:00:00.000Z",
      deleted_at: null,
    };
    const store = memoireOutbox([outboxEntry("queue-1", "payments", row, row.updated_at)]);
    const serveur = new Map<string, LigneLocale>();
    const identifiantsEnvoyes: string[] = [];
    let echouerUneFois = true;
    const envoyer = async (entry: EntreeOutbox) => {
      identifiantsEnvoyes.push(entry.payload.id);
      if (echouerUneFois) {
        echouerUneFois = false;
        throw new Error("Réseau indisponible");
      }
      serveur.set(`${entry.table_name}:${entry.payload.id}`, entry.payload);
    };

    const premier = await envoyerOutboxDansOrdre("user-1", store, envoyer);
    expect(premier.synchronises).toBe(0);
    expect(store.entries[0]?.attempts).toBe(1);
    expect(store.entries[0]?.last_error).toBe("Réseau indisponible");

    const reprise = await envoyerOutboxDansOrdre("user-1", store, envoyer);
    expect(reprise.synchronises).toBe(1);
    expect(store.entries).toHaveLength(0);
    expect(serveur.size).toBe(1);
    expect(identifiantsEnvoyes).toEqual([row.id, row.id]);

    await envoyerOutboxDansOrdre("user-1", store, envoyer);
    expect(serveur.size).toBe(1);
  });

  it("applique un délai de reprise croissant et départage les conflits avec updated_at", () => {
    expect(delaiNouvelleTentative(1)).toBe(1_000);
    expect(delaiNouvelleTentative(2)).toBe(2_000);
    expect(delaiNouvelleTentative(10)).toBe(60_000);
    expect(vainqueurConflit("2026-11-08T10:00:01.000Z", "2026-11-08T10:00:00.000Z")).toBe("local");
    expect(vainqueurConflit("2026-11-08T10:00:00.000Z", "2026-11-08T10:00:01.000Z")).toBe("remote");
    expect(vainqueurConflit("2026-11-08T10:00:00+01:00", "2026-11-08T09:30:00.000Z")).toBe("remote");
  });

  it("fusionne les paiements hors ligne de deux appareils sans doublon ni perte", async () => {
    const subscription = {
      id: "subscription-1",
      user_id: "manager-1",
      member_id: "member-1",
      section_id: "section-1",
      tariff_id: "tariff-1",
      duration: "monthly" as const,
      start_date: "2026-11-01",
      end_date: "2026-12-01",
      price: 45,
      amount_due: 45,
      status: "actif" as const,
    };
    const paiementAppareilA = construirePaiementHorsLigne("manager-1", {
      member_id: "member-1",
      subscription_id: "subscription-1",
      amount: 25,
      method: "especes",
      paid_at: "2026-11-08",
    }, subscription, "payment-device-a", "2026-11-08T10:00:00.000Z");
    const paiementAppareilB = construirePaiementHorsLigne("assistant-1", {
      member_id: "member-1",
      subscription_id: "subscription-1",
      amount: 20,
      method: "virement",
      paid_at: "2026-11-08",
    }, subscription, "payment-device-b", "2026-11-08T10:01:00.000Z");
    const fileAppareilA = memoireOutbox([
      outboxEntry("queue-a", "payments", paiementAppareilA, paiementAppareilA.updated_at),
    ]);
    const fileAppareilB = memoireOutbox([
      outboxEntry("queue-b", "payments", paiementAppareilB, paiementAppareilB.updated_at),
    ]);
    let serveur: typeof paiementAppareilA[] = [];
    const envoyer = async (entry: EntreeOutbox) => {
      serveur = ajouterPaiementUnique(serveur, entry.payload as typeof paiementAppareilA);
    };

    await envoyerOutboxDansOrdre("manager-1", fileAppareilA, envoyer);
    await envoyerOutboxDansOrdre("assistant-1", fileAppareilB, envoyer);
    await envoyerOutboxDansOrdre("assistant-1", fileAppareilB, envoyer);

    expect(serveur).toHaveLength(2);
    expect(totalPaiements(serveur)).toBe(45);
    expect(resteAbonnement(45, serveur)).toBe(0);
    expect(fileAppareilA.entries).toHaveLength(0);
    expect(fileAppareilB.entries).toHaveLength(0);
  });

  it("conserve les champs d’audit des paiements lors de leur création hors ligne", () => {
    const subscription = {
      id: "subscription-1",
      user_id: "user-1",
      member_id: "member-1",
      section_id: "section-1",
      tariff_id: "tariff-1",
      duration: "monthly" as const,
      start_date: "2026-11-01",
      end_date: "2026-12-01",
      price: 45,
      amount_due: 45,
      status: "actif" as const,
    };
    const payment = construirePaiementHorsLigne("user-1", {
        member_id: "member-1",
        subscription_id: "subscription-1",
        amount: 20,
        method: "especes",
        paid_at: "2026-11-08",
      }, subscription, "payment-client-uuid", "2026-11-08T10:00:00.000Z");

    expect(payment.id).toBe("payment-client-uuid");
    expect(payment.created_by).toBe("user-1");
    expect(payment).not.toHaveProperty("previous_amount_due");
  });

  it("crée une annulation de dépense append-only avec son motif et son auteur", () => {
    const cancellation = construireAnnulationDepense(
      "manager-1",
      "expense-1",
      "Erreur de saisie",
      "cancellation-client-uuid",
      "2026-11-08T10:00:00.000Z",
    );

    expect(cancellation).toMatchObject({
      id: "cancellation-client-uuid",
      user_id: "manager-1",
      expense_id: "expense-1",
      type: "annulation",
      reason: "Erreur de saisie",
      cancelled_by: "manager-1",
      created_by: "manager-1",
      updated_by: "manager-1",
      cancelled_at: "2026-11-08T10:00:00.000Z",
    });
    expect(() => construireAnnulationDepense("manager-1", "expense-1", "  "))
      .toThrow("Le motif d’annulation doit contenir entre 1 et 500 caractères.");
  });
});
