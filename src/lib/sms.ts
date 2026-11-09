import { composerMessageRelance, type InformationsRelance } from "./reminderMessage";
import { getLangueInterface, texte, type LangueInterface } from "./textes";

export type ResultatNumeroTunisien =
  | { valide: true; numeroE164: string }
  | { valide: false; raison: "absent" | "invalide" };

export function normaliserNumeroTunisien(numero: string | null | undefined): ResultatNumeroTunisien {
  const valeur = numero?.trim() ?? "";
  if (!valeur) return { valide: false, raison: "absent" };
  if (!/^\+?[\d\s().-]+$/.test(valeur)) return { valide: false, raison: "invalide" };

  let chiffres = valeur.replace(/\D/g, "");
  if (valeur.startsWith("+")) {
    if (!chiffres.startsWith("216") || chiffres.length !== 11) {
      return { valide: false, raison: "invalide" };
    }
    chiffres = chiffres.slice(3);
  } else if (chiffres.startsWith("00")) {
    if (!chiffres.startsWith("00216") || chiffres.length !== 13) {
      return { valide: false, raison: "invalide" };
    }
    chiffres = chiffres.slice(5);
  } else if (chiffres.startsWith("216") && chiffres.length === 11) {
    chiffres = chiffres.slice(3);
  } else if (chiffres.startsWith("0") && chiffres.length === 9) {
    chiffres = chiffres.slice(1);
  }

  if (!/^[2-9]\d{7}$/.test(chiffres)) {
    return { valide: false, raison: "invalide" };
  }
  return { valide: true, numeroE164: `+216${chiffres}` };
}

export function composerRappelSMS(
  informations: InformationsRelance,
  langue: LangueInterface = getLangueInterface(),
): string {
  const message = composerMessageRelance(texte("smsReminderTemplate", langue), informations);
  const solde = Number(informations.reste_a_payer.replace(/[^\d,.-]/g, "").replace(",", "."));
  if (!Number.isFinite(solde) || solde <= 0) return message;
  return `${message}\n${texte("smsBalance", langue).replace("{montant}", informations.reste_a_payer)}`;
}

export function formaterDateSMS(date: string, langue: LangueInterface = getLangueInterface()): string {
  return new Intl.DateTimeFormat(langue === "ar" ? "ar-TN-u-nu-latn" : "fr-TN", {
    timeZone: "Africa/Tunis",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function formaterMontantSMS(montant: number, langue: LangueInterface = getLangueInterface()): string {
  return new Intl.NumberFormat(langue === "ar" ? "ar-TN-u-nu-latn" : "fr-TN", {
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(montant);
}

export function lienSMS(numeroE164: string, message: string): string {
  return `sms:${numeroE164}?body=${encodeURIComponent(message)}`;
}
