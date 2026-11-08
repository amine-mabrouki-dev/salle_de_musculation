import { useEffect, useState, type FormEvent } from "react";
import { messageErreur } from "../hooks/useAuth";
import { changerEtatActivite, enregistrerActivite } from "../lib/gymSettings";
import type { SalleSection, Tarif } from "../types/members";

interface BrouillonActivite {
  sectionId: string | null;
  name: string;
  coachName: string;
  coachPhone: string;
  adulteMonthly: string;
  adulteAnnual: string;
  etudiantMonthly: string;
  etudiantAnnual: string;
}

interface ActivitiesSettingsProps {
  sections: SalleSection[];
  tarifs: Tarif[];
  onChanged: () => Promise<void>;
}

const categories = [
  { key: "adulte", label: "Adulte" },
  { key: "etudiant", label: "Étudiant / enfant" },
] as const;

function brouillonVide(): BrouillonActivite {
  return {
    sectionId: null,
    name: "",
    coachName: "",
    coachPhone: "",
    adulteMonthly: "",
    adulteAnnual: "",
    etudiantMonthly: "",
    etudiantAnnual: "",
  };
}

function brouillonDepuisSection(section: SalleSection, tarifs: Tarif[]): BrouillonActivite {
  const adulte = tarifs.find((tarif) => tarif.section_id === section.id && tarif.category === "adulte");
  const etudiant = tarifs.find((tarif) => tarif.section_id === section.id && tarif.category === "etudiant_enfant");
  return {
    sectionId: section.id,
    name: section.name,
    coachName: section.coach_name ?? "",
    coachPhone: section.coach_phone ?? "",
    adulteMonthly: adulte?.monthly_price == null ? "" : String(adulte.monthly_price),
    adulteAnnual: adulte?.annual_price == null ? "" : String(adulte.annual_price),
    etudiantMonthly: etudiant?.monthly_price == null ? "" : String(etudiant.monthly_price),
    etudiantAnnual: etudiant?.annual_price == null ? "" : String(etudiant.annual_price),
  };
}

function prixOuNull(value: string): number | null {
  if (!value.trim()) return null;
  const prix = Number(value);
  if (!Number.isFinite(prix) || prix < 0) {
    throw new Error("Un tarif doit être un nombre positif ou laissé vide.");
  }
  return prix;
}

