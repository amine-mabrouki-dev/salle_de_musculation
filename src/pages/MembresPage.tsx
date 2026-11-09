import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BottomSheet } from "../components/BottomSheet";
import { EmptyState } from "../components/EmptyState";
import { FilterChips, type SectionFilter } from "../components/FilterChips";
import { MemberDetail } from "../components/MemberDetail";
import { MemberAvatar } from "../components/MemberAvatar";
import { MemberForm, type FormulaireMembre } from "../components/MemberForm";
import { Panel } from "../components/Panel";
import { StatusChip, type Status } from "../components/StatusChip";
import { Toast } from "../components/Toast";
import { messageErreur } from "../hooks/useAuth";
import {
  chargerMembres,
  creerMembreAvecAbonnement,
  annulerPaiement as annulerPaiementDb,
  enregistrerPaiement as enregistrerPaiementDb,
  modifierMembreAvecAbonnement,
  supprimerMembre as supprimerMembreDb,
} from "../lib/members";
import type {
  Abonnement,
  MembreComplet,
  ModePaiement,
  SalleSection,
  Tarif,
} from "../types/members";
import { EVENEMENT_DONNEES_LOCALES_MAJ } from "../lib/localDatabase";
import { statutAbonnement } from "../lib/calculations";
import { modifierPhotoMembre } from "../lib/memberPhotos";
import { nomActiviteAffiche, normaliserTexteRecherche, texte } from "../lib/textes";
import { normaliserNumeroTunisien } from "../lib/sms";
import { capturerPositionDefilement, restaurerPositionDefilement } from "../lib/scrollPosition";

type ModeFiche = "detail" | "ajout" | "modification" | null;

