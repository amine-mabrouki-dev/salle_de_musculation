export function formaterMontantDT(
  montant: number | string,
  locale = "fr-TN",
  options: Intl.NumberFormatOptions = {},
): string {
  const valeur = Number(montant);
  if (!Number.isFinite(valeur)) {
    throw new Error("Le montant doit être un nombre valide.");
  }
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    ...options,
  }).format(valeur);
}
