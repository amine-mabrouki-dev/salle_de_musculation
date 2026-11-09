import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DonneesLocales } from "../src/lib/localRepository";
import type { Abonnement } from "../src/types/members";

vi.mock("../src/lib/offlineStore", () => ({
  utilisateurConnecteId: vi.fn(async () => "10000000-0000-4000-8000-000000000001"),
}));

vi.mock("../src/lib/localRepository", () => ({
  lireDonneesLocales: vi.fn(),
  nouvelleLigne: vi.fn((row) => ({ ...row })),
  enregistrerLocalement: vi.fn(),
}));

import { lireDonneesLocales, enregistrerLocalement } from "../src/lib/localRepository";
import {
  calculerDebutRenouvellement,
  creerOuRenouvelerAbonnement,
} from "../src/lib/subscriptions";

const membreId = "20000000-0000-4000-8000-000000000001";
const musculationId = "30000000-0000-4000-8000-000000000001";
const kickboxingId = "30000000-0000-4000-8000-000000000002";
const tarifMusculationId = "40000000-0000-4000-8000-000000000001";
const tarifKickboxingId = "40000000-0000-4000-8000-000000000002";
let donnees: DonneesLocales;

function nouvelleDemande(sectionId = musculationId, tarifId = tarifMusculationId, requestId = crypto.randomUUID()) {
  return {
    member_id: membreId,
    section_id: sectionId,
    tariff_id: tarifId,
    duration: "monthly" as const,
    subscription_id: null,
    confirm_annual_estimate: false,
    manual_price: null,
    client_request_id: requestId,
  };
}

