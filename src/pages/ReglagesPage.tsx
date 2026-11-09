import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ActivitiesSettings } from "../components/ActivitiesSettings";
import { Panel } from "../components/Panel";
import { Toast } from "../components/Toast";
import { messageErreur } from "../hooks/useAuth";
import {
  changerMotDePasse,
  chargerCatalogueReglages,
  enregistrerMessageRelanceCloud,
  notifierFondSalleMisAJour,
  supprimerFondSalleCloud,
  televerserFondSalle,
  type CatalogueReglages,
} from "../lib/gymSettings";
import {
  convertirImageRedimensionneeEnBlob,
  reinitialiserFondSalle,
} from "../lib/fondSalle";
import { MESSAGE_RELANCE_PAR_DEFAUT } from "../lib/reminderMessage";
import { supabase } from "../lib/supabase";
import { useSyncStatus } from "../components/SyncManager";
import {
  exporterBaseLocale,
  previsualiserRestauration,
  restaurerBaseLocale,
  viderBaseLocale,
} from "../lib/localDatabase";
import {
  creerFichiersSauvegarde,
  partagerOuTelechargerSauvegarde,
  telechargerSauvegardeAutomatique,
} from "../lib/backups";
import { ouvrirImpressionRapport } from "../lib/backupReport";
import type { ApercuSauvegarde } from "../lib/localDatabase.types";
import { supprimerInstantanesUtilisateur, viderPaiementsEnAttente } from "../lib/offlineStore";
import {
  chargerHistoriqueMembres,
  chargerNomsMembresSalle,
  restaurerVersionMembre,
  type VersionMembre,
} from "../lib/memberHistory";
import { appliquerLangueInterface, getLangueInterface, texte, type LangueInterface } from "../lib/textes";

interface ChampsMotDePasse {
  nouveau: string;
  confirmation: string;
}

const donneesVides: CatalogueReglages = {
  sections: [],
  tarifs: [],
  messageRelance: MESSAGE_RELANCE_PAR_DEFAUT,
  userId: "",
};

