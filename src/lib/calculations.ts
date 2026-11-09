import type { DureeAbonnement, StatutAbonnement } from "../types/members";

const MILLISECONDES_PAR_JOUR = 86_400_000;

export function joursEntreDates(dateFin: string, dateReference: string): number {
  const fin = Date.parse(`${dateFin.slice(0, 10)}T00:00:00Z`);
  const reference = Date.parse(`${dateReference.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(fin) || !Number.isFinite(reference)) {
    throw new Error("Les dates doivent être valides au format AAAA-MM-JJ.");
  }
  return Math.round((fin - reference) / MILLISECONDES_PAR_JOUR);
}

export function statutAbonnement(dateFin: string, dateReference: string): StatutAbonnement {
  const jours = joursEntreDates(dateFin, dateReference);
  return jours < 0 ? "expire" : jours <= 7 ? "bientot" : "actif";
}

export function ajouterJoursAbonnement(dateDebut: string, duree: DureeAbonnement): string {
  const date = new Date(`${dateDebut.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("La date de début doit être valide au format AAAA-MM-JJ.");
  }
  date.setUTCDate(date.getUTCDate() + (duree === "annual" ? 365 : 30));
  return date.toISOString().slice(0, 10);
}

export function calculerResteAPayer(solde: number, paiement: number): number {
  if (!Number.isFinite(solde) || !Number.isFinite(paiement) || solde < 0 || paiement < 0) {
    throw new Error("Le solde et le paiement doivent être des montants positifs ou nuls.");
  }
  return Math.max(0, Math.round((solde - paiement) * 1000) / 1000);
}

export function calculerProfit(revenus: number, depenses: number): number {
  if (!Number.isFinite(revenus) || !Number.isFinite(depenses)) {
    throw new Error("Les revenus et dépenses doivent être des nombres valides.");
  }
  return Math.round((revenus - depenses) * 1000) / 1000;
}

export interface ContratAbonnement {
  id?: string;
  member_id?: string;
  price: number | string | null;
  amount_due?: number | string;
  start_date: string;
  local_created_at?: string;
  deleted_at?: string | null;
}

export function moisDateTunis(date: string): string {
  const dateParsee = new Date(date);
  if (!Number.isFinite(dateParsee.getTime())) return "";
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(dateParsee);
  const valeur = (type: string) => parties.find((partie) => partie.type === type)?.value ?? "";
  const mois = `${valeur("year")}-${valeur("month")}`;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mois) ? mois : "";
}

export function valeurAbonnementsMois(
  abonnements: readonly ContratAbonnement[],
  mois: string,
  membresDemo: ReadonlySet<string> = new Set(),
): number {
  const idsComptes = new Set<string>();
  const millimes = abonnements.reduce((total, abonnement) => {
    if (
      abonnement.deleted_at != null
      || (abonnement.id && idsComptes.has(abonnement.id))
      || (abonnement.member_id && membresDemo.has(abonnement.member_id))
    ) return total;
    const date = abonnement.local_created_at ?? abonnement.start_date;
    if (moisDateTunis(date) !== mois) return total;
    const prix = Number(abonnement.price ?? 0);
    if (!Number.isFinite(prix) || prix < 0) {
      throw new Error("Le prix d’un abonnement doit être un montant positif ou nul.");
    }
    if (abonnement.id) idsComptes.add(abonnement.id);
    return total + Math.round(prix * 1000);
  }, 0);
  return millimes / 1000;
}

export function resteAbonnementsMois(
  abonnements: readonly ContratAbonnement[],
  mois: string,
  membresDemo: ReadonlySet<string> = new Set(),
): number {
  const idsComptes = new Set<string>();
  const millimes = abonnements.reduce((total, abonnement) => {
    if (
      abonnement.deleted_at != null
      || (abonnement.id && idsComptes.has(abonnement.id))
      || (abonnement.member_id && membresDemo.has(abonnement.member_id))
      || moisDateTunis(abonnement.local_created_at ?? abonnement.start_date) !== mois
    ) return total;
    const reste = Number(abonnement.amount_due ?? 0);
    if (!Number.isFinite(reste) || reste < 0) {
      throw new Error("Le reste à payer doit être un montant positif ou nul.");
    }
    if (abonnement.id) idsComptes.add(abonnement.id);
    return total + Math.round(reste * 1000);
  }, 0);
  return millimes / 1000;
}

export function calculerSeuilRentabilite(depenses: number, tarifsMensuels: number[]): number | null {
  if (!Number.isFinite(depenses) || depenses < 0 || tarifsMensuels.some((tarif) => !Number.isFinite(tarif) || tarif < 0)) {
    throw new Error("Les dépenses et tarifs doivent être des montants positifs ou nuls.");
  }
  const tarifsValides = tarifsMensuels.filter((tarif) => tarif > 0);
  if (tarifsValides.length === 0) return null;
  const tarifMoyen = tarifsValides.reduce((total, tarif) => total + tarif, 0) / tarifsValides.length;
  return Math.ceil(depenses / tarifMoyen);
}
