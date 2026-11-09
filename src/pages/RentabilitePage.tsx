import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { EmptyState } from "../components/EmptyState";
import { Panel } from "../components/Panel";
import { Toast } from "../components/Toast";
import { messageErreur } from "../hooks/useAuth";
import { utilisateurConnecteId } from "../lib/offlineStore";
import { calculerProfit, resteAbonnementsMois, valeurAbonnementsMois } from "../lib/calculations";
import { totalEncaissementsDuMois } from "../lib/financialLedger";
import { formaterMontantDT } from "../lib/money";
import { EVENEMENT_DONNEES_LOCALES_MAJ } from "../lib/localDatabase";
import { lireDonneesLocales, nouvelleLigne, enregistrerLocalement } from "../lib/localRepository";
import { annulerDepense } from "../lib/expenseCancellations";
import { nomActiviteAffiche, texte } from "../lib/textes";
import type { CategorieDepense, SalleSection, Tarif } from "../types/members";
import { capturerPositionDefilement, restaurerPositionDefilement } from "../lib/scrollPosition";

interface Depense {
  id: string;
  label: string;
  amount: number | string;
  category: CategorieDepense;
  section_id: string | null;
  spent_at: string;
}

interface PaiementRentabilite {
  id: string;
  member_id: string;
  amount: number | string;
  paid_at: string;
  deleted_at?: string | null;
  cancelled_at?: string | null;
}

interface DonneesRentabilite {
  sections: SalleSection[];
  tarifs: Tarif[];
  paiements: PaiementRentabilite[];
  depenses: Depense[];
  paiementsGraphique: PaiementRentabilite[];
  abonnementsGraphique: {
    id: string;
    member_id: string;
    price: number | string | null;
    amount_due: number | string;
    start_date: string;
    local_created_at?: string;
    deleted_at?: string | null;
  }[];
  membresDemo: Set<string>;
}

interface FormulaireDepense {
  label: string;
  amount: string;
  category: CategorieDepense;
  section_id: string;
  spent_at: string;
}

const categoriesDepense: { value: CategorieDepense; label: string }[] = [
  { value: "loyer", label: "Loyer" },
  { value: "salaire_coach", label: "Salaire coach" },
  { value: "energie", label: "Énergie" },
  { value: "entretien", label: "Entretien" },
  { value: "publicite", label: "Publicité" },
  { value: "materiel", label: "Matériel" },
  { value: "autre", label: "Autre" },
];

const donneesInitiales: DonneesRentabilite = {
  sections: [],
  tarifs: [],
  paiements: [],
  depenses: [],
  paiementsGraphique: [],
  abonnementsGraphique: [],
  membresDemo: new Set(),
};

function moisTunis(): string {
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const valeur = (type: string) => parties.find((partie) => partie.type === type)?.value ?? "";
  return `${valeur("year")}-${valeur("month")}`;
}

function dateTunis(): string {
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valeur = (type: string) => parties.find((partie) => partie.type === type)?.value ?? "";
  return `${valeur("year")}-${valeur("month")}-${valeur("day")}`;
}

function dateParDefautDuMois(mois: string): string {
  const [annee, numeroMois] = mois.split("-").map(Number);
  const dernierJour = new Date(Date.UTC(annee, numeroMois, 0)).getUTCDate();
  const jour = mois === moisTunis()
    ? Number(dateTunis().slice(8, 10))
    : dernierJour;
  return `${mois}-${String(Math.min(jour, dernierJour)).padStart(2, "0")}`;
}

function decalerMois(mois: string, decalage: number): string {
  const [annee, numeroMois] = mois.split("-").map(Number);
  return new Date(Date.UTC(annee, numeroMois - 1 + decalage, 1)).toISOString().slice(0, 7);
}

function cleMoisTunis(date: string): string {
  if (!Number.isFinite(new Date(date).getTime())) return "";
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(date));
  const valeur = (type: string) => parties.find((partie) => partie.type === type)?.value ?? "";
  return `${valeur("year")}-${valeur("month")}`;
}

function moisLisible(mois: string, options: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }): string {
  return new Intl.DateTimeFormat("fr-TN", { timeZone: "Africa/Tunis", ...options })
    .format(new Date(`${mois}-15T12:00:00Z`));
}

function monnaie(value: number): string {
  return `${formaterMontantDT(value)} DT`;
}