export function ReglagesPage() {
  const navigate = useNavigate();
  const { access } = useAuth();
  const { state: syncState, retry } = useSyncStatus();
  const [donnees, setDonnees] = useState<CatalogueReglages>(donneesVides);
  const [modeleRelance, setModeleRelance] = useState(MESSAGE_RELANCE_PAR_DEFAUT);
  const [motDePasse, setMotDePasse] = useState<ChampsMotDePasse>({ nouveau: "", confirmation: "" });
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState("");
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [apercu, setApercu] = useState<ApercuSauvegarde | null>(null);
  const [confirmationRestauration, setConfirmationRestauration] = useState(false);
  const [historique, setHistorique] = useState<VersionMembre[]>([]);
  const [nomsMembresSalle, setNomsMembresSalle] = useState<Record<string, string>>({});
  const [chargementHistorique, setChargementHistorique] = useState(true);
  const [versionEnCours, setVersionEnCours] = useState("");
  const [langue, setLangue] = useState<LangueInterface>(() => getLangueInterface());
  const [rtl, setRtl] = useState(() => getLangueInterface() === "ar");
  const dejaCharge = useRef(false);
  const fermerToast = useCallback(() => setMessage(""), []);

  function changerDirection(): void {
    const prochaine = rtl ? "fr" : "ar";
    setLangue(prochaine);
    setRtl(prochaine === "ar");
    appliquerLangueInterface(prochaine);
  }

  function choisirLangue(prochaine: LangueInterface): void {
    setLangue(prochaine);
    setRtl(prochaine === "ar");
    appliquerLangueInterface(prochaine);
  }

  const charger = useCallback(async () => {
    if (!dejaCharge.current) setChargement(true);
    setErreur("");
    try {
      const resultat = await chargerCatalogueReglages();
      setDonnees(resultat);
      setModeleRelance(resultat.messageRelance);
      dejaCharge.current = true;
    } catch (cause: unknown) {
      setErreur(texte("erreurReglages"));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const actualiserHistorique = useCallback(async () => {
    if (!access || access.role !== "gerant") return;
    setChargementHistorique(true);
    try {
      const [versions, noms] = await Promise.all([
        chargerHistoriqueMembres(access.gymId),
        chargerNomsMembresSalle(access.gymId),
      ]);
      setHistorique(versions);
      setNomsMembresSalle(noms);
    } catch (cause: unknown) {
      setErreur(`Chargement de l’historique impossible : ${messageErreur(cause)}`);
    } finally {
      setChargementHistorique(false);
    }
  }, [access]);

  useEffect(() => {
    void actualiserHistorique();
  }, [actualiserHistorique]);

  async function choisirPhoto(event: ChangeEvent<HTMLInputElement>) {
    const fichier = event.target.files?.[0];
    event.target.value = "";
    if (!fichier) return;
    if (!fichier.type.startsWith("image/")) {
      setErreur(texte("fichierImageInvalide"));
      return;
    }
    if (fichier.size > 12 * 1024 * 1024) {
      setErreur(texte("imageTropVolumineuse"));
      return;
    }
    if (!donnees.userId) {
      setErreur(texte("connexionPasPrete"));
      return;
    }

    setErreur("");
    setEnregistrement("photo");
    try {
      const image = await convertirImageRedimensionneeEnBlob(fichier);
      if (image.size > 5 * 1024 * 1024) {
        throw new Error(texte("imageTropVolumineuse"));
      }
      await televerserFondSalle(image, donnees.userId);
      notifierFondSalleMisAJour();
      setMessage(texte("savedData"));
    } catch (cause: unknown) {
      setErreur(`Impossible d’enregistrer cette image : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement("");
    }
  }

  async function reinitialiserPhoto() {
    if (!donnees.userId) {
      setErreur(texte("connexionPasPrete"));
      return;
    }
    setErreur("");
    setEnregistrement("photo");
    try {
      await supprimerFondSalleCloud(donnees.userId);
      reinitialiserFondSalle();
      notifierFondSalleMisAJour();
      setMessage(texte("imageFondRestauree"));
    } catch (cause: unknown) {
      setErreur(`Impossible de rétablir l’image par défaut : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement("");
    }
  }

  async function sauvegarderModeleRelance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modeleRelance.trim()) {
      setErreur(texte("messageRelanceVide"));
      return;
    }
    setErreur("");
    setEnregistrement("message");
    try {
      await enregistrerMessageRelanceCloud(modeleRelance);
      setDonnees((actuelles) => ({ ...actuelles, messageRelance: modeleRelance }));
      setMessage(texte("messageRelanceEnregistre"));
    } catch (cause: unknown) {
      setErreur(`Enregistrement du message impossible : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement("");
    }
  }

  async function changerLeMotDePasse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (motDePasse.nouveau.length < 8) {
      setErreur(texte("motDePasseTropCourt"));
      return;
    }
    if (motDePasse.nouveau !== motDePasse.confirmation) {
      setErreur(texte("motDePasseConfirmationInvalide"));
      return;
    }
    setErreur("");
    setEnregistrement("mot-de-passe");
    try {
      await changerMotDePasse(motDePasse.nouveau);
      setMotDePasse({ nouveau: "", confirmation: "" });
      setMessage(texte("motDePasseModifie"));
    } catch (cause: unknown) {
      setErreur(`Modification du mot de passe impossible : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement("");
    }
  }

  async function telechargerSauvegarde() {
    if (!donnees.userId) {
      setErreur(texte("connexionPasPrete"));
      return;
    }
    setErreur("");
    setEnregistrement("sauvegarde");
    try {
      const files = await creerFichiersSauvegarde(donnees.userId);
      const mode = await partagerOuTelechargerSauvegarde(donnees.userId, files);
      setMessage(mode === "partage"
        ? texte("partageSauvegardeTermine")
        : texte("telechargementSauvegardeTermine"));
    } catch (cause: unknown) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setErreur(`Création de la sauvegarde impossible : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement("");
    }
  }

  async function preparerRapportPDF() {
    if (!donnees.userId) {
      setErreur(texte("connexionPasPrete"));
      return;
    }
    const fenetreRapport = window.open("", "_blank");
    if (!fenetreRapport) {
      setErreur(texte("pdfPopupBlocked"));
      return;
    }
    setErreur("");
    setEnregistrement("pdf");
    try {
      const files = await creerFichiersSauvegarde(donnees.userId);
      ouvrirImpressionRapport(fenetreRapport, files.rapportHtml);
      setMessage(texte("pdfPrintInstructions"));
    } catch (cause: unknown) {
      fenetreRapport.close();
      setErreur(`Création du rapport PDF impossible : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement("");
    }
  }

  async function choisirSauvegarde(event: ChangeEvent<HTMLInputElement>) {
    const fichier = event.target.files?.[0];
    event.target.value = "";
    setApercu(null);
    setConfirmationRestauration(false);
    if (!fichier) return;
    if (!fichier.name.toLowerCase().endsWith(".sqlite")) {
      setErreur(texte("fichierSauvegardeInvalide"));
      return;
    }
    if (fichier.size > 50 * 1024 * 1024) {
      setErreur(texte("sauvegardeTropVolumineuse"));
      return;
    }
    if (!donnees.userId) {
      setErreur(texte("connexionPasPrete"));
      return;
    }
    setErreur("");
    setEnregistrement("lecture-sauvegarde");
    try {
      const resultat = await previsualiserRestauration(donnees.userId, await fichier.arrayBuffer());
      setApercu(resultat);
    } catch (cause: unknown) {
      setErreur(`Sauvegarde refusée : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement("");
    }
  }

  async function restaurerSauvegarde() {
    if (!apercu || !confirmationRestauration || !donnees.userId) return;
    setErreur("");
    setEnregistrement("restauration");
    try {
      const etatActuel = await exporterBaseLocale(donnees.userId);
      await telechargerSauvegardeAutomatique(donnees.userId, etatActuel);
      const resultat = await restaurerBaseLocale(donnees.userId, apercu.token);
      setApercu(null);
      setConfirmationRestauration(false);
      await charger();
      if (navigator.onLine) await retry(true);
      setMessage(
        `Restauration terminée : ${resultat.ajouts} ligne(s) importée(s), ${resultat.conserves} ligne(s) locale(s) conservée(s). Une sauvegarde de l’état précédent a été téléchargée.`,
      );
    } catch (cause: unknown) {
      setErreur(`Restauration impossible : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement("");
    }
  }

  async function restaurerVersion(version: VersionMembre) {
    const nomMembre = Reflect.get(version.previous_payload, "full_name");
    const idMembre = Reflect.get(version.previous_payload, "member_id");
    const nom = typeof nomMembre === "string"
      ? nomMembre
      : `l’abonnement de ${String(idMembre ?? "ce membre")}`;
    if (!window.confirm(`Restaurer l’ancienne version de ${nom} ? La version actuelle sera conservée dans l’historique.`)) return;
    setErreur("");
    setVersionEnCours(version.id);
    try {
      await restaurerVersionMembre(version);
      await actualiserHistorique();
      setMessage(texte("ancienneVersionRestauree"));
    } catch (cause: unknown) {
      setErreur(`Restauration de la version impossible : ${messageErreur(cause)}`);
    } finally {
      setVersionEnCours("");
    }
  }

  async function seDeconnecter() {
    if (!supabase) {
      setErreur(texte("connexionPasPrete"));
      return;
    }
    if (syncState.status === "synchronisation") {
      setErreur(texte("finMiseAJourAvantDeconnexion"));
      return;
    }
    if (syncState.pending > 0) {
      const confirmerPerte = window.confirm(
        `Il reste ${syncState.pending} modification(s) non synchronisée(s). Si vous poursuivez sans supprimer la copie locale, elles resteront sur cet appareil. Voulez-vous continuer la déconnexion ?`,
      );
      if (!confirmerPerte) return;
    }
    const supprimerCopie = window.confirm(
      "Voulez-vous supprimer de cet appareil la copie locale des données personnelles ?\n\nOK : supprimer la copie locale (confirmation requise).\nAnnuler : la conserver.",
    );
    if (supprimerCopie) {
      const confirmerSuppression = window.confirm(
        "Confirmez-vous la suppression de la copie locale et de toutes les modifications non synchronisées ? Cette action est irréversible.",
      );
      if (!confirmerSuppression) return;
    }

    setErreur("");
    setEnregistrement("deconnexion");
    try {
      if (supprimerCopie) {
        const userId = donnees.userId;
        if (!userId) throw new Error("Impossible d’identifier le compte pour supprimer sa copie locale.");
        await viderBaseLocale(userId);
        await supprimerInstantanesUtilisateur(userId);
        await viderPaiementsEnAttente(userId);
      }
      const { error: erreurDeconnexion } = await supabase.auth.signOut({ scope: "local" });
      if (erreurDeconnexion) throw erreurDeconnexion;
      navigate("/connexion", { replace: true });
    } catch (cause: unknown) {
      setErreur(`Déconnexion impossible : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement("");
    }
  }

  return (
    <main className="page-content settings-page">
      <p className="auth-eyebrow">{texte("pageReglages")}</p>
      <h1>{texte("pageReglages")}</h1>
      <p className="auth-description">{texte("reglagesDescription")}</p>
      {access?.role === "gerant" && (
        <Panel className="settings-card" aria-labelledby="team-access-heading">
          <div>
            <h2 id="team-access-heading">{texte("votreSalle")}</h2>
            <p>{texte("compteGerant")}</p>
            <p>{texte("ajouterAssistantAide")}</p>
          </div>
        </Panel>
      )}

      {erreur && <p className="auth-error" role="alert">{erreur}</p>}
      <Panel className="settings-card" aria-labelledby="language-heading">
        <div>
          <h2 id="language-heading">{texte("langue")}</h2>
          <p>{texte("rtlBientot")}</p>
        </div>
        <div className="stacked-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="secondary-button"
            type="button"
            onClick={() => choisirLangue("fr")}
            aria-pressed={langue === "fr"}
          >
            {texte("francais")}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => choisirLangue("ar")}
            aria-pressed={langue === "ar"}
          >
            العربية
          </button>
        </div>
        <button className="secondary-button" type="button" onClick={changerDirection} aria-pressed={rtl}>
          {rtl ? texte("desactiverRtl") : texte("activerRtl")}
        </button>
      </Panel>
      <Panel className="settings-card" aria-labelledby="sync-settings-heading">
        <div>
          <h2 id="sync-settings-heading">{texte("mettreAJour")}</h2>
          <p>
            {syncState.pending} {texte(syncState.pending === 1 ? "modificationEnAttente" : "modificationsEnAttente")}.
            {syncState.lastSync && ` ${texte("derniereMiseAJour").replace("{date}", new Intl.DateTimeFormat("fr-TN", { dateStyle: "short", timeStyle: "short" }).format(new Date(syncState.lastSync)))}`}
          </p>
          {syncState.error && <p className="auth-error" role="alert">{texte("erreurEnvoi")}</p>}
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => void retry(true)}
          disabled={!navigator.onLine || syncState.status === "synchronisation"}
        >
          {syncState.status === "synchronisation" ? texte("miseAJourEnCours") : texte("mettreAJour")}
        </button>
      </Panel>
      {syncState.storageWarning && (
        <Panel className="settings-card" aria-labelledby="technical-storage-heading">
          <div>
            <h2 id="technical-storage-heading">Informations techniques</h2>
            <p>
              Stockage local : mode de secours activé sur cet appareil. Le navigateur n’a pas accès au stockage principal, donc les données restent enregistrées dans un espace de secours du téléphone.
            </p>
            <p className="settings-hint">{syncState.storageWarning}</p>
          </div>
        </Panel>
      )}
      <Panel className="settings-card" aria-labelledby="backup-heading">
        <div>
          <h2 id="backup-heading">{texte("sauvegarde")}</h2>
          <p>
            {texte("backupDescription")}
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => void preparerRapportPDF()}
          disabled={enregistrement !== ""}
        >
          {enregistrement === "pdf" ? texte("pdfPreparing") : texte("pdfBackupButton")}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void telechargerSauvegarde()}
          disabled={enregistrement !== ""}
        >
          {enregistrement === "sauvegarde" ? texte("backupPreparing") : texte("backupDownloadButton")}
        </button>
        <label className="member-field">
          {texte("backupRestoreButton")}
          <input
            type="file"
            accept=".sqlite,application/vnd.sqlite3"
            onChange={(event) => void choisirSauvegarde(event)}
            disabled={enregistrement !== ""}
          />
        </label>
        {enregistrement === "lecture-sauvegarde" && (
          <p role="status">{texte("backupChecking")}</p>
        )}
        {apercu && (
          <div className="backup-preview" aria-live="polite">
            <h3>{texte("backupPreview")}</h3>
            <p>{apercu.membres} membre(s) · {apercu.paiements} paiement(s)</p>
            <p>
              {texte("latestChange")} : {apercu.derniereDate
                ? new Intl.DateTimeFormat("fr-TN", { dateStyle: "long", timeStyle: "short" }).format(new Date(apercu.derniereDate))
                : texte("noData")}
            </p>
            <label className="backup-confirmation">
              <input
                type="checkbox"
                checked={confirmationRestauration}
                onChange={(event) => setConfirmationRestauration(event.target.checked)}
              />
              {texte("backupConfirm")}
            </label>
            <button
              className="primary-button"
              type="button"
              onClick={() => void restaurerSauvegarde()}
              disabled={!confirmationRestauration || enregistrement !== ""}
            >
              {enregistrement === "restauration" ? texte("restoreInProgress") : texte("restoreNow")}
            </button>
          </div>
        )}
      </Panel>
      {access?.role === "gerant" && (
        <Panel className="settings-card" aria-labelledby="history-heading">
          <div>
            <h2 id="history-heading">{texte("ancienVersions")}</h2>
            <p>{texte("ancienVersionsDescription")}</p>
          </div>
          {chargementHistorique ? (
            <p role="status">{texte("loadingVersions")}</p>
          ) : historique.length ? (
            <ul className="member-history-list">
              {historique.map((version) => {
                const nomMembre = Reflect.get(version.previous_payload, "full_name");
                const memberId = Reflect.get(version.previous_payload, "member_id");
                const resume = version.entity_table === "members"
                  ? typeof nomMembre === "string" ? nomMembre : "Membre"
                  : `Abonnement · ${typeof memberId === "string" ? `membre ${nomsMembresSalle[memberId] ?? ""}` : "ancien"}`;
                return (
                  <li className="member-history-item" key={version.id}>
                    <div>
                      <strong>{resume}</strong>
                      <small>
                        {version.entity_table === "members" ? texte("ancienneFiche") : texte("ancienAbonnement")}
                        {" · "}modifié par {nomsMembresSalle[version.user_id] ?? "un membre de l’équipe"}
                        {" · "}{new Intl.DateTimeFormat("fr-TN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(version.changed_at))}
                      </small>
                    </div>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void restaurerVersion(version)}
                      disabled={versionEnCours !== ""}
                    >
                      {versionEnCours === version.id ? texte("versionRestoring") : texte("restoreVersion")}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>{texte("noOldVersions")}</p>
          )}
        </Panel>
      )}
      {chargement ? (
        <Panel aria-busy="true">
          <div className="members-loading" role="status"><span className="loading-spinner" aria-hidden="true" />{texte("reglagesChargement")}</div>
        </Panel>
      ) : (
        <>
          <Panel className="settings-card" aria-labelledby="activities-heading">
            <ActivitiesSettings
              sections={donnees.sections}
              tarifs={donnees.tarifs}
              onChanged={charger}
            />
          </Panel>

          <Panel className="settings-card reminder-settings-card" aria-labelledby="reminder-message-heading">
            <div>
              <h2 id="reminder-message-heading">{texte("whatsappRappelsTitle")}</h2>
              <p>
                {texte("whatsappRappelsDescription")}
              </p>
            </div>
            <form className="settings-form" onSubmit={(event) => void sauvegarderModeleRelance(event)}>
              <label className="member-field" htmlFor="modele-message-relance">{texte("labelMessage")}</label>
              <textarea
                className="reminder-message-input"
                id="modele-message-relance"
                rows={6}
                maxLength={1000}
                value={modeleRelance}
                onChange={(event) => setModeleRelance(event.target.value)}
                required
              />
              <button className="primary-button" type="submit" disabled={enregistrement !== ""}>
                {enregistrement === "message" ? texte("enregistrement") : texte("saveMessage")}
              </button>
            </form>
          </Panel>

          <Panel className="settings-card" aria-labelledby="background-heading">
            <div>
              <h2 id="background-heading">{texte("backgroundPhotoTitle")}</h2>
              <p>{texte("backgroundPhotoDescription")}</p>
            </div>
            <label className="primary-button photo-upload">
              {enregistrement === "photo" ? texte("photoSending") : texte("choosePhoto")}
              <input
                type="file"
                accept="image/*"
                onChange={(event) => void choisirPhoto(event)}
                disabled={enregistrement !== ""}
              />
            </label>
            <button className="secondary-button" type="button" onClick={() => void reinitialiserPhoto()} disabled={enregistrement !== ""}>
              {texte("restoreDefaultImage")}
            </button>
          </Panel>

          <Panel className="settings-card" aria-labelledby="password-heading">
            <div>
              <h2 id="password-heading">{texte("changePassword")}</h2>
              <p>{texte("passwordDescription")}</p>
            </div>
            <form className="settings-form" onSubmit={(event) => void changerLeMotDePasse(event)}>
              <label className="member-field">
                {texte("passwordNew")}
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={motDePasse.nouveau}
                  onChange={(event) => setMotDePasse((actuel) => ({ ...actuel, nouveau: event.target.value }))}
                  required
                />
              </label>
              <label className="member-field">
                {texte("passwordConfirm")}
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={motDePasse.confirmation}
                  onChange={(event) => setMotDePasse((actuel) => ({ ...actuel, confirmation: event.target.value }))}
                  required
                />
              </label>
              <button className="primary-button" type="submit" disabled={enregistrement !== ""}>
                {enregistrement === "mot-de-passe" ? texte("passwordUpdating") : texte("changePassword")}
              </button>
            </form>
          </Panel>

          <Panel className="settings-card" aria-labelledby="security-heading">
            <div>
              <h2 id="security-heading">{texte("security")}</h2>
              <p>{texte("signOutDescription")}</p>
            </div>
            <button
              className="primary-button settings-signout"
              type="button"
              onClick={() => void seDeconnecter()}
              disabled={enregistrement !== ""}
            >
              {enregistrement === "deconnexion" ? texte("signingOut") : texte("signOut")}
            </button>
          </Panel>
        </>
      )}
      <Toast message={message} onClose={fermerToast} />
    </main>
  );
}