export function ActivitiesSettings({ sections, tarifs, onChanged }: ActivitiesSettingsProps) {
  const [brouillons, setBrouillons] = useState<Record<string, BrouillonActivite>>({});
  const [nouvelle, setNouvelle] = useState(brouillonVide);
  const [enregistrement, setEnregistrement] = useState("");
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setBrouillons(Object.fromEntries(sections.map((section) => [
      section.id,
      brouillonDepuisSection(section, tarifs),
    ])));
  }, [sections, tarifs]);

  function modifierBrouillon(sectionId: string, champs: Partial<BrouillonActivite>) {
    setBrouillons((actuels) => ({
      ...actuels,
      [sectionId]: { ...actuels[sectionId], ...champs },
    }));
  }

  async function enregistrer(event: FormEvent<HTMLFormElement>, brouillon: BrouillonActivite) {
    event.preventDefault();
    setErreur("");
    setMessage("");
    setEnregistrement(brouillon.sectionId ?? "nouvelle");
    try {
      await enregistrerActivite({
        sectionId: brouillon.sectionId,
        name: brouillon.name.trim(),
        coachName: brouillon.coachName.trim(),
        coachPhone: brouillon.coachPhone.trim(),
        adulteMonthly: prixOuNull(brouillon.adulteMonthly),
        adulteAnnual: prixOuNull(brouillon.adulteAnnual),
        etudiantMonthly: prixOuNull(brouillon.etudiantMonthly),
        etudiantAnnual: prixOuNull(brouillon.etudiantAnnual),
      });
      await onChanged();
      if (brouillon.sectionId === null) setNouvelle(brouillonVide());
      setMessage(`Activité « ${brouillon.name.trim()} » enregistrée.`);
    } catch (cause: unknown) {
      setErreur(`Enregistrement de l’activité impossible : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement("");
    }
  }

  async function changerActivation(section: SalleSection) {
    setErreur("");
    setMessage("");
    setEnregistrement(`activation-${section.id}`);
    try {
      await changerEtatActivite(section.id, section.is_active === false);
      await onChanged();
      setMessage(`Activité « ${section.name} » ${section.is_active === false ? "réactivée" : "désactivée"}.`);
    } catch (cause: unknown) {
      setErreur(`Modification de l’activité impossible : ${messageErreur(cause)}`);
    } finally {
      setEnregistrement("");
    }
  }

  function champsActivite(brouillon: BrouillonActivite, modifier: (champs: Partial<BrouillonActivite>) => void) {
    return (
      <>
        <div className="member-form-grid">
          <label className="member-field">
            Nom de l’activité
            <input value={brouillon.name} maxLength={80} onChange={(event) => modifier({ name: event.target.value })} required />
          </label>
          <label className="member-field">
            Nom du coach
            <input value={brouillon.coachName} maxLength={120} onChange={(event) => modifier({ coachName: event.target.value })} />
          </label>
        </div>
        <label className="member-field">
          Téléphone du coach
          <input type="tel" inputMode="tel" value={brouillon.coachPhone} maxLength={32} onChange={(event) => modifier({ coachPhone: event.target.value })} />
        </label>
        <div className="activity-tariffs">
          {categories.map((category) => {
            const monthlyKey = category.key === "adulte" ? "adulteMonthly" : "etudiantMonthly";
            const annualKey = category.key === "adulte" ? "adulteAnnual" : "etudiantAnnual";
            return (
              <fieldset className="activity-tariff" key={category.key}>
                <legend>{category.label}</legend>
                <label className="member-field">
                  Mensuel (DT)
                  <input type="number" min="0" step="0.001" inputMode="decimal" placeholder="À définir" value={brouillon[monthlyKey]} onChange={(event) => modifier({ [monthlyKey]: event.target.value })} />
                </label>
                <label className="member-field">
                  Annuel (DT)
                  <input type="number" min="0" step="0.001" inputMode="decimal" placeholder="À définir" value={brouillon[annualKey]} onChange={(event) => modifier({ [annualKey]: event.target.value })} />
                </label>
              </fieldset>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <section className="activities-settings" aria-labelledby="activities-heading">
      <header>
        <h2 id="activities-heading">Activités</h2>
        <p>Ajoutez et gérez les sections, leurs coachs et leurs tarifs. Un prix vide reste « À définir ».</p>
      </header>
      {erreur && <p className="auth-error" role="alert">{erreur}</p>}
      {message && <p className="activity-settings-message" role="status">{message}</p>}

      <form className="settings-subsection" onSubmit={(event) => void enregistrer(event, nouvelle)}>
        <h3>Ajouter une activité</h3>
        {champsActivite(nouvelle, (champs) => setNouvelle((actuelle) => ({ ...actuelle, ...champs })))}
        <button className="primary-button" type="submit" disabled={enregistrement !== ""}>
          {enregistrement === "nouvelle" ? "Enregistrement…" : "Ajouter l’activité"}
        </button>
      </form>

      {sections.map((section) => {
        const brouillon = brouillons[section.id] ?? brouillonDepuisSection(section, tarifs);
        const verrouille = enregistrement !== "";
        const active = section.is_active !== false;
        return (
          <form
            className={`settings-subsection activity-settings-item${active ? "" : " activity-settings-item-inactive"}`}
            key={section.id}
            onSubmit={(event) => void enregistrer(event, brouillon)}
          >
            <div className="activity-settings-heading">
              <h3>{section.name}</h3>
              <span>{active ? "Active" : "Désactivée"}</span>
            </div>
            {champsActivite(brouillon, (champs) => modifierBrouillon(section.id, champs))}
            <div className="activity-settings-actions">
              <button className="secondary-button" type="submit" disabled={verrouille}>
                {enregistrement === section.id ? "Enregistrement…" : "Enregistrer les modifications"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void changerActivation(section)}
                disabled={verrouille}
                aria-label={`${active ? "Désactiver" : "Réactiver"} ${section.name}`}
              >
                {enregistrement === `activation-${section.id}` ? "Mise à jour…" : active ? "Désactiver" : "Réactiver"}
              </button>
            </div>
            <p className="settings-hint">Les activités ayant un historique ne sont pas supprimées : désactivez-les pour les retirer des nouveaux abonnements.</p>
          </form>
        );
      })}
    </section>
  );
}
