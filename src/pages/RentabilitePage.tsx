import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { EmptyState } from "../components/EmptyState";
import { Panel } from "../components/Panel";
import { Toast } from "../components/Toast";
import { DateInput } from "../components/DateInput";
import { messageErreur } from "../hooks/useAuth";
import { utilisateurConnecteId } from "../lib/offlineStore";
import { calculerResumeFinancierMensuel } from "../lib/financialLedger";
import { formaterMontantDT } from "../lib/money";
import { EVENEMENT_DONNEES_LOCALES_MAJ } from "../lib/localDatabase";
import { lireDonneesLocales, nouvelleLigne, enregistrerLocalement } from "../lib/localRepository";
import { annulerDepense } from "../lib/expenseCancellations";
import { nomActiviteAffiche, texte } from "../lib/textes";
import type { CategorieDepense, SalleSection } from "../types/members";
import { capturerPositionDefilement, restaurerPositionDefilement } from "../lib/scrollPosition";

interface Depense {
  id: string;
  label: string;
  amount: number | string;
  category: CategorieDepense;
  section_id: string | null;
  spent_at: string;
  deleted_at?: string | null;
  cancelled_at?: string | null;
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
  paiements: PaiementRentabilite[];
  depenses: Depense[];
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
  paiements: [],
  depenses: [],
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
      setDonnees({
        sections: local.sections,
        paiements: local.paiements.map((payment) => ({
          id: payment.id,
          member_id: payment.member_id,
          amount: payment.amount,
          paid_at: payment.paid_at,
          deleted_at: payment.deleted_at,
          cancelled_at: payment.cancelled_at,
        })),
        depenses: [...local.depenses].sort((a, b) => b.spent_at.localeCompare(a.spent_at)),
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

  const resumeMensuel = calculerResumeFinancierMensuel(
    donnees.paiements,
    donnees.depenses,
    mois,
    donnees.membresDemo,
  );
  const depensesDuMois = donnees.depenses.filter((depense) =>
    !depense.label.startsWith("[DÉMO]")
    && depense.deleted_at == null
    && depense.cancelled_at == null
    && cleMoisTunis(depense.spent_at) === mois,
  );

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
              <strong className="profit-positive">{monnaie(resumeMensuel.encaissements)}</strong>
            </Panel>
            <Panel className="profitability-result">
              <span>{texte("depensesSalle")}</span>
              <strong>{monnaie(resumeMensuel.depenses)}</strong>
            </Panel>
            <Panel className="profitability-result">
              <span>{texte("benefice")}</span>
              <strong className={resumeMensuel.benefice >= 0 ? "profit-positive" : "profit-negative"}>{monnaie(resumeMensuel.benefice)}</strong>
            </Panel>
          </section>

          <section className="profitability-section" aria-labelledby="expenses-heading">
            <div className="profitability-section-heading">
              <div>
                <h2 id="expenses-heading">Dépenses</h2>
                <p>{moisLisible(mois)} · {depensesDuMois.length} enregistrement{depensesDuMois.length > 1 ? "s" : ""}</p>
              </div>
              <strong>{monnaie(resumeMensuel.depenses)}</strong>
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
                  <div className="member-field">
                    <label htmlFor="expense-date">Date</label>
                    <DateInput
                      id="expense-date"
                      min={`${mois}-01`}
                      max={mois === moisTunis() ? dateTunis() : dateParDefautDuMois(mois)}
                      value={formulaire.spent_at}
                      onChange={(spent_at) => setFormulaire((actuel) => ({ ...actuel, spent_at }))}
                      required
                    />
                  </div>
                </div>
                <button className="primary-button expense-submit-button" type="submit" disabled={enregistrement}>
                  {enregistrement ? "Enregistrement…" : "Ajouter la dépense"}
                </button>
              </form>
            </Panel>

            <div className="expense-list" aria-live="polite">
              {depensesDuMois.length ? depensesDuMois.map((depense) => (
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
        </>
      )}
      <Toast message={toast} onClose={() => setToast("")} />
    </main>
  );
}
