import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BottomSheet } from "../components/BottomSheet";
import { EmptyState } from "../components/EmptyState";
import { FilterChips, type SectionFilter } from "../components/FilterChips";
import { Panel } from "../components/Panel";
import { StatusChip, type Status } from "../components/StatusChip";
import { Toast } from "../components/Toast";
import { messageErreur } from "../hooks/useAuth";
import { ajouterJoursAbonnement, statutAbonnement } from "../lib/calculations";
import {
  chargerDonneesAbonnements,
  creerOuRenouvelerAbonnement,
  type DonneesAbonnements,
} from "../lib/subscriptions";
import type { Abonnement, DureeAbonnement, Tarif } from "../types/members";
import { EVENEMENT_DONNEES_LOCALES_MAJ } from "../lib/localDatabase";
import { texte } from "../lib/textes";

type ModeAbonnement = "nouveau" | "renouvellement";

interface FormulaireAbonnement {
  member_id: string;
  section_id: string;
  tariff_id: string;
  duration: DureeAbonnement;
  subscription_id: string;
  manual_price: string;
  confirmerTarifAnnuel: boolean;
}

const donneesVides: DonneesAbonnements = { membres: [], abonnements: [], sections: [], tarifs: [] };

function dateTunis(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valeur = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${valeur("year")}-${valeur("month")}-${valeur("day")}`;
}

function ajouterJours(date: string, jours: number): string {
  return ajouterJoursAbonnement(date, jours === 365 ? "annual" : "monthly");
}

function dateLisible(date: string): string {
  return new Intl.DateTimeFormat("fr-TN", {
    timeZone: "Africa/Tunis",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function monnaie(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "À définir";
  return `${new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 3 }).format(Number(value))} DT`;
}

function categorie(tarif: Tarif | undefined): string {
  return tarif?.category === "etudiant_enfant" ? "Étudiant / enfant" : "Adulte";
}

function statutPour(abonnement: Abonnement): Status {
  if (abonnement.status) return abonnement.status;
  return statutAbonnement(abonnement.end_date, dateTunis());
}

function formulaireInitial(membreId = "", sectionId = ""): FormulaireAbonnement {
  return {
    member_id: membreId,
    section_id: sectionId,
    tariff_id: "",
    duration: "monthly",
    subscription_id: "",
    manual_price: "",
    confirmerTarifAnnuel: false,
  };
}

export function AbonnementsPage() {
  const [donnees, setDonnees] = useState<DonneesAbonnements>(donneesVides);
  const [filtre, setFiltre] = useState<SectionFilter>("Tous");
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [toast, setToast] = useState("");
  const [mode, setMode] = useState<ModeAbonnement | null>(null);
  const [formulaire, setFormulaire] = useState<FormulaireAbonnement>(() => formulaireInitial());
  const dejaCharge = useRef(false);
  const demandeAbonnementId = useRef<string | null>(null);

  const charger = useCallback(async (): Promise<boolean> => {
    if (!dejaCharge.current) setChargement(true);
    setErreur("");
    try {
      setDonnees(await chargerDonneesAbonnements());
      dejaCharge.current = true;
      return true;
    } catch (cause: unknown) {
      setErreur(`Chargement des abonnements impossible : ${messageErreur(cause)}`);
      return false;
    } finally {
      setChargement(false);
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

  const membreChoisi = donnees.membres.find((membre) => membre.id === formulaire.member_id);
  const abonnementRenouvele = membreChoisi?.subscriptions.find(
    (abonnement) => abonnement.id === formulaire.subscription_id,
  );
  const tarifsSection = donnees.tarifs.filter((tarif) => tarif.section_id === formulaire.section_id);
  const sectionsActives = donnees.sections.filter((section) => section.is_active !== false);
  const sectionsFormulaire = donnees.sections.filter(
    (section) => section.is_active !== false || section.id === formulaire.section_id,
  );
  const tarifChoisi = tarifsSection.find((tarif) => tarif.id === formulaire.tariff_id) ?? tarifsSection[0];
  const tarifNormal = tarifChoisi
    ? formulaire.duration === "monthly"
      ? tarifChoisi.monthly_price
      : tarifChoisi.annual_price
    : null;
  const tarifMensuel = tarifChoisi?.monthly_price == null ? null : Number(tarifChoisi.monthly_price);
  const tarifEstime = formulaire.duration === "annual" && tarifNormal == null && tarifMensuel !== null;
  const prixEstime = tarifEstime ? tarifMensuel * 10 : null;
  const prixEffectif =
    tarifNormal !== null && tarifNormal !== undefined
      ? Number(tarifNormal)
      : prixEstime ?? (formulaire.manual_price === "" ? null : Number(formulaire.manual_price));

  const debutPrevu = abonnementRenouvele
    ? abonnementRenouvele.end_date > dateTunis()
      ? abonnementRenouvele.end_date
      : dateTunis()
    : dateTunis();
  const finPrevue = ajouterJours(debutPrevu, formulaire.duration === "annual" ? 365 : 30);

  const abonnementFiltres = useMemo(
    () =>
      donnees.abonnements
        .filter((abonnement) => filtre === "Tous" || abonnement.section_id === donnees.sections.find((section) => section.name === filtre)?.id)
        .sort((a, b) => a.end_date.localeCompare(b.end_date)),
    [donnees.abonnements, donnees.sections, filtre],
  );
  const abonnementsEnCours = donnees.abonnements.filter((abonnement) => abonnement.end_date >= dateTunis());
  const compteurs = {
    monthly: abonnementsEnCours.filter((abonnement) => abonnement.duration === "monthly").length,
    annual: abonnementsEnCours.filter((abonnement) => abonnement.duration === "annual").length,
  };

  function ouvrirFormulaire() {
    demandeAbonnementId.current = null;
    const sectionId = sectionsActives[0]?.id ?? "";
    const premierTarif = donnees.tarifs.find((tarif) => tarif.section_id === sectionId);
    setFormulaire({ ...formulaireInitial("", sectionId), tariff_id: premierTarif?.id ?? "" });
    setMode("nouveau");
    setErreur("");
  }

  function changer(champs: Partial<FormulaireAbonnement>) {
    demandeAbonnementId.current = null;
    setFormulaire((actuel) => {
      const prochain = { ...actuel, ...champs };
      if (champs.section_id && champs.section_id !== actuel.section_id) {
        prochain.tariff_id = donnees.tarifs.find((tarif) => tarif.section_id === champs.section_id)?.id ?? "";
      }
      if (champs.member_id !== undefined) prochain.subscription_id = "";
      if (champs.duration !== undefined || champs.tariff_id !== undefined || champs.section_id !== undefined) {
        prochain.confirmerTarifAnnuel = false;
        prochain.manual_price = "";
      }
      return prochain;
    });
  }

  async function enregistrer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tarifChoisi) {
      setErreur("Aucun tarif n’est configuré pour cette section.");
      return;
    }
    if (prixEffectif === null || !Number.isFinite(prixEffectif) || prixEffectif < 0) {
      setErreur("Saisissez un prix valide pour cette formule avant de continuer.");
      return;
    }
    if (tarifEstime && !formulaire.confirmerTarifAnnuel) {
      setErreur("Confirmez le tarif annuel proposé avant de continuer.");
      return;
    }
    if (mode === "renouvellement" && !abonnementRenouvele) {
      setErreur("Sélectionnez l’abonnement à renouveler.");
      return;
    }

    setEnregistrement(true);
    setErreur("");
    try {
      demandeAbonnementId.current ??= crypto.randomUUID();
      await creerOuRenouvelerAbonnement({
        member_id: formulaire.member_id,
        section_id: formulaire.section_id,
        tariff_id: tarifChoisi.id,
        duration: formulaire.duration,
        subscription_id: mode === "renouvellement" ? formulaire.subscription_id : null,
        confirm_annual_estimate: formulaire.confirmerTarifAnnuel,
        manual_price: tarifNormal == null && !tarifEstime ? prixEffectif : null,
        client_request_id: demandeAbonnementId.current,
      });
      const actualisationReussie = await charger();
      demandeAbonnementId.current = null;
      setMode(null);
      setToast(
        actualisationReussie
          ? mode === "renouvellement" ? "Abonnement renouvelé." : "Nouvel abonnement créé."
          : "Abonnement enregistré. L’actualisation des données a échoué.",
      );
    } catch (cause: unknown) {
      setErreur(`Enregistrement impossible : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement(false);
    }
  }

  function sectionNom(id: string): string {
    return donnees.sections.find((section) => section.id === id)?.name ?? "Section";
  }

  function afficherTarifAnnuel(tarif: Tarif): string {
    if (tarif.annual_price !== null) return monnaie(tarif.annual_price);
    if (tarif.monthly_price !== null) return `${monnaie(Number(tarif.monthly_price) * 10)} · à confirmer`;
    return "À définir";
  }

  function listeDuree(duree: DureeAbonnement, titre: string) {
    const liste = abonnementFiltres.filter((abonnement) => abonnement.duration === duree);
    return (
      <section className="subscription-section" aria-labelledby={`liste-${duree}`}>
        <div className="subscription-section-heading">
          <h2 id={`liste-${duree}`}>{titre}</h2>
          <span className="member-payment-count">{liste.length}</span>
        </div>
        {liste.length ? (
          <Panel className="subscription-list">
            {liste.map((abonnement) => {
              const membre = donnees.membres.find((item) => item.id === abonnement.member_id);
              const tarif = donnees.tarifs.find((item) => item.id === abonnement.tariff_id);
              const status = statutPour(abonnement);
              return (
                <article className="subscription-list-item" key={abonnement.id}>
                  <div className="subscription-list-main">
                    <strong>{membre?.full_name ?? "Membre"}</strong>
                    <span>{sectionNom(abonnement.section_id)} · {categorie(tarif)}</span>
                    <small>Fin : {dateLisible(abonnement.end_date)}</small>
                  </div>
                  <div className="subscription-list-meta">
                    <StatusChip status={status} />
                    <strong>{monnaie(abonnement.price)}</strong>
                  </div>
                </article>
              );
            })}
          </Panel>
        ) : (
          <Panel>
            <p className="subscription-no-results">Aucun abonnement {duree === "annual" ? "annuel" : "mensuel"} pour ce filtre.</p>
          </Panel>
        )}
      </section>
    );
  }

  return (
    <main className="page-content subscriptions-page" aria-label="Abonnements">
      <div className="members-heading">
        <div>
          <p className="members-eyebrow">Moularès · Gafsa</p>
          <h1>Abonnements</h1>
        </div>
        <button
          className="primary-button add-member-button"
          type="button"
          onClick={ouvrirFormulaire}
          disabled={!donnees.membres.length || !sectionsActives.length}
        >
          <span aria-hidden="true">+</span> Nouvel abonnement
        </button>
      </div>

      {erreur && !mode && donnees.abonnements.length > 0 && <div className="members-error" role="alert">{erreur}</div>}

      {chargement ? (
        <Panel aria-label="Chargement des abonnements" aria-busy="true">
          <div className="members-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Chargement des abonnements…</div>
        </Panel>
      ) : erreur && !donnees.sections.length ? (
        <Panel>
          <EmptyState
            title="Les abonnements ne sont pas disponibles"
            description={erreur}
            action={<button className="secondary-button" type="button" onClick={() => void charger()}>Réessayer</button>}
          />
        </Panel>
      ) : (
        <>
          <div className="subscription-counters" aria-label="Abonnements en cours">
            <Panel className="subscription-counter">
              <span>Mensuels en cours</span>
              <strong>{compteurs.monthly}</strong>
            </Panel>
            <Panel className="subscription-counter">
              <span>Annuels en cours</span>
              <strong>{compteurs.annual}</strong>
            </Panel>
          </div>

          <section className="subscription-section" aria-labelledby="tarifs-heading">
            <div className="subscription-section-heading"><h2 id="tarifs-heading">Grille des tarifs</h2></div>
            <div className="subscription-tariff-grid">
              {donnees.sections.map((section) => (
                <Panel className="subscription-tariff-card" key={section.id}>
                  <h3>{section.name}</h3>
                  {donnees.tarifs.filter((tarif) => tarif.section_id === section.id).map((tarif) => (
                    <div className="subscription-tariff-row" key={tarif.id}>
                      <strong>{categorie(tarif)}</strong>
                      <span><small>Mensuel</small>{monnaie(tarif.monthly_price)}</span>
                      <span>
                        <small>Annuel</small>{afficherTarifAnnuel(tarif)}
                      </span>
                    </div>
                  ))}
                  {!donnees.tarifs.some((tarif) => tarif.section_id === section.id) && (
                    <p className="subscription-no-results">Tarif à définir</p>
                  )}
                </Panel>
              ))}
            </div>
            {donnees.tarifs.some((tarif) => tarif.annual_price == null && tarif.monthly_price != null) && (
              <p className="subscription-tariff-note">Les tarifs annuels estimés correspondent à 10 × le tarif mensuel et restent à confirmer.</p>
            )}
          </section>

          <section className="subscription-section" aria-label="Filtrer les listes par section">
            <FilterChips sections={sectionsActives.map((section) => section.name)} value={filtre} onChange={setFiltre} />
          </section>
          {listeDuree("annual", "Abonnements annuels")}
          {listeDuree("monthly", "Abonnements mensuels")}
          {!donnees.membres.length && (
            <Panel>
              <EmptyState title={texte("aucunMembre")} description="Touchez « + Nouveau membre » pour commencer." />
            </Panel>
          )}
        </>
      )}

      <BottomSheet
        open={mode !== null}
        title={mode === "renouvellement" ? "Renouveler un abonnement" : "Nouvel abonnement"}
        onClose={() => { setMode(null); setErreur(""); }}
      >
        <form className="member-form" onSubmit={(event) => void enregistrer(event)}>
          <label className="member-field">
            Opération
            <select
              value={mode ?? "nouveau"}
              onChange={(event) => {
                const prochainMode = event.target.value as ModeAbonnement;
                demandeAbonnementId.current = null;
                setMode(prochainMode);
                setErreur("");
                if (prochainMode === "renouvellement") {
                  const membre = donnees.membres.find((item) => item.id === formulaire.member_id);
                  const abonnement = membre?.subscriptions[0];
                  if (abonnement) {
                    setFormulaire({
                      ...formulaire,
                      subscription_id: abonnement.id,
                      section_id: abonnement.section_id,
                      tariff_id: abonnement.tariff_id,
                      duration: abonnement.duration,
                    });
                  }
                } else {
                  setFormulaire({ ...formulaire, subscription_id: "" });
                }
              }}
            >
              <option value="nouveau">Créer un abonnement</option>
              <option value="renouvellement">Renouveler un abonnement</option>
            </select>
          </label>
          <label className="member-field">
            Membre
            <select value={formulaire.member_id} onChange={(event) => changer({ member_id: event.target.value })} required>
              <option value="">Choisir un membre</option>
              {donnees.membres.map((membre) => <option key={membre.id} value={membre.id}>{membre.full_name}</option>)}
            </select>
          </label>
          {mode === "renouvellement" && (
            <label className="member-field">
              Abonnement à renouveler
              <select
                value={formulaire.subscription_id}
                onChange={(event) => {
                  const abonnement = membreChoisi?.subscriptions.find((item) => item.id === event.target.value);
                  setFormulaire((actuel) => abonnement ? {
                    ...actuel,
                    subscription_id: abonnement.id,
                    section_id: abonnement.section_id,
                    tariff_id: abonnement.tariff_id,
                    duration: abonnement.duration,
                    confirmerTarifAnnuel: false,
                    manual_price: "",
                  } : { ...actuel, subscription_id: event.target.value });
                }}
                required
                disabled={!membreChoisi?.subscriptions.length}
              >
                <option value="">Choisir un abonnement</option>
                {membreChoisi?.subscriptions.map((abonnement) => (
                  <option value={abonnement.id} key={abonnement.id}>
                    {sectionNom(abonnement.section_id)} · {abonnement.duration === "annual" ? "Annuel" : "Mensuel"} · fin {dateLisible(abonnement.end_date)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="member-form-grid">
            <label className="member-field">
              Section
              <select value={formulaire.section_id} onChange={(event) => changer({ section_id: event.target.value })} required>
                {sectionsFormulaire.map((section) => (
                  <option value={section.id} key={section.id} disabled={section.is_active === false}>
                    {section.name}{section.is_active === false ? " · désactivée" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="member-field">
              Catégorie
              <select
                value={formulaire.tariff_id}
                onChange={(event) => changer({ tariff_id: event.target.value })}
                required
                disabled={!tarifsSection.length}
              >
                {tarifsSection.map((tarif) => <option value={tarif.id} key={tarif.id}>{categorie(tarif)}</option>)}
              </select>
            </label>
          </div>
          <label className="member-field">
            Durée
            <select value={formulaire.duration} onChange={(event) => changer({ duration: event.target.value as DureeAbonnement })}>
              <option value="monthly">Mensuel · 30 jours</option>
              <option value="annual">Annuel · 365 jours</option>
            </select>
          </label>
          <Panel className="subscription-date-preview">
            <span>Début prévu <strong>{dateLisible(debutPrevu)}</strong></span>
            <span>Fin prévue <strong>{dateLisible(finPrevue)}</strong></span>
            {abonnementRenouvele && <small>Le renouvellement commence au plus tôt à la date de fin actuelle.</small>}
          </Panel>
          <div className="member-price">
            Prix de l’abonnement : <strong>{monnaie(prixEffectif)}</strong>
            {tarifEstime && <span>Proposition calculée à 10 × le prix mensuel, à confirmer avant l’enregistrement.</span>}
            {prixEffectif === null && <span>Ce prix est à définir dans Réglages &gt; Activités avant de pouvoir enregistrer.</span>}
          </div>
          {tarifEstime && (
            <label className="subscription-confirm-price">
              <input
                type="checkbox"
                checked={formulaire.confirmerTarifAnnuel}
                onChange={(event) => changer({ confirmerTarifAnnuel: event.target.checked })}
              />
              Je confirme le prix annuel proposé de {monnaie(prixEstime)}.
            </label>
          )}
          {tarifChoisi && tarifNormal == null && !tarifEstime && (
            <label className="member-field">
              Prix à définir (DT)
              <input
                type="number"
                min="0"
                step="0.001"
                inputMode="decimal"
                value={formulaire.manual_price}
                onChange={(event) => changer({ manual_price: event.target.value })}
                required
              />
            </label>
          )}
          {erreur && <div className="members-error" role="alert">{erreur}</div>}
          <div className="member-form-actions">
            <button className="secondary-button" type="button" onClick={() => setMode(null)} disabled={enregistrement}>Annuler</button>
            <button className="primary-button" type="submit" disabled={enregistrement || !donnees.membres.length || !sectionsActives.length || !tarifChoisi || prixEffectif === null || (tarifEstime && !formulaire.confirmerTarifAnnuel)}>
              {enregistrement ? "Enregistrement…" : mode === "renouvellement" ? "Renouveler" : "Créer l’abonnement"}
            </button>
          </div>
        </form>
      </BottomSheet>
      <Toast message={toast} onClose={() => setToast("")} />
    </main>
  );
}
