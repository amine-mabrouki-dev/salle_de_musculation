const CLE_MESSAGE_RELANCE = "moulares.reminder-message.v1";

export const MESSAGE_RELANCE_PAR_DEFAUT =
  "Bonjour {nom}, votre abonnement a expiré le {expiration}. Il reste {reste_a_payer} DT à régler. N’hésitez pas à nous contacter pour le renouveler. Merci et à bientôt à la salle de Moularès.";

let messageRelanceEnMemoire: string | null = null;

export interface InformationsRelance {
  nom: string;
  expiration: string;
  reste_a_payer: string;
}

export function lireMessageRelance(): string {
  return messageRelanceEnMemoire
    ?? window.localStorage.getItem(CLE_MESSAGE_RELANCE)
    ?? MESSAGE_RELANCE_PAR_DEFAUT;
}

export function enregistrerMessageRelance(message: string): void {
  messageRelanceEnMemoire = message;
  window.localStorage.setItem(CLE_MESSAGE_RELANCE, message);
}

export function composerMessageRelance(message: string, informations: InformationsRelance): string {
  return message.replace(/\{(nom|expiration|reste_a_payer)\}/g, (_correspondance, champ: keyof InformationsRelance) =>
    informations[champ],
  );
}
