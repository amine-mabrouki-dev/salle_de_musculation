import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Abonnement, DureeAbonnement, SalleSection, Tarif } from "../types/members";
import { MemberAvatar } from "./MemberAvatar";
import { texte } from "../lib/textes";

export interface FormulaireMembre {
  full_name: string;
  phone: string;
  section_id: string;
  tariff_id: string;
  duration: DureeAbonnement;
  start_date: string;
  subscription_id: string;
}

interface MemberFormProps {
  formulaire: FormulaireMembre;
  sections: SalleSection[];
  tarifs: Tarif[];
  prix: number | null;
  erreur: string;
  enregistrement: boolean;
  modification?: boolean;
  abonnements?: Abonnement[];
  photoPath?: string | null;
  photoFile: File | null;
  supprimerPhoto: boolean;
  onChange: (champs: Partial<FormulaireMembre>) => void;
  onPhotoChange: (file: File | null) => void;
  onSupprimerPhoto: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAnnuler: () => void;
}

const categories: Record<Tarif["category"], string> = {
  adulte: "Adulte",
  etudiant_enfant: "Étudiant / enfant",
};

function monnaie(value: number | null): string {
  if (value === null) return "À définir";
  return `${new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 3 }).format(value)} DT`;
}

export function MemberForm({
  formulaire,
  sections,
  tarifs,
  prix,
  erreur,
  enregistrement,
  modification = false,
  abonnements = [],
  photoPath,
  photoFile,
  supprimerPhoto,
  onChange,
  onPhotoChange,
  onSupprimerPhoto,
  onSubmit,
  onAnnuler,
}: MemberFormProps) {
  const edition = modification;
  const telephoneValide = /^\d{8}$/.test(formulaire.phone.replace(/\D/g, ""));
  const abonnementSelectionne = !edition || Boolean(formulaire.subscription_id);
  const [apercuPhoto, setApercuPhoto] = useState<string | null>(null);
  const galerieInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photoFile) {
      setApercuPhoto(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setApercuPhoto(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  function choisirPhoto(event: ChangeEvent<HTMLInputElement>) {
    onPhotoChange(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  return (
    <form className="member-form" onSubmit={(event) => void onSubmit(event)}>
      <label className="member-field">
        {texte("nom")}
        <input
          value={formulaire.full_name}
          onChange={(event) => onChange({ full_name: event.target.value })}
          autoComplete="name"
          maxLength={120}
          required
        />
      </label>
      <label className="member-field">
        {texte("telephone")}
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="XX XXX XXX"
          value={formulaire.phone}
          onChange={(event) => onChange({ phone: event.target.value })}
          aria-describedby="telephone-aide"
          aria-invalid={formulaire.phone.length > 0 && !telephoneValide}
          required
        />
        <span className="member-field-hint" id="telephone-aide">
          {formulaire.phone.length > 0 && !telephoneValide
            ? texte("telephoneHuitChiffres")
            : texte("telephoneAide")}
        </span>
      </label>

      <section className="member-photo-field" aria-labelledby="member-photo-title">
        <h3 id="member-photo-title">Photo du membre <span>(facultative)</span></h3>
        <div className="member-photo-control">
          {apercuPhoto ? (
            <img className="member-avatar member-photo-preview" src={apercuPhoto} alt="Aperçu de la photo sélectionnée" />
          ) : photoPath && !supprimerPhoto && edition ? (
            <MemberAvatar nom={formulaire.full_name || "membre"} photoPath={photoPath} className="member-photo-preview" />
          ) : (
            <span className="member-photo-empty" aria-hidden="true">+</span>
          )}
          <div className="member-photo-actions">
            <button
              className="secondary-button member-photo-picker"
              type="button"
              onClick={() => galerieInput.current?.click()}
            >
              {photoFile ? "Choisir depuis la galerie" : "Choisir dans la galerie"}
            </button>
            <button
              className="member-photo-camera"
              type="button"
              onClick={() => cameraInput.current?.click()}
            >
              Prendre une photo
            </button>
            <input
              ref={galerieInput}
              className="member-photo-input"
              type="file"
              accept="image/*"
              onChange={choisirPhoto}
              tabIndex={-1}
              aria-hidden="true"
            />
            <input
              ref={cameraInput}
              className="member-photo-input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={choisirPhoto}
              tabIndex={-1}
              aria-hidden="true"
            />
            {photoFile && (
              <button className="member-photo-clear" type="button" onClick={() => onPhotoChange(null)}>
                Annuler la sélection
              </button>
            )}
            {!photoFile && photoPath && edition && !supprimerPhoto && (
              <button className="member-photo-clear" type="button" onClick={onSupprimerPhoto}>
                Supprimer la photo
              </button>
            )}
            {supprimerPhoto && (
              <button className="member-photo-clear" type="button" onClick={onSupprimerPhoto}>
                Conserver la photo actuelle
              </button>
            )}
          </div>
        </div>
        <p className="member-field-hint">JPEG, PNG ou autre image (12 Mo maximum). L’envoi nécessite une connexion Internet.</p>
      </section>

      {edition && (
        <label className="member-field">
          Abonnement à modifier
          <select
            value={formulaire.subscription_id}
            onChange={(event) => onChange({ subscription_id: event.target.value })}
          >
            <option value="">Fiche membre uniquement</option>
            {abonnements.map((abonnement) => {
              const section = sections.find((item) => item.id === abonnement.section_id)?.name ?? "Abonnement";
              return (
                <option key={abonnement.id} value={abonnement.id}>
                  {section} · {abonnement.duration === "annual" ? "Annuel" : "Mensuel"}
                </option>
              );
            })}
          </select>
        </label>
      )}

      {abonnementSelectionne && (
        <>
          <div className="member-form-grid">
            <label className="member-field">
              {texte("activite")}
              <select
                value={formulaire.section_id}
                onChange={(event) => onChange({ section_id: event.target.value })}
                required
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id} disabled={section.is_active === false}>
                    {section.name}{section.is_active === false ? " · désactivée" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="member-field">
              {texte("tarif")}
              <select
                value={formulaire.tariff_id}
                onChange={(event) => onChange({ tariff_id: event.target.value })}
                required={tarifs.length > 0}
                disabled={!tarifs.length}
              >
                {tarifs.map((tarif) => (
                  <option key={tarif.id} value={tarif.id}>{categories[tarif.category]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="member-form-grid">
            <label className="member-field">
              Durée (facultative)
              <select
                value={formulaire.duration}
                onChange={(event) => onChange({ duration: event.target.value as DureeAbonnement })}
              >
                <option value="monthly">Mensuel</option>
                <option value="annual">Annuel</option>
              </select>
            </label>
            <label className="member-field">
              Date de début (facultative)
              <input
                type="date"
                value={formulaire.start_date}
                onChange={(event) => onChange({ start_date: event.target.value })}
              />
            </label>
          </div>
          <p className="member-price">
            Tarif de la formule : <strong>{monnaie(prix)}</strong>
            {prix === null && <span> · À définir dans Réglages &gt; Activités</span>}
          </p>
        </>
      )}

      {erreur && <div className="members-error" role="alert">{erreur}</div>}
      <div className="member-form-actions">
        <button className="secondary-button" type="button" onClick={onAnnuler} disabled={enregistrement}>
          Annuler
        </button>
        <button
          className="primary-button"
          type="submit"
          disabled={
            enregistrement ||
            !sections.length ||
            !telephoneValide ||
            (!tarifs.length && (!edition || Boolean(formulaire.subscription_id))) ||
            (abonnementSelectionne && prix === null)
          }
        >
          {enregistrement ? "Enregistrement…" : modification ? "Enregistrer" : "Ajouter le membre"}
        </button>
      </div>
    </form>
  );
}
