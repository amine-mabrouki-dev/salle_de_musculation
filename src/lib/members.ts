import type { MembreComplet, SalleSection, Tarif } from "../types/members";
import { utilisateurConnecteId } from "./offlineStore";
import { enregistrerPaiementHorsLigne } from "./offlinePayments";
import {
  enregistrerMutationsLocalement,
  lireDonneesLocales,
  nouvelleLigne,
} from "./localRepository";
import { statutAbonnement } from "./calculations";
import type { LigneLocale, TableSynchronisee } from "./localDatabase";
import { normaliserTexteRecherche } from "./textes";

export interface NouveauMembre {
  full_name: string;
  phone: string;
  section_id: string;
  tariff_id: string;
  duration: "monthly" | "annual";
  start_date: string;
}

export interface ModificationMembre extends NouveauMembre {
  member_id: string;
  subscription_id: string | null;
}

export interface DonneesMembres {
  membres: MembreComplet[];
  sections: SalleSection[];
  tarifs: Tarif[];
}

export async function chargerMembres(): Promise<DonneesMembres> {
  const userId = await utilisateurConnecteId();
  const { membres, abonnements, paiements, sections, tarifs } = await lireDonneesLocales(userId);
  const aujourdHui = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Tunis" }).format(new Date());
  return {
    membres: membres
      .sort((a, b) => normaliserTexteRecherche(a.full_name).localeCompare(normaliserTexteRecherche(b.full_name), "ar"))
      .map((membre) => ({
        ...membre,
        subscriptions: abonnements
          .filter((abonnement) => abonnement.member_id === membre.id)
          .map((abonnement) => ({
            ...abonnement,
            status: statutAbonnement(abonnement.end_date, aujourdHui),
          })),
        payments: paiements.filter((paiement) => paiement.member_id === membre.id)
          .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)),
      })),
    sections: sections.sort((a, b) => a.name.localeCompare(b.name, "fr")),
    tarifs,
  };
}

export async function creerMembreAvecAbonnement(membre: NouveauMembre): Promise<string> {
  const userId = await utilisateurConnecteId();
  const donnees = await lireDonneesLocales(userId);
  const section = donnees.sections.find((item) => item.id === membre.section_id && item.is_active);
  const tarif = donnees.tarifs.find((item) => item.id === membre.tariff_id && item.section_id === membre.section_id);
  if (!section || !tarif) throw new Error("La section ou le tarif choisi n’est pas disponible sur cet appareil.");
  const price = membre.duration === "monthly" ? tarif.monthly_price : tarif.annual_price;
  if (price == null) throw new Error("Ce tarif est à définir. Renseignez-le dans Réglages > Activités avant de créer l’abonnement.");
  const memberId = crypto.randomUUID();
  const subscriptionId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const montant = Number(price);
  const endDate = ajouterJours(membre.start_date, membre.duration === "annual" ? 365 : 30);
  await enregistrerMutationsLocalement(userId, [
    {
      table: "members",
      row: nouvelleLigne({
        id: memberId,
        user_id: userId,
        full_name: membre.full_name,
        phone: membre.phone,
        notes: null,
        created_at: timestamp,
      }),
    },
    {
      table: "subscriptions",
      row: nouvelleLigne({
        id: subscriptionId,
        user_id: userId,
        member_id: memberId,
        section_id: section.id,
        tariff_id: tarif.id,
        duration: membre.duration,
        start_date: membre.start_date,
        end_date: endDate,
        price: montant,
      }),
    },
  ]);
  return memberId;
}

export async function modifierMembreAvecAbonnement(membre: ModificationMembre): Promise<void> {
  const userId = await utilisateurConnecteId();
  const donnees = await lireDonneesLocales(userId);
  const existant = donnees.membres.find((item) => item.id === membre.member_id);
  if (!existant) throw new Error("Ce membre n’existe pas dans la copie locale.");
  const updatedMember = nouvelleLigne({
    ...existant,
    full_name: membre.full_name,
    phone: membre.phone,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  });
  const mutations: { table: TableSynchronisee; row: LigneLocale; operation?: "upsert" | "delete" }[] = [
    { table: "members", row: updatedMember },
  ];
  if (membre.subscription_id) {
    const subscription = donnees.abonnements.find((item) =>
      item.id === membre.subscription_id && item.member_id === membre.member_id,
    );
    const section = donnees.sections.find((item) => item.id === membre.section_id);
    const tariff = donnees.tarifs.find((item) => item.id === membre.tariff_id && item.section_id === membre.section_id);
    if (!subscription || !section || !tariff) throw new Error("L’abonnement ou le tarif choisi est introuvable localement.");
    const price = membre.duration === "monthly" ? tariff.monthly_price : tariff.annual_price;
    if (price == null) throw new Error("Ce tarif est à définir. Renseignez-le dans Réglages > Activités.");
    mutations.push({
      table: "subscriptions",
      row: nouvelleLigne({
        ...subscription,
        section_id: section.id,
        tariff_id: tariff.id,
        duration: membre.duration,
        start_date: membre.start_date,
        end_date: ajouterJours(membre.start_date, membre.duration === "annual" ? 365 : 30),
        price: Number(price),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      }),
    });
  }
  await enregistrerMutationsLocalement(userId, mutations);
}

export async function supprimerMembre(id: string): Promise<void> {
  const userId = await utilisateurConnecteId();
  const donnees = await lireDonneesLocales(userId);
  const membre = donnees.membres.find((item) => item.id === id);
  if (!membre) throw new Error("Ce membre est introuvable localement.");
  const now = new Date().toISOString();
  const mutations = [
    ...donnees.abonnements.filter((subscription) => subscription.member_id === id).map((subscription) => ({
      table: "subscriptions" as const,
      operation: "delete" as const,
      row: nouvelleLigne({ ...subscription, deleted_at: now, updated_at: now }),
    })),
    {
      table: "members" as const,
      operation: "delete" as const,
      row: nouvelleLigne({ ...membre, deleted_at: now, updated_at: now }),
    },
  ];
  await enregistrerMutationsLocalement(userId, mutations);
}

export interface NouveauPaiement {
  member_id: string;
  subscription_id: string;
  amount: number;
  method: "especes" | "virement" | "autre";
  paid_at: string;
}

export async function enregistrerPaiement(paiement: NouveauPaiement) {
  return enregistrerPaiementHorsLigne(paiement);
}

export async function annulerPaiement(memberId: string, paymentId: string, reason: string): Promise<void> {
  const userId = await utilisateurConnecteId();
  const donnees = await lireDonneesLocales(userId);
  const payment = donnees.paiements.find((item) => item.id === paymentId && item.member_id === memberId);
  if (!payment) throw new Error("Ce paiement est introuvable localement.");
  if (payment.cancelled_at) throw new Error("Ce paiement est déjà annulé.");
  const now = new Date().toISOString();
  await enregistrerMutationsLocalement(userId, [{
    table: "payment_cancellations",
    row: nouvelleLigne({
      id: crypto.randomUUID(),
      user_id: userId,
      payment_id: payment.id,
      type: "annulation" as const,
      reason: reason.trim(),
      cancelled_by: userId,
      cancelled_at: now,
      created_at: now,
      created_by: userId,
      updated_by: userId,
      updated_at: now,
    }),
  }]);
}

function ajouterJours(date: string, jours: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + jours);
  return result.toISOString().slice(0, 10);
}
