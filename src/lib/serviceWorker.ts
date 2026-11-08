import { registerSW } from "virtual:pwa-register";

export const EVENEMENT_NOUVELLE_VERSION = "gym4you:nouvelle-version";

let appliquerMiseAJour: ((reloadPage?: boolean) => Promise<void>) | null = null;
let miseAJourDisponible = false;

export function enregistrerServiceWorker(): void {
  appliquerMiseAJour = registerSW({
    immediate: true,
    onNeedRefresh() {
      miseAJourDisponible = true;
      window.dispatchEvent(new Event(EVENEMENT_NOUVELLE_VERSION));
    },
  });
}

export function nouvelleVersionDisponible(): boolean {
  return miseAJourDisponible;
}

export async function rechargerAvecNouvelleVersion(): Promise<void> {
  if (!miseAJourDisponible || !appliquerMiseAJour) {
    throw new Error("Aucune mise à jour du service worker n’est prête.");
  }
  await appliquerMiseAJour(true);
}
