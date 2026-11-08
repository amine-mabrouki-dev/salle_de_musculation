import type { Abonnement, CategorieDepense, Membre, Paiement, SalleSection, Tarif } from "../types/members";
import {
  compterOutbox,
  ecrireMetaLocale,
  enregistrerLigneLocale,
  enregistrerPlusieursLignesLocales,
  lireMetaLocale,
  lireTableLocale,
  type LigneLocale,
  type OperationOutbox,
  type TableSynchronisee,
} from "./localDatabase";
import { supabase } from "./supabase";
import { synchroniserBaseLocale } from "./syncEngine";
import { chargerAccesSalle } from "./gymAccess";
import { resteAbonnement } from "./financialLedger";
import { verifierIdentifiantsLigne } from "./uuid";

export interface DepenseLocale extends LigneLocale {
  user_id: string;
  label: string;
  amount: number | string;
  category: CategorieDepense;
  section_id: string | null;
  spent_at: string;
}

export interface AnnulationLocale extends LigneLocale {
  user_id: string;
  type: "annulation";
  reason: string;
  cancelled_by: string;
  cancelled_at: string;
  payment_id?: string;
  expense_id?: string;
}

export interface DonneesLocales {
  sections: SalleSection[];
  tarifs: Tarif[];
  membres: Membre[];
  abonnements: Abonnement[];
  paiements: Paiement[];
  depenses: DepenseLocale[];
  annulationsPaiements: AnnulationLocale[];
  annulationsDepenses: AnnulationLocale[];
}

const tables: TableSynchronisee[] = [
  "sections", "tariffs", "members", "subscriptions", "payments", "expenses",
  "payment_cancellations", "expense_cancellations",
];

function horodatage(): string {
  return new Date().toISOString();
}

export function nouvelleLigne<T>(
  valeurs: T & { id?: string; updated_at?: string; deleted_at?: string | null },
): T & LigneLocale {
  const updatedAt = horodatage();
  return {
    ...valeurs,
    id: typeof valeurs.id === "string" ? valeurs.id : crypto.randomUUID(),
    updated_at: typeof valeurs.updated_at === "string" ? valeurs.updated_at : updatedAt,
    deleted_at: typeof valeurs.deleted_at === "string" ? valeurs.deleted_at : null,
  };
}

export async function synchroniserAuPremierChargement(ownerId: string): Promise<void> {
  if (!navigator.onLine || !supabase) return;
  if (await lireMetaLocale(ownerId, "last_sync:completed")) return;
  try {
    await synchroniserBaseLocale(ownerId);
  } catch (error: unknown) {
    const local = await Promise.all(tables.map((table) => lireTableLocale(ownerId, table)));
    if (local.every((rows) => rows.length === 0)) throw error;
  }
}

export async function lireDonneesLocales(ownerId: string): Promise<DonneesLocales> {
  const [sections, tarifs, membres, abonnementsBruts, paiementsBruts, depensesBrutes, annulationsPaiements, annulationsDepenses] = await Promise.all([
    lireTableLocale<SalleSection & LigneLocale>(ownerId, "sections"),
    lireTableLocale<Tarif & LigneLocale>(ownerId, "tariffs"),
    lireTableLocale<Membre & LigneLocale>(ownerId, "members"),
    lireTableLocale<Abonnement & LigneLocale>(ownerId, "subscriptions"),
    lireTableLocale<Paiement & LigneLocale>(ownerId, "payments"),
    lireTableLocale<DepenseLocale>(ownerId, "expenses"),
    lireTableLocale<AnnulationLocale>(ownerId, "payment_cancellations"),
    lireTableLocale<AnnulationLocale>(ownerId, "expense_cancellations"),
  ]);
  const annulationsPaiementsActives = annulationsPaiements.filter((row) => row.deleted_at === null);
  const annulationsDepensesActives = annulationsDepenses.filter((row) => row.deleted_at === null);
  const depenseAnnuleeIds = new Set(annulationsDepensesActives.map((row) => row.expense_id));
  const paiements = paiementsBruts
    .filter((row) => row.deleted_at === null)
    .map((row) => {
      const annulation = annulationsPaiementsActives.find((item) => item.payment_id === row.id);
      return {
        ...row,
        cancelled_at: annulation?.cancelled_at ?? null,
        cancellation_reason: annulation?.reason ?? null,
      };
    });
  const paiementsComptabilises = paiements.filter((row) => !row.cancelled_at);
  const abonnements = abonnementsBruts
    .filter((row) => row.deleted_at === null)
    .map((row) => ({
      ...row,
      amount_due: resteAbonnement(
        row.price,
        paiementsComptabilises.filter((payment) => payment.subscription_id === row.id),
      ),
    }));
  const depenses = depensesBrutes
    .filter((row) => row.deleted_at === null && !depenseAnnuleeIds.has(row.id));
  return {
    sections: sections.filter((row) => row.deleted_at === null),
    tarifs: tarifs.filter((row) => row.deleted_at === null),
    membres: membres.filter((row) => row.deleted_at === null),
    abonnements,
    paiements,
    depenses,
    annulationsPaiements: annulationsPaiementsActives,
    annulationsDepenses: annulationsDepensesActives,
  };
}