function aujourdhui(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function abonnement(id: string, startDate: string, endDate: string, sectionId = musculationId): Abonnement {
  return {
    id,
    member_id: membreId,
    section_id: sectionId,
    tariff_id: sectionId === musculationId ? tarifMusculationId : tarifKickboxingId,
    duration: "monthly",
    start_date: startDate,
    end_date: endDate,
    price: 45,
    amount_due: 45,
    status: "actif",
    deleted_at: null,
  };
}

function reinitialiserDonnees(abonnements: Abonnement[] = []): void {
  donnees = {
    membres: [{
      id: membreId,
      full_name: "Amine",
      phone: null,
      notes: null,
      created_at: "2026-01-01T00:00:00.000Z",
    }],
    abonnements,
    sections: [
      { id: musculationId, name: "Musculation", coach_name: null, coach_phone: null, is_active: true },
      { id: kickboxingId, name: "Kick-boxing", coach_name: null, coach_phone: null, is_active: true },
    ],
    tarifs: [
      { id: tarifMusculationId, section_id: musculationId, category: "adulte", monthly_price: 45, annual_price: null },
      { id: tarifKickboxingId, section_id: kickboxingId, category: "adulte", monthly_price: 45, annual_price: null },
    ],
    paiements: [],
    depenses: [],
    annulationsPaiements: [],
    annulationsDepenses: [],
  };
  vi.mocked(lireDonneesLocales).mockImplementation(async () => donnees);
  vi.mocked(enregistrerLocalement).mockImplementation(async (_ownerId, table, row) => {
    if (table === "subscriptions") donnees.abonnements.push(row as Abonnement);
  });
}

describe("création et renouvellement d’abonnement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reinitialiserDonnees();
  });

  it("renouvelle au lendemain de la fin si l’abonnement est encore valide", () => {
    expect(calculerDebutRenouvellement("2026-11-05", { end_date: "2026-11-10" })).toBe("2026-11-11");
  });

  it("repart d’aujourd’hui si l’abonnement est terminé", () => {
    expect(calculerDebutRenouvellement("2026-11-03", { end_date: "2026-11-02" })).toBe("2026-11-03");
  });

  it("crée après la date de fin passée, à partir d’aujourd’hui", async () => {
    const today = aujourdhui();
    const expiredEnd = new Date(`${today}T00:00:00Z`);
    expiredEnd.setUTCDate(expiredEnd.getUTCDate() - 1);
    const initial = abonnement(
      "50000000-0000-4000-8000-000000000001",
      "2026-01-01",
      expiredEnd.toISOString().slice(0, 10),
    );
    reinitialiserDonnees([initial]);
    const demande = {
      ...nouvelleDemande(musculationId, tarifMusculationId),
      subscription_id: initial.id,
    };

    await creerOuRenouvelerAbonnement(demande);

    expect(donnees.abonnements).toHaveLength(2);
    expect(donnees.abonnements.find((item) => item.id === demande.client_request_id)?.start_date).toBe(today);
  });

  it("ne crée qu’une seule ligne lors de deux validations simultanées de la même intention", async () => {
    const demande = nouvelleDemande();
    await Promise.all([
      creerOuRenouvelerAbonnement(demande),
      creerOuRenouvelerAbonnement(demande),
    ]);

    expect(donnees.abonnements).toHaveLength(1);
    expect(donnees.abonnements[0].id).toBe(demande.client_request_id);
    expect(Date.parse(donnees.abonnements[0].local_created_at ?? "")).not.toBeNaN();
  });

  it("refuse la seconde création simultanée qui chevauche la première sur la même activité", async () => {
    const resultats = await Promise.allSettled([
      creerOuRenouvelerAbonnement(nouvelleDemande()),
      creerOuRenouvelerAbonnement(nouvelleDemande()),
    ]);

    expect(resultats.filter((resultat) => resultat.status === "fulfilled")).toHaveLength(1);
    const refus = resultats.find((resultat) => resultat.status === "rejected");
    expect(refus).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "Cet abonnement existe déjà pour cette activité." }),
    });
    expect(donnees.abonnements).toHaveLength(1);
  });

  it("crée deux abonnements pour deux activités différentes du même membre", async () => {
    await Promise.all([
      creerOuRenouvelerAbonnement(nouvelleDemande(musculationId, tarifMusculationId)),
      creerOuRenouvelerAbonnement(nouvelleDemande(kickboxingId, tarifKickboxingId)),
    ]);

    expect(donnees.abonnements).toHaveLength(2);
    expect(donnees.abonnements.map((item) => item.section_id).sort()).toEqual([kickboxingId, musculationId].sort());
  });

  it("enchaîne trois renouvellements sans chevauchement en prolongeant chaque fin", async () => {
    const today = aujourdhui();
    const firstEnd = new Date(`${today}T00:00:00Z`);
    firstEnd.setUTCDate(firstEnd.getUTCDate() + 10);
    const endDate = firstEnd.toISOString().slice(0, 10);
    const initial = abonnement("50000000-0000-4000-8000-000000000001", today, endDate);
    reinitialiserDonnees([initial]);

    let source = initial;
    for (let index = 0; index < 3; index += 1) {
      const requestId = crypto.randomUUID();
      await creerOuRenouvelerAbonnement({
        ...nouvelleDemande(musculationId, tarifMusculationId, requestId),
        subscription_id: source.id,
      });
      source = donnees.abonnements.find((item) => item.id === requestId)!;
    }

    expect(donnees.abonnements).toHaveLength(4);
    const periodes = donnees.abonnements.sort((a, b) => a.start_date.localeCompare(b.start_date));
    for (let index = 1; index < periodes.length; index += 1) {
      const lendemain = new Date(`${periodes[index - 1].end_date}T00:00:00Z`);
      lendemain.setUTCDate(lendemain.getUTCDate() + 1);
      expect(periodes[index].start_date).toBe(lendemain.toISOString().slice(0, 10));
    }
    expect(periodes.at(-1)?.end_date).toBe(source.end_date);
  });

  it("refuse un identifiant non UUID avant de lire les données ou d’écrire", async () => {
    expect(() => creerOuRenouvelerAbonnement(
      nouvelleDemande(musculationId, tarifMusculationId, "subscription:legacy"),
    )).toThrow("Identifiant invalide");
    expect(lireDonneesLocales).not.toHaveBeenCalled();
    expect(enregistrerLocalement).not.toHaveBeenCalled();
  });
});