function categorieLibelle(categorie: CategorieDepense): string {
  return categoriesDepense.find((item) => item.value === categorie)?.label ?? "Autre";
}

function dateLisible(date: string): string {
  return new Intl.DateTimeFormat("fr-TN", {
    timeZone: "Africa/Tunis",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
}

function nombre(value: number): string {
  return formaterMontantDT(value, "fr-TN", { useGrouping: false });
}

export function RentabilitePage() {
  const [mois, setMois] = useState(moisTunis);
  const [donnees, setDonnees] = useState<DonneesRentabilite>(donneesInitiales);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [toast, setToast] = useState("");
  const [formulaire, setFormulaire] = useState<FormulaireDepense>(() => ({
    label: "",
    amount: "",
    category: "autre",
    section_id: "",
    spent_at: dateParDefautDuMois(moisTunis()),
  }));
  const dejaCharge = useRef(false);

  const charger = useCallback(async (): Promise<boolean> => {
    const positionDefilement = capturerPositionDefilement();
    if (!dejaCharge.current) setChargement(true);
    setErreur("");
    try {
      const userId = await utilisateurConnecteId();
      const local = await lireDonneesLocales(userId);
      const membresDemo = new Set(local.membres
        .filter((member) => member.notes?.startsWith("[DÉMO]"))
        .map((member) => member.id));
      const premierMois = decalerMois(mois, -5);
      const moisSuivant = decalerMois(mois, 1);
      const paiementsVus = new Set<string>();
      const paiementsGraphique: PaiementRentabilite[] = local.paiements.flatMap((payment) => {
          const month = cleMoisTunis(payment.paid_at);
          if (
            !payment.id
            || paiementsVus.has(payment.id)
            || payment.deleted_at != null
            || payment.cancelled_at != null
            || membresDemo.has(payment.member_id)
            || month < premierMois
            || month >= moisSuivant
          ) return [];
          paiementsVus.add(payment.id);
          return [{
            id: payment.id,
            member_id: payment.member_id,
            amount: payment.amount,
            paid_at: payment.paid_at,
            deleted_at: payment.deleted_at,
            cancelled_at: payment.cancelled_at,
          }];
        });
      setDonnees({
        sections: local.sections,
        tarifs: local.tarifs,
        paiements: paiementsGraphique.filter((payment) => cleMoisTunis(payment.paid_at) === mois),
        depenses: local.depenses
          .filter((expense) =>
            !expense.label.startsWith("[DÉMO]")
            && cleMoisTunis(expense.spent_at) === mois,
          )
          .sort((a, b) => b.spent_at.localeCompare(a.spent_at)),
        paiementsGraphique,
        abonnementsGraphique: local.abonnements.filter((subscription) => {
          const dateCreation = subscription.local_created_at ?? subscription.start_date;
          const month = cleMoisTunis(dateCreation);
          return !membresDemo.has(subscription.member_id)
            && month >= premierMois
            && month < moisSuivant;
        }),
        membresDemo,
      });
      dejaCharge.current = true;
      return true;
    } catch (cause: unknown) {
      setErreur(`Chargement des données de rentabilité impossible : ${messageErreur(cause)}`);
      return false;
    } finally {
      setChargement(false);
      restaurerPositionDefilement(positionDefilement);
    }
  }, [mois]);

  useEffect(() => {
    void charger();
    window.addEventListener("online", charger);
    window.addEventListener(EVENEMENT_DONNEES_LOCALES_MAJ, charger);
    return () => {
      window.removeEventListener("online", charger);
      window.removeEventListener(EVENEMENT_DONNEES_LOCALES_MAJ, charger);
    };
  }, [charger]);

  useEffect(() => {
    setFormulaire((actuel) => ({
      ...actuel,
      spent_at: actuel.spent_at.slice(0, 7) === mois ? actuel.spent_at : dateParDefautDuMois(mois),
    }));
  }, [mois]);

  const revenusFiltres = totalEncaissementsDuMois(donnees.paiements, mois, donnees.membresDemo);
  const valeurAbonnements = valeurAbonnementsMois(donnees.abonnementsGraphique, mois, donnees.membresDemo);
  const resteAPayer = resteAbonnementsMois(donnees.abonnementsGraphique, mois, donnees.membresDemo);
  const depenses = donnees.depenses.reduce((somme, depense) => somme + Number(depense.amount), 0);
  const profit = calculerProfit(revenusFiltres, depenses);
  const graphiqueSixMois = useMemo(() => {
    const moisGraphiques = Array.from({ length: 6 }, (_valeur, index) => decalerMois(mois, index - 5));
    const series = moisGraphiques.map((cle) => ({
      cle,
      label: moisLisible(cle, { month: "short" }),
      revenu: donnees.paiementsGraphique
        .filter((paiement) => cleMoisTunis(paiement.paid_at) === cle)
        .reduce((somme, paiement) => somme + Number(paiement.amount), 0),
    }));
    return {
      series,
      maximum: Math.max(...series.map((item) => item.revenu), 1),
    };
  }, [donnees.paiementsGraphique, mois]);
  const graphiqueAbonnementsSixMois = useMemo(() => {
    const moisGraphiques = Array.from({ length: 6 }, (_valeur, index) => decalerMois(mois, index - 5));
    const series = moisGraphiques.map((cle) => ({
      cle,
      label: moisLisible(cle, { month: "short" }),
      valeur: valeurAbonnementsMois(donnees.abonnementsGraphique, cle),
    }));
    return {
      series,
      maximum: Math.max(...series.map((item) => item.valeur), 1),
    };
  }, [donnees.abonnementsGraphique, donnees.membresDemo, mois]);

  async function ajouterDepense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const montant = Number(formulaire.amount);
    if (!formulaire.label.trim() || formulaire.label.trim().length > 120) {
      setErreur("Le libellé doit contenir entre 1 et 120 caractères.");
      return;
    }
    if (!Number.isFinite(montant) || montant <= 0) {
      setErreur("Le montant doit être supérieur à zéro.");
      return;
    }
    if (!formulaire.spent_at || formulaire.spent_at.slice(0, 7) !== mois) {
      setErreur("La date de la dépense doit appartenir au mois sélectionné.");
      return;
    }

    setEnregistrement(true);
    setErreur("");
    try {
      const userId = await utilisateurConnecteId();
      await enregistrerLocalement(userId, "expenses", nouvelleLigne({
        user_id: userId,
        label: formulaire.label.trim(),
        amount: montant,
        category: formulaire.category,
        section_id: formulaire.section_id || null,
        spent_at: `${formulaire.spent_at}T12:00:00+01:00`,
      }));
      setFormulaire((actuel) => ({ ...actuel, label: "", amount: "", category: "autre", section_id: "" }));
      const actualisationReussie = await charger();
      setToast(
        actualisationReussie
          ? "Dépense enregistrée."
          : "Dépense enregistrée, mais l’actualisation de la page a échoué.",
      );
    } catch (cause: unknown) {
      setErreur(`Ajout de la dépense impossible : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement(false);
    }
  }

  async function annulerUneDepense(depense: Depense) {
    const confirmer = window.confirm(texte("depenseAnnulationConfirmer").replace("{nom}", depense.label));
    if (!confirmer) return;
    const reason = window.prompt("Indiquez le motif de l’annulation :", "")?.trim();
    if (!reason) return;

    setErreur("");
    setEnregistrement(true);
    try {
      await annulerDepense(depense.id, reason);
      const actualisationReussie = await charger();
      setToast(
        actualisationReussie
          ? "Dépense annulée."
          : "Dépense annulée, mais l’actualisation de la page a échoué.",
      );
    } catch (cause: unknown) {
      setErreur(`Annulation de la dépense impossible : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement(false);
    }
  }

  return (
    <main className="page-content profitability-page" aria-label={texte("beneficeTitre")}>
      <header className="profitability-heading">
        <div>
          <p className="members-eyebrow">Moularès · Gafsa</p>
          <h1>{texte("beneficeTitre")}</h1>
        </div>
        <label className="profitability-month-field">
          <span>{texte("mois")}</span>
          <input type="month" value={mois} max={moisTunis()} onChange={(event) => setMois(event.target.value)} />
        </label>
      </header>

      <p className="profitability-notice">{texte("descriptionRentabilite")}</p>
      {erreur && <div className="members-error" role="alert">{erreur}</div>}

      {chargement ? (
        <Panel aria-label="Chargement de la rentabilité" aria-busy="true">
          <div className="members-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Chargement de {moisLisible(mois)}…</div>
        </Panel>
      ) : erreur && !dejaCharge.current ? (
        <Panel>
          <EmptyState
            title={texte("rentabiliteIndisponible")}
            description={erreur}
            action={<button className="secondary-button" type="button" onClick={() => void charger()}>{texte("reessayer")}</button>}
          />
        </Panel>
      ) : (
        <>
          <section className="profitability-summary-grid" aria-label={`${texte("beneficeTitre")} · ${moisLisible(mois)}`}>
            <Panel className="profitability-result">
              <span>{texte("argentRecu")}</span>
              <strong className="profit-positive">{monnaie(revenusFiltres)}</strong>
              <p>{texte("explicationRevenus")}</p>
              <details className="metric-help">
                <summary aria-label={texte("aideMontant")}>?</summary>
                <p>{texte("detailRevenus")}</p>
              </details>
            </Panel>
            <Panel className="profitability-result">
              <span>{texte("resteAPayer")}</span>
              <strong>{monnaie(resteAPayer)}</strong>
              <p>{texte("explicationResteAPayer")}</p>
              <details className="metric-help">
                <summary aria-label={texte("aideMontant")}>?</summary>
                <p>{texte("detailResteAPayer")}</p>
              </details>
            </Panel>
            <Panel className="profitability-result">
              <span>{texte("valeurAbonnements")}</span>
              <strong>{monnaie(valeurAbonnements)}</strong>
              <p>{texte("explicationValeurAbonnements")}</p>
              <details className="metric-help">
                <summary aria-label={texte("aideMontant")}>?</summary>
                <p>{texte("detailValeurAbonnements")}</p>
              </details>
            </Panel>
            <Panel className="profitability-result">
              <span>{texte("depensesSalle")}</span>
              <strong>{monnaie(depenses)}</strong>
              <p>{texte("explicationDepenses")}</p>
              <details className="metric-help">
                <summary aria-label={texte("aideMontant")}>?</summary>
                <p>{texte("detailDepenses")}</p>
              </details>
            </Panel>
            <Panel className="profitability-result">
              <span>{texte("benefice")}</span>
              <strong className={profit >= 0 ? "profit-positive" : "profit-negative"}>{monnaie(profit)}</strong>
              <p>{texte("explicationBenefice")}</p>
              <details className="metric-help">
                <summary aria-label={texte("aideMontant")}>?</summary>
                <p>{texte("detailBenefice")}</p>
              </details>
            </Panel>
          </section>

          <section className="profitability-section" aria-labelledby="income-chart-heading">
            <div className="profitability-section-heading">
              <h2 id="income-chart-heading">{texte("graphiqueArgentRecu")}</h2>
            </div>
            <Panel className="income-chart" role="img" aria-label={`Revenus encaissés sur six mois, jusqu’à ${moisLisible(mois)}`}>
              <div className="income-chart-bars">
                {graphiqueSixMois.series.map((item) => (
                  <div className="income-chart-column" key={item.cle} aria-label={`${moisLisible(item.cle)} : ${monnaie(item.revenu)}`}>
                    <span className="income-chart-value">{item.revenu > 0 ? nombre(item.revenu) : "—"}</span>
                    <div className="income-chart-bar-track">
                      <span style={{ height: `${item.revenu > 0 ? Math.max(4, item.revenu / graphiqueSixMois.maximum * 100) : 0}%` }} />
                    </div>
                    <span className="income-chart-label">{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="income-chart-unit">{texte("detailGraphique")}</p>
            </Panel>
          </section>

          <section className="profitability-section" aria-labelledby="subscriptions-chart-heading">
            <div className="profitability-section-heading">
              <h2 id="subscriptions-chart-heading">{texte("graphiqueValeurAbonnements")}</h2>
            </div>
            <Panel className="income-chart" role="img" aria-label={`${texte("graphiqueValeurAbonnements")} · ${moisLisible(mois)}`}>
              <div className="income-chart-bars">
                {graphiqueAbonnementsSixMois.series.map((item) => (
                  <div className="income-chart-column" key={item.cle} aria-label={`${moisLisible(item.cle)} : ${monnaie(item.valeur)}`}>
                    <span className="income-chart-value">{item.valeur > 0 ? nombre(item.valeur) : "—"}</span>
                    <div className="income-chart-bar-track">
                      <span style={{ height: `${item.valeur > 0 ? Math.max(4, item.valeur / graphiqueAbonnementsSixMois.maximum * 100) : 0}%` }} />
                    </div>
                    <span className="income-chart-label">{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="income-chart-unit">{texte("detailGraphiqueValeurAbonnements")}</p>
            </Panel>
          </section>

          <section className="profitability-section" aria-labelledby="expenses-heading">
            <div className="profitability-section-heading">
              <div>
                <h2 id="expenses-heading">Dépenses</h2>
                <p>{moisLisible(mois)} · {donnees.depenses.length} enregistrement{donnees.depenses.length > 1 ? "s" : ""}</p>
              </div>
              <strong>{monnaie(depenses)}</strong>
            </div>

            <Panel className="expense-entry-panel">
              <form className="expense-entry-form" onSubmit={(event) => void ajouterDepense(event)}>
                <label className="member-field">
                  Libellé
                  <input
                    value={formulaire.label}
                    onChange={(event) => setFormulaire((actuel) => ({ ...actuel, label: event.target.value }))}
                    placeholder="Ex. facture STEG"
                    maxLength={120}
                    required
                  />
                </label>
                <div className="member-form-grid">
                  <label className="member-field">
                    Montant (DT)
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      inputMode="decimal"
                      value={formulaire.amount}
                      onChange={(event) => setFormulaire((actuel) => ({ ...actuel, amount: event.target.value }))}
                      placeholder="0,000"
                      required
                    />
                  </label>
                  <label className="member-field">
                    Catégorie
                    <select
                      value={formulaire.category}
                      onChange={(event) => setFormulaire((actuel) => ({ ...actuel, category: event.target.value as CategorieDepense }))}
                    >
                      {categoriesDepense.map((categorie) => <option value={categorie.value} key={categorie.value}>{categorie.label}</option>)}
                    </select>
                  </label>
                </div>
                <div className="member-form-grid">
                  <label className="member-field">
                    Section (facultatif)
                    <select
                      value={formulaire.section_id}
                      onChange={(event) => setFormulaire((actuel) => ({ ...actuel, section_id: event.target.value }))}
                    >
                      <option value="">Charges communes</option>
                      {donnees.sections.filter((section) => section.is_active !== false).map((section) => <option value={section.id} key={section.id}>{nomActiviteAffiche(section.name)}</option>)}
                    </select>
                  </label>
                  <label className="member-field">
                    Date
                    <input
                      type="date"
                      min={`${mois}-01`}
                      max={mois === moisTunis() ? dateTunis() : dateParDefautDuMois(mois)}
                      value={formulaire.spent_at}
                      onChange={(event) => setFormulaire((actuel) => ({ ...actuel, spent_at: event.target.value }))}
                      required
                    />
                  </label>
                </div>
                <button className="primary-button expense-submit-button" type="submit" disabled={enregistrement}>
                  {enregistrement ? "Enregistrement…" : "Ajouter la dépense"}
                </button>
              </form>
            </Panel>

            <div className="expense-list" aria-live="polite">
              {donnees.depenses.length ? donnees.depenses.map((depense) => (
                <Panel className="expense-list-item" key={depense.id}>
                  <div>
                    <strong>{depense.label}</strong>
                    <span>{categorieLibelle(depense.category)} · {depense.section_id ? nomActiviteAffiche(donnees.sections.find((section) => section.id === depense.section_id)?.name ?? "Section") : "Charges communes"}</span>
                    <small>{dateLisible(depense.spent_at)}</small>
                  </div>
                  <div className="expense-list-actions">
                    <strong>{monnaie(Number(depense.amount))}</strong>
                    <button
                      className="expense-cancel-button"
                      type="button"
                      disabled={enregistrement}
                      onClick={() => void annulerUneDepense(depense)}
                    >
                      Annuler
                    </button>
                  </div>
                </Panel>
              )) : (
                <Panel>
                  <EmptyState title="Aucune dépense" description="Ajoutez une dépense pour suivre les charges de ce mois." />
                </Panel>
              )}
            </div>
          </section>
          <p className="profitability-annual-note">Les abonnements annuels sont comptés au mois de leur encaissement. Leur répartition sur 12 mois viendra plus tard.</p>
        </>
      )}
      <Toast message={toast} onClose={() => setToast("")} />
    </main>
  );
}
