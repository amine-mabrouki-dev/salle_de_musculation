import type { Paiement } from "../types/members";

export interface AnnulationPaiement {
  payment_id: string;
}

export interface PaiementPourEncaissement {
  id: string;
  member_id: string;
  amount: number | string;
  paid_at: string;
  deleted_at?: string | null;
  cancelled_at?: string | null;
}

function dateLocaleTunis(date: string): string | null {
  const valeur = new Date(date);
  if (!Number.isFinite(valeur.getTime())) return null;
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(valeur);
  const partie = (type: string) => parties.find((item) => item.type === type)?.value ?? "";
  const dateLocale = `${partie("year")}-${partie("month")}-${partie("day")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(dateLocale) ? dateLocale : null;
}

function bornesMois(mois: string): { debut: string; fin: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) {
    throw new Error("Le mois doit être au format AAAA-MM.");
  }
  const [annee, numeroMois] = mois.split("-").map(Number);
  const dernierJour = new Date(Date.UTC(annee, numeroMois, 0)).getUTCDate();
  return { debut: `${mois}-01`, fin: `${mois}-${String(dernierJour).padStart(2, "0")}` };
}

export function totalEncaissementsDuMois(
  paiements: readonly PaiementPourEncaissement[],
  mois: string,
  membresDemo: ReadonlySet<string> = new Set(),
): number {
  const { debut, fin } = bornesMois(mois);
  const idsComptes = new Set<string>();
  const millimes = paiements.reduce((total, paiement) => {
    if (
      !paiement.id
      || idsComptes.has(paiement.id)
      || paiement.deleted_at != null
      || paiement.cancelled_at != null
      || membresDemo.has(paiement.member_id)
    ) return total;

    const date = dateLocaleTunis(paiement.paid_at);
    if (!date || date < debut || date > fin) return total;
    const montant = Number(paiement.amount);
    if (!Number.isFinite(montant)) return total;
    idsComptes.add(paiement.id);
    return total + Math.round(montant * 1000);
  }, 0);
  return millimes / 1000;
}

export function paiementsActifs(
  paiements: readonly Paiement[],
  annulations: readonly AnnulationPaiement[],
): Paiement[] {
  const annules = new Set(annulations.map((annulation) => annulation.payment_id));
  const idsVus = new Set<string>();
  return paiements.filter((paiement) => {
    if (idsVus.has(paiement.id) || annules.has(paiement.id) || paiement.deleted_at != null) return false;
    idsVus.add(paiement.id);
    return true;
  });
}

export function totalPaiements(
  paiements: readonly Paiement[],
  annulations: readonly AnnulationPaiement[] = [],
): number {
  return paiementsActifs(paiements, annulations)
    .reduce((total, paiement) => total + Number(paiement.amount), 0);
}

export function resteAbonnement(
  prix: number | string | null,
  paiements: readonly Paiement[],
  annulations: readonly AnnulationPaiement[] = [],
): number {
  return Math.max(0, Number(prix ?? 0) - totalPaiements(paiements, annulations));
}

export function ajouterPaiementUnique(
  paiements: readonly Paiement[],
  nouveau: Paiement,
): Paiement[] {
  if (paiements.some((paiement) => paiement.id === nouveau.id)) return [...paiements];
  return [...paiements, nouveau];
}
