import { lireDonneesLocales, nouvelleLigne, enregistrerLocalement } from "./localRepository";
import { utilisateurConnecteId } from "./offlineStore";

export function construireAnnulationDepense(
  userId: string,
  expenseId: string,
  reason: string,
  id = crypto.randomUUID(),
  cancelledAt = new Date().toISOString(),
) {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 1 || trimmedReason.length > 500) {
    throw new Error("Le motif d’annulation doit contenir entre 1 et 500 caractères.");
  }
  return nouvelleLigne({
    id,
    user_id: userId,
    expense_id: expenseId,
    type: "annulation" as const,
    reason: trimmedReason,
    cancelled_by: userId,
    cancelled_at: cancelledAt,
    created_at: cancelledAt,
    created_by: userId,
    updated_by: userId,
    updated_at: cancelledAt,
  });
}

export async function annulerDepense(expenseId: string, reason: string): Promise<void> {
  const userId = await utilisateurConnecteId();
  const donnees = await lireDonneesLocales(userId);
  if (!donnees.depenses.some((depense) => depense.id === expenseId)) {
    throw new Error("Cette dépense est introuvable ou déjà annulée.");
  }
  await enregistrerLocalement(
    userId,
    "expense_cancellations",
    construireAnnulationDepense(userId, expenseId, reason),
  );
}