export async function enregistrerLocalement(
  ownerId: string,
  table: TableSynchronisee,
  row: LigneLocale,
  operation: OperationOutbox = "upsert",
): Promise<void> {
  verifierIdentifiantsLigne(row);
  const access = await chargerAccesSalle(ownerId);
  await enregistrerLigneLocale(ownerId, table, attribuerAuteur(ownerId, access.gymId, row), operation);
  synchroniserEnArrierePlan(ownerId);
}

export async function enregistrerMutationsLocalement(
  ownerId: string,
  items: { table: TableSynchronisee; row: LigneLocale; operation?: OperationOutbox }[],
): Promise<void> {
  items.forEach((item) => verifierIdentifiantsLigne(item.row));
  const access = await chargerAccesSalle(ownerId);
  await enregistrerPlusieursLignesLocales(ownerId, items.map((item) => ({
    ...item,
    row: attribuerAuteur(ownerId, access.gymId, item.row),
  })));
  synchroniserEnArrierePlan(ownerId);
}

function attribuerAuteur(ownerId: string, gymId: string, row: LigneLocale): LigneLocale {
  const ligne = { ...row } as LigneLocale & Record<string, unknown>;
  if ("amount_due" in ligne) delete ligne.amount_due;
  if ("status" in ligne && "member_id" in ligne && "end_date" in ligne) delete ligne.status;
  if ("renew_on_payment" in ligne) delete ligne.renew_on_payment;
  return {
    ...ligne,
    gym_id: gymId,
    created_by: ligne.created_by ?? ("user_id" in ligne && typeof ligne.user_id === "string" ? ligne.user_id : ownerId),
    updated_by: ownerId,
  };
}

function synchroniserEnArrierePlan(ownerId: string): void {
  if (!navigator.onLine) return;
  void synchroniserBaseLocale(ownerId).catch(async (error: unknown) => {
    const pending = await compterOutbox(ownerId).catch(() => 0);
    const lastSync = await lireMetaLocale(ownerId, "last_sync:completed").catch(() => null);
    window.dispatchEvent(new CustomEvent("gym4you-sync-state-changed", {
      detail: {
        status: "erreur",
        pending,
        error: error instanceof Error ? error.message : String(error),
        storageWarning: null,
        lastSync,
      },
    }));
  });
}

export async function supprimerLocalement(
  ownerId: string,
  table: TableSynchronisee,
  row: LigneLocale,
): Promise<void> {
  await enregistrerLocalement(ownerId, table, { ...row, deleted_at: horodatage(), updated_at: horodatage() }, "delete");
}

export async function avancerCurseurLocal(ownerId: string, key: string, value: string): Promise<void> {
  await ecrireMetaLocale(ownerId, key, value);
}

export function tablesSynchronisees(): readonly TableSynchronisee[] {
  return tables;
}
