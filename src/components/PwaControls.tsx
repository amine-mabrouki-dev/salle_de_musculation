import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, messageErreur } from "../hooks/useAuth";
import { useSyncStatus } from "./SyncManager";
import { texte } from "../lib/textes";
import { compterOutbox } from "../lib/localDatabase";
import {
  EVENEMENT_NOUVELLE_VERSION,
  nouvelleVersionDisponible,
  rechargerAvecNouvelleVersion,
} from "../lib/serviceWorker";

interface InviteInstallation extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function estApplicationInstallee(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function estIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PwaControls() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { state: syncState, retry } = useSyncStatus();
  const [invite, setInvite] = useState<InviteInstallation | null>(null);
  const [installationIOS, setInstallationIOS] = useState(false);
  const [installee, setInstallee] = useState(estApplicationInstallee);
  const [masquee, setMasquee] = useState(false);
  const [erreurInstallation, setErreurInstallation] = useState("");
  const [miseAJourDisponible, setMiseAJourDisponible] = useState(nouvelleVersionDisponible);
  const [miseAJourEnCours, setMiseAJourEnCours] = useState(false);
  const [erreurMiseAJour, setErreurMiseAJour] = useState("");

  useEffect(() => {
    const versionPrete = () => setMiseAJourDisponible(true);
    const avantInstallation = (event: Event) => {
      event.preventDefault();
      setInvite(event as InviteInstallation);
    };
    const installeeSurAppareil = () => {
      setInstallee(true);
      setInvite(null);
      setInstallationIOS(false);
    };
    window.addEventListener(EVENEMENT_NOUVELLE_VERSION, versionPrete);
    window.addEventListener("beforeinstallprompt", avantInstallation);
    window.addEventListener("appinstalled", installeeSurAppareil);
    if (estIOS() && !estApplicationInstallee()) setInstallationIOS(true);

    return () => {
      window.removeEventListener(EVENEMENT_NOUVELLE_VERSION, versionPrete);
      window.removeEventListener("beforeinstallprompt", avantInstallation);
      window.removeEventListener("appinstalled", installeeSurAppareil);
    };
  }, []);

  async function mettreAJourApplication(): Promise<void> {
    if (miseAJourEnCours) return;
    setMiseAJourEnCours(true);
    setErreurMiseAJour("");

    if (!session?.user.id) {
      setErreurMiseAJour(texte("miseAJourConnexionRequise"));
      setMiseAJourEnCours(false);
      return;
    }

    let modificationsEnAttente: number;
    try {
      modificationsEnAttente = await compterOutbox(session.user.id);
    } catch {
      setErreurMiseAJour(texte("miseAJourVerificationImpossible"));
      setMiseAJourEnCours(false);
      return;
    }

    if (modificationsEnAttente > 0) {
      setErreurMiseAJour(texte(
        modificationsEnAttente === 1
          ? "miseAJourUneModificationEnAttente"
          : "miseAJourModificationsEnAttente",
      ));
      setMiseAJourEnCours(false);
      return;
    }

    try {
      await rechargerAvecNouvelleVersion();
    } catch {
      setErreurMiseAJour(texte("miseAJourErreur"));
      setMiseAJourEnCours(false);
    }
  }

  async function installer(): Promise<void> {
    if (!invite) return;
    setErreurInstallation("");
    try {
      await invite.prompt();
      const choix = await invite.userChoice;
      if (choix.outcome === "accepted") setInvite(null);
    } catch (error: unknown) {
      setErreurInstallation(messageErreur(error));
    }
  }

  const afficherInviteAndroid = Boolean(invite) && !installee && !masquee;
  const afficherInviteIOS = installationIOS && !installee && !masquee;
  const afficherEtatSync = Boolean(session);
  const afficherBandeauSynchro = Boolean(session) && (syncState.status === "hors-ligne" || syncState.status === "erreur");
  if (!afficherEtatSync && !erreurInstallation && !afficherInviteAndroid && !afficherInviteIOS && !syncState.storageWarning && !miseAJourDisponible && !erreurMiseAJour) {
    return null;
  }

  return (
    <aside className="pwa-notices" aria-label="État de l’application">
      {miseAJourDisponible && (
        <div className="pwa-notice pwa-update" role="status">
          <span>{texte("nouvelleVersionPrete")}</span>
          <button
            type="button"
            className="pwa-notice-action"
            onClick={() => void mettreAJourApplication()}
            disabled={miseAJourEnCours}
          >
            {texte("mettreAJourApplication")}
          </button>
        </div>
      )}
      {erreurMiseAJour && <p className="pwa-notice pwa-update-error" role="alert">{erreurMiseAJour}</p>}
      {afficherBandeauSynchro && (
        <div className={`pwa-notice ${syncState.status === "hors-ligne" ? "pwa-offline" : "pwa-offline"}`} role="alert">
          <span>
            {syncState.status === "hors-ligne" ? texte("etatHorsConnexion") : texte("etatErreur")}
            {syncState.pending > 0 && ` · ${syncState.pending} ${texte(syncState.pending === 1 ? "modificationEnAttente" : "modificationsEnAttente")}`}
            {syncState.error && ` — ${texte("erreurEnvoi")}`}
            {syncState.status === "hors-ligne" && ` — ${texte("aucunReseau")}`}
          </span>
          {syncState.status === "erreur" && (
            <button type="button" className="pwa-notice-action" onClick={() => void retry(true)}>
              {texte("reessayerEnvoi")}
            </button>
          )}
        </div>
      )}
      {syncState.storageWarning && (
        <div className="pwa-notice pwa-offline storage-warning" role="alert">
          <span>{syncState.storageWarning}</span>
          <button type="button" className="pwa-notice-action" onClick={() => navigate("/reglages")}>Faire une sauvegarde</button>
        </div>
      )}
      {erreurInstallation && <p className="pwa-notice pwa-offline" role="alert">Installation impossible : {erreurInstallation}</p>}
      {afficherInviteAndroid && (
        <div className="pwa-notice pwa-install">
          <span>Installez l’application sur votre appareil.</span>
          <button type="button" className="pwa-notice-action" onClick={() => void installer()}>
            Installer
          </button>
          <button type="button" className="pwa-dismiss" onClick={() => setMasquee(true)} aria-label="Fermer">
            Fermer
          </button>
        </div>
      )}
      {afficherInviteIOS && (
        <details className="pwa-notice pwa-install" open>
          <summary>Installer sur iPhone</summary>
          <p>Dans Safari, touchez <strong>Partager</strong>, puis <strong>Ajouter à l’écran d’accueil</strong>.</p>
          <button type="button" className="pwa-dismiss" onClick={() => setMasquee(true)}>
            Fermer
          </button>
        </details>
      )}
    </aside>
  );
}