function dateTunis(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function statutPour(abonnement: Abonnement): Status {
  return statutAbonnement(abonnement.end_date, dateTunis());
}

function libelleStatut(status: Status): string {
  return texte(status === "actif" ? "statutValide" : status === "bientot" ? "statutBientot" : "statutTermine");
}

function formulaireVide(sections: SalleSection[], tarifs: Tarif[]): FormulaireMembre {
  const sectionId = sections[0]?.id ?? "";
  const tarifsSection = tarifs.filter((tarif) => tarif.section_id === sectionId);
  return {
    full_name: "",
    phone: "",
    section_id: sectionId,
    tariff_id: tarifsSection.find((tarif) => tarif.category === "adulte")?.id ?? tarifsSection[0]?.id ?? "",
    duration: "monthly",
    start_date: dateTunis(),
    subscription_id: "",
  };
}

export function MembresPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [membres, setMembres] = useState<MembreComplet[]>([]);
  const [sections, setSections] = useState<SalleSection[]>([]);
  const [tarifs, setTarifs] = useState<Tarif[]>([]);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<SectionFilter>("Tous");
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [toast, setToast] = useState("");
  const [modeFiche, setModeFiche] = useState<ModeFiche>(null);
  const [membreSelectionne, setMembreSelectionne] = useState<MembreComplet | null>(null);
  const [formulaire, setFormulaire] = useState<FormulaireMembre>(() => formulaireVide([], []));
  const dejaCharge = useRef(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [supprimerPhoto, setSupprimerPhoto] = useState(false);

  const charger = useCallback(async (): Promise<boolean> => {
    const positionDefilement = capturerPositionDefilement();
    if (!dejaCharge.current) setChargement(true);
    setErreur("");
    try {
      const donnees = await chargerMembres();
      setMembres(donnees.membres);
      setSections(donnees.sections);
      setTarifs(donnees.tarifs);
      dejaCharge.current = true;
      return true;
    } catch (cause: unknown) {
      setErreur(`Chargement des membres impossible : ${messageErreur(cause)}`);
      return false;
    } finally {
      setChargement(false);
      restaurerPositionDefilement(positionDefilement);
    }
  }, []);

  useEffect(() => {
    void charger();
    window.addEventListener("online", charger);
    window.addEventListener(EVENEMENT_DONNEES_LOCALES_MAJ, charger);
    return () => {
      window.removeEventListener("online", charger);
      window.removeEventListener(EVENEMENT_DONNEES_LOCALES_MAJ, charger);
    };
  }, [charger]);

  const membresFiltres = useMemo(() => {
    const requete = normaliserTexteRecherche(recherche.trim());
    const chiffresRecherche = recherche.replace(/\D/g, "");
    return membres.filter((membre) => {
      const sectionOk =
        filtre === "Tous" ||
        membre.subscriptions.some((abonnement) =>
          sections.find((section) => section.id === abonnement.section_id)?.name === filtre,
        );
      const nomOk = normaliserTexteRecherche(membre.full_name).includes(requete);
      const telephoneOk =
        chiffresRecherche.length > 0 &&
        (membre.phone ?? "").replace(/\D/g, "").includes(chiffresRecherche);
      return sectionOk && (!requete || nomOk || telephoneOk);
    });
  }, [filtre, membres, recherche, sections]);

  const sectionsActives = useMemo(
    () => sections.filter((section) => section.is_active !== false),
    [sections],
  );

  const tarifsSection = useMemo(
    () => tarifs.filter((tarif) => tarif.section_id === formulaire.section_id),
    [formulaire.section_id, tarifs],
  );
  const tarifChoisi = tarifsSection.find((tarif) => tarif.id === formulaire.tariff_id) ?? tarifsSection[0];
  const prixChoisi = tarifChoisi
    ? formulaire.duration === "monthly"
      ? tarifChoisi.monthly_price
      : tarifChoisi.annual_price
    : null;
  const prix = prixChoisi === null || prixChoisi === undefined ? null : Number(prixChoisi);
  const membreDeLaFiche = membreSelectionne
    ? membres.find((membre) => membre.id === membreSelectionne.id) ?? membreSelectionne
    : null;

  function ouvrirAjout() {
    setMembreSelectionne(null);
    setFormulaire(formulaireVide(sectionsActives, tarifs));
    setErreur("");
    setPhotoFile(null);
    setSupprimerPhoto(false);
    setModeFiche("ajout");
  }

  useEffect(() => {
    const state = location.state as { nouveauMembre?: boolean } | null;
    if (state?.nouveauMembre && sectionsActives.length) {
      ouvrirAjout();
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate, sectionsActives]);

  function ouvrirMembre(membre: MembreComplet) {
    setMembreSelectionne(membre);
    setErreur("");
    setToast("");
    setModeFiche("detail");
  }

  function fermerFiche() {
    setModeFiche(null);
    setErreur("");
  }

  function ouvrirModification() {
    if (!membreSelectionne) return;
    const abonnement = membreSelectionne.subscriptions[0];
    setFormulaire({
      full_name: membreSelectionne.full_name,
      phone: membreSelectionne.phone ?? "",
      section_id: abonnement?.section_id ?? sectionsActives[0]?.id ?? "",
      tariff_id: abonnement?.tariff_id ?? "",
      duration: abonnement?.duration ?? "monthly",
      start_date: abonnement?.start_date ?? dateTunis(),
      subscription_id: abonnement?.id ?? "",
    });
    setErreur("");
    setPhotoFile(null);
    setSupprimerPhoto(false);
    setModeFiche("modification");
  }

  function changerFormulaire(champs: Partial<FormulaireMembre>) {
    setFormulaire((actuel) => {
      const suivant = { ...actuel, ...champs };
      if (champs.section_id && champs.section_id !== actuel.section_id) {
        const tarifsSection = tarifs.filter((tarif) => tarif.section_id === champs.section_id);
        suivant.tariff_id = tarifsSection.find((tarif) => tarif.category === "adulte")?.id ?? tarifsSection[0]?.id ?? "";
      }
      if (champs.subscription_id) {
        const abonnement = membreSelectionne?.subscriptions.find((item) => item.id === champs.subscription_id);
        if (abonnement) {
          suivant.section_id = abonnement.section_id;
          suivant.tariff_id = abonnement.tariff_id;
          suivant.duration = abonnement.duration;
          suivant.start_date = abonnement.start_date;
        }
      }
      return suivant;
    });
  }

  async function enregistrerMembre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numeroNormalise = normaliserNumeroTunisien(formulaire.phone);
    if (!numeroNormalise.valide) {
      setErreur(texte("telephoneHuitChiffres"));
      return;
    }
    const telephone = numeroNormalise.numeroE164.slice(4);
    if ((modeFiche === "ajout" || formulaire.subscription_id) && prix === null) {
      setErreur(texte("tarifAdefinir"));
      return;
    }
    if (
      (modeFiche === "ajout" || formulaire.subscription_id) &&
      (!formulaire.section_id || !formulaire.tariff_id)
    ) {
      setErreur("Aucun tarif n’est configuré pour cette section. Ajoutez un tarif avant de créer l’abonnement.");
      return;
    }
    if ((photoFile || supprimerPhoto) && !navigator.onLine) {
      setErreur("Une connexion Internet est nécessaire pour ajouter ou supprimer une photo. Le reste de la fiche n’a pas été modifié.");
      return;
    }

    setEnregistrement(true);
    setErreur("");
    try {
      const donnees = {
        full_name: formulaire.full_name.trim(),
        phone: telephone,
        section_id: formulaire.section_id,
        tariff_id: formulaire.tariff_id,
        duration: formulaire.duration,
        start_date: formulaire.start_date,
      };
      if (modeFiche === "ajout") {
        const memberId = await creerMembreAvecAbonnement(donnees);
        if (photoFile) {
          try {
            await modifierPhotoMembre(memberId, photoFile);
          } catch (cause: unknown) {
            await charger();
            fermerFiche();
            setPhotoFile(null);
            setToast(`Membre ajouté, mais la photo n’a pas été enregistrée : ${messageErreur(cause)}`);
            return;
          }
        }
        await charger();
        fermerFiche();
        setPhotoFile(null);
        setSupprimerPhoto(false);
        setToast("Membre et abonnement ajoutés.");
        return;
      }

      if (!membreSelectionne) return;
      await modifierMembreAvecAbonnement({
        ...donnees,
        member_id: membreSelectionne.id,
        subscription_id: formulaire.subscription_id || null,
      });
      if (photoFile || supprimerPhoto) {
        try {
          await modifierPhotoMembre(membreSelectionne.id, supprimerPhoto ? null : photoFile);
        } catch (cause: unknown) {
          await charger();
          setMembreSelectionne((current) => current ? { ...current, ...donnees } : current);
          setModeFiche("detail");
          setPhotoFile(null);
          setToast(`Fiche mise à jour, mais la photo n’a pas été enregistrée : ${messageErreur(cause)}`);
          return;
        }
      }
      await charger();
      fermerFiche();
      setMembreSelectionne(null);
      setPhotoFile(null);
      setSupprimerPhoto(false);
      setToast(texte("profileUpdated"));
    } catch (cause: unknown) {
      setErreur(`Enregistrement impossible : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement(false);
    }
  }

  async function supprimerMembre() {
    if (!membreSelectionne) return;
    const confirmer = window.confirm(
      texte("confirmationSuppression").replace("{nom}", membreSelectionne.full_name),
    );
    if (!confirmer) return;

    setEnregistrement(true);
    setErreur("");
    try {
      const nom = membreSelectionne.full_name;
      await supprimerMembreDb(membreSelectionne.id);
      setMembres((actuels) => actuels.filter((membre) => membre.id !== membreSelectionne.id));
      fermerFiche();
      setMembreSelectionne(null);
      setToast(`${nom} a été supprimé.`);
    } catch (cause: unknown) {
      setErreur(`Suppression impossible : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement(false);
    }
  }

  async function enregistrerPaiement(
    paiement: {
      subscription_id: string;
      amount: number;
      method: ModePaiement;
      paid_at: string;
    },
  ): Promise<"enregistre" | "en_attente" | false> {
    if (!membreSelectionne) return false;
    setEnregistrement(true);
    setErreur("");
    try {
      const abonnement = membreSelectionne.subscriptions.find((item) => item.id === paiement.subscription_id);
      if (!abonnement) throw new Error("L’abonnement sélectionné est introuvable.");
      const resultat = await enregistrerPaiementDb({ ...paiement, member_id: membreSelectionne.id });
      if (resultat === "en_attente") {
        setToast("Paiement conservé sur cet appareil. Il sera synchronisé dès le retour du réseau.");
        return "en_attente";
      }
      const actualisationReussie = await charger();
      setToast(
        actualisationReussie
          ? "Paiement enregistré."
          : "Paiement enregistré, mais l’actualisation de la fiche a échoué.",
      );
      return "enregistre";
    } catch (cause: unknown) {
      setErreur(`Enregistrement du paiement impossible : ${messageErreur(cause)}`);
      return false;
    } finally {
      setEnregistrement(false);
    }
  }

  async function annulerPaiement(paymentId: string, reason: string): Promise<boolean> {
    if (!membreSelectionne) return false;
    setEnregistrement(true);
    setErreur("");
    try {
      await annulerPaiementDb(membreSelectionne.id, paymentId, reason);
      const actualisationReussie = await charger();
      setToast(
        actualisationReussie
          ? "Annulation enregistrée et solde recalculé."
          : "Paiement annulé, mais l’actualisation de la fiche a échoué.",
      );
      return true;
    } catch (cause: unknown) {
      setErreur(`Annulation impossible : ${messageErreur(cause)}`);
      return false;
    } finally {
      setEnregistrement(false);
    }
  }

  const titreFiche =
    modeFiche === "ajout"
      ? texte("nouveauMembre")
      : modeFiche === "modification"
        ? texte("modifierMembre")
        : texte("membreFiche");

  return (
    <main className="page-content members-page" aria-label="Membres">
      <div className="members-heading">
        <div>
          <p className="members-eyebrow">Moularès · Gafsa</p>
          <h1>{texte("membresTitre")}</h1>
          {!chargement && (
            <p className="members-count">
              {membres.length} membre{membres.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
        <button className="primary-button add-member-button" type="button" onClick={ouvrirAjout}>
          {texte("nouveauMembre")}
        </button>
      </div>

      <label className="sr-only" htmlFor="recherche-membres">
        {texte("chercherMembre")}
      </label>
      <input
        className="members-search"
        id="recherche-membres"
        type="search"
        autoComplete="off"
        placeholder={texte("rechercheMembre")}
        value={recherche}
        onChange={(event) => setRecherche(event.target.value)}
      />
      <FilterChips sections={sectionsActives.map((section) => section.name)} value={filtre} onChange={setFiltre} />

      {erreur && modeFiche === null && membres.length > 0 && (
        <div className="members-error" role="alert">{erreur}</div>
      )}

      {chargement ? (
        <Panel aria-label="Chargement des membres" aria-busy="true">
          <div className="members-loading" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            <span>{texte("chargementMembres")}</span>
          </div>
        </Panel>
      ) : erreur && membres.length === 0 ? (
        <Panel>
          <EmptyState
            title={texte("membresIndisponibles")}
            description={erreur}
            action={
              <button className="secondary-button" type="button" onClick={() => void charger()}>
                {texte("reessayer")}
              </button>
            }
          />
        </Panel>
      ) : membresFiltres.length === 0 ? (
        <Panel>
          <EmptyState
            title={membres.length ? texte("aucunResultat") : texte("aucunMembreTitre")}
            description={
              membres.length
                ? texte("essayerAutreRecherche")
                : texte("aucunMembreAction")
            }
            action={
              !membres.length && (
                <button className="primary-button" type="button" onClick={ouvrirAjout}>
                  {texte("nouveauMembre")}
                </button>
              )
            }
          />
        </Panel>
      ) : (
        <Panel className="members-list" aria-label="Liste des membres">
          {membresFiltres.map((membre) => (
            <button
              className="member-list-item"
              key={membre.id}
              type="button"
              onClick={() => ouvrirMembre(membre)}
            >
              <MemberAvatar nom={membre.full_name} photoPath={membre.photo_path} />
              <span className="member-list-main">
                <span className="member-list-name">{membre.full_name}</span>
                <span className="member-list-section">{resumeAbonnements(membre, sections, tarifs)}</span>
                <span className="member-list-duration">
                  {membre.subscriptions.length
                    ? membre.subscriptions.map((abonnement) =>
                        abonnement.duration === "annual" ? "Annuel" : "Mensuel",
                      ).join(" · ")
                    : "Aucun abonnement"}
                </span>
              </span>
              <span className="member-status-list">
                {membre.subscriptions.length
                  ? membre.subscriptions.map((abonnement) => {
                      const status = statutPour(abonnement);
                      return (
                        <StatusChip
                          key={abonnement.id}
                          status={status}
                          label={libelleStatut(status)}
                        />
                      );
                    })
                  : <StatusChip status="expire" label="Sans abonnement" />}
              </span>
            </button>
          ))}
        </Panel>
      )}

      <BottomSheet
        open={modeFiche !== null}
        title={titreFiche}
        onClose={() => {
          setModeFiche(null);
          setErreur("");
        }}
      >
        {(modeFiche === "ajout" || modeFiche === "modification") && (
          <MemberForm
            formulaire={formulaire}
            sections={modeFiche === "ajout"
              ? sectionsActives
              : sections.filter((section) => section.is_active !== false || section.id === formulaire.section_id)}
            tarifs={tarifsSection}
            prix={prix}
            erreur={erreur}
            enregistrement={enregistrement}
            modification={modeFiche === "modification"}
            abonnements={modeFiche === "modification" ? membreDeLaFiche?.subscriptions : undefined}
            photoPath={membreDeLaFiche?.photo_path}
            photoFile={photoFile}
            supprimerPhoto={supprimerPhoto}
            onChange={changerFormulaire}
            onPhotoChange={(file) => {
              setPhotoFile(file);
              if (file) setSupprimerPhoto(false);
            }}
            onSupprimerPhoto={() => setSupprimerPhoto((current) => !current)}
            onSubmit={enregistrerMembre}
            onAnnuler={modeFiche === "ajout" ? fermerFiche : () => setModeFiche("detail")}
          />
        )}
        {modeFiche === "detail" && membreDeLaFiche && (
          <MemberDetail
            key={membreDeLaFiche.id}
            membre={membreDeLaFiche}
            sections={sections}
            tarifs={tarifs}
            erreur={erreur}
            enregistrement={enregistrement}
            onModifier={ouvrirModification}
            onSupprimer={() => void supprimerMembre()}
            onEnregistrerPaiement={enregistrerPaiement}
            onAnnulerPaiement={annulerPaiement}
            toast={toast}
            onCloseToast={() => setToast("")}
          />
        )}
      </BottomSheet>
      {modeFiche === null && <Toast message={toast} onClose={() => setToast("")} />}
    </main>
  );
}

function resumeAbonnements(
  membre: MembreComplet,
  sections: SalleSection[],
  tarifs: Tarif[],
): string {
  const descriptions = membre.subscriptions.map((abonnement) => {
    const section = nomActiviteAffiche(sections.find((item) => item.id === abonnement.section_id)?.name ?? "Section");
    const tarif = tarifs.find((item) => item.id === abonnement.tariff_id);
    const categorie = texte(tarif?.category === "etudiant_enfant" ? "enfant" : "adulte");
    return `${section} · ${categorie}`;
  });
  return descriptions.length ? descriptions.join(" / ") : "Aucun abonnement";
}
