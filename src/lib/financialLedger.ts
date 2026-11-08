import type { Paiement } from "../types/members";

export interface AnnulationPaiement {
  payment_id: string;
}

export function paiementsActifs(
  paiements: readonly Paiement[],
  annulations: readonly AnnulationPaiement[],
): Paiement[] {
  const annules = new Set(annulations.map((annulation) => annulation.payment_id));
  return paiements.filter((paiement) => !annules.has(paiement.id) && paiement.deleted_at == null);
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
