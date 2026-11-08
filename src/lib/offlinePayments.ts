import { utilisateurConnecteId } from "./offlineStore";
import { enregistrerLocalement, lireDonneesLocales, nouvelleLigne } from "./localRepository";
import { synchroniserBaseLocale } from "./syncEngine";
import type { NouveauPaiement } from "./members";
import type { Abonnement, Paiement } from "../types/members";
import type { LigneLocale } from "./localDatabase.types";

export type ResultatEnregistrementPaiement = "enregistre" | "en_attente";

export function construirePaiementHorsLigne(
  userId: string,
  paiement: NouveauPaiement,
  abonnement: Abonnement,
  id: string,
  maintenant: string,
): Paiement & LigneLocale {
  const solde = Number(abonnement.amount_due);
  if (!Number.isFinite(paiement.amount) || paiement.amount <= 0 || paiement.amount > solde) {
    throw new Error(`Le montant doit être supérieur à zéro et ne pas dépasser le solde de ${solde} DT.`);
  }
  return nouvelleLigne({
    id,
    user_id: userId,
    member_id: paiement.member_id,
    subscription_id: paiement.subscription_id,
    amount: paiement.amount,
    paid_at: `${paiement.paid_at}T12:00:00+01:00`,
    recorded_at: maintenant,
    method: paiement.method,
    created_by: userId,
    updated_by: userId,
    updated_at: maintenant,
  });
}

export async function enregistrerPaiementHorsLigne(
  paiement: NouveauPaiement,
): Promise<ResultatEnregistrementPaiement> {
  const userId = await utilisateurConnecteId();
  const donnees = await lireDonneesLocales(userId);
  const abonnement = donnees.abonnements.find((item) =>
    item.id === paiement.subscription_id && item.member_id === paiement.member_id,
  );
  if (!abonnement) throw new Error("L’abonnement sélectionné est introuvable dans les données locales.");

  const ligne = construirePaiementHorsLigne(
    userId,
    paiement,
    abonnement,
    crypto.randomUUID(),
    new Date().toISOString(),
  );
  await enregistrerLocalement(userId, "payments", ligne);

  if (navigator.onLine) {
    void synchroniserBaseLocale(userId).catch(() => undefined);
    return "enregistre";
  }
  return "en_attente";
}

export interface ResultatSynchronisationPaiements {
  synchronises: number;
  enAttente: number;
  erreur: unknown | null;
}

let synchronisationPaiements: Promise<ResultatSynchronisationPaiements> | null = null;

export function synchroniserPaiementsEnAttente(): Promise<ResultatSynchronisationPaiements> {
  if (synchronisationPaiements) return synchronisationPaiements;
  synchronisationPaiements = (async () => {
    if (!navigator.onLine) return { synchronises: 0, enAttente: 0, erreur: null };
    const userId = await utilisateurConnecteId();
    try {
      await synchroniserBaseLocale(userId, true);
      return { synchronises: 0, enAttente: 0, erreur: null };
    } catch (erreur: unknown) {
      const { compterOutbox } = await import("./localDatabase");
      return { synchronises: 0, enAttente: await compterOutbox(userId), erreur };
    }
  })().finally(() => {
    synchronisationPaiements = null;
  });
  return synchronisationPaiements;
}
