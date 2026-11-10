export function messageErreurSynchronisation(erreur: unknown): string {
  const message = obtenirMessageErreur(erreur);
  const code = typeof erreur === "object" && erreur !== null
    ? String((erreur as Record<string, unknown>).code ?? "")
    : "";
  if (code === "23P01") {
    return "Cet abonnement chevauche une autre période pour cette activité. Vérifiez les dates avant de réessayer.";
  }
  if (/invalid input syntax for type uuid/i.test(message)) {
    return "Identifiant invalide. Les données locales ont été protégées ; relancez la mise à jour des données.";
  }
  if (/column\s+members\.photo_path\s+does not exist/i.test(message)) {
    return "La base Supabase n’est pas à jour. Exécutez supabase/migrations/011_member_photos.sql dans Supabase > SQL Editor.";
  }
  if (/bucket.*not found|bucket.*does not exist/i.test(message)) {
    return "Le stockage des photos n’est pas configuré. Exécutez supabase/migrations/011_member_photos.sql dans Supabase > SQL Editor.";
  }
  if (/row-level security|permission denied|unauthorized/i.test(message)) {
    return "Supabase a refusé l’enregistrement. Vérifiez votre connexion et les règles d’accès aux données et photos.";
  }
  const colonneManquante = message.match(/column\s+([a-z_]+\.[a-z_]+)\s+does not exist/i);
  if (colonneManquante && /^(sections|tariffs|members|subscriptions|payments|expenses)\.(updated_at|deleted_at)$/i.test(colonneManquante[1]!)) {
    return `La synchronisation Supabase n’est pas encore configurée : la colonne « ${colonneManquante[1]} » manque. Dans Supabase > SQL Editor, exécutez supabase/migrations/010_sync.sql après les migrations 001 à 009, puis réessayez.`;
  }
  return message;
}

function obtenirMessageErreur(erreur: unknown): string {
  if (typeof erreur === "string") return erreur;
  if (erreur instanceof Error) return erreur.message;
  if (typeof erreur !== "object" || erreur === null) {
    return String(erreur);
  }

  const details = erreur as Record<string, unknown>;
  const message = typeof details.message === "string" ? details.message : "";
  const code = typeof details.code === "string" ? details.code : "";
  const detailsTexte = typeof details.details === "string" ? details.details : "";
  const indice = typeof details.hint === "string" ? details.hint : "";
  const morceaux = [
    message || detailsTexte || indice,
    detailsTexte && detailsTexte !== message ? detailsTexte : "",
    indice && indice !== message && indice !== detailsTexte ? `Indice : ${indice}` : "",
    code ? `Code : ${code}` : "",
  ].filter(Boolean);

  return morceaux.join(" — ") || "Supabase a renvoyé une erreur sans détail.";
}
