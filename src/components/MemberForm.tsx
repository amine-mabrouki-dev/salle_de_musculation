import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Abonnement, DureeAbonnement, SalleSection, Tarif } from "../types/members";
import { MemberAvatar } from "./MemberAvatar";
import { nomActiviteAffiche, texte } from "../lib/textes";
import { formaterMontantDT } from "../lib/money";

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

function monnaie(value: number | null): string {
  if (value === null) return "À définir";
  return `${formaterMontantDT(value)} DT`;
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
  const [cameraActive, setCameraActive] = useState(false);
  const [erreurCamera, setErreurCamera] = useState("");
  const galerieInput = useRef<HTMLInputElement>(null);
  const fichiersInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const videoCamera = useRef<HTMLVideoElement>(null);
  const fluxCamera = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!photoFile) {
      setApercuPhoto(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setApercuPhoto(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    if (!cameraActive || !videoCamera.current || !fluxCamera.current) return;
    videoCamera.current.srcObject = fluxCamera.current;
    void videoCamera.current.play().catch(() => setErreurCamera(texte("cameraIndisponible")));
  }, [cameraActive]);

  useEffect(() => () => {
    fluxCamera.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function choisirPhoto(event: ChangeEvent<HTMLInputElement>) {
    const fichier = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!fichier) return;
    if (!fichier.type.startsWith("image/")) {
      setErreurCamera(texte("fichierImageInvalide"));
      return;
    }
    fermerCamera();
    setErreurCamera("");
    onPhotoChange(fichier);
  }

  async function ouvrirCamera(): Promise<void> {
    setErreurCamera("");
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInput.current?.click();
      return;
    }

    try {
      fluxCamera.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      setCameraActive(true);
    } catch (error: unknown) {
      const nomErreur = error instanceof DOMException ? error.name : "";
      setErreurCamera(
        nomErreur === "NotAllowedError" || nomErreur === "SecurityError"
          ? texte("cameraPermissionRefusee")
          : texte("cameraIndisponible"),
      );
    }
  }

  function fermerCamera(): void {
    fluxCamera.current?.getTracks().forEach((track) => track.stop());
    fluxCamera.current = null;
    setCameraActive(false);
  }

  function capturerPhoto(): void {
    const video = videoCamera.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setErreurCamera(texte("cameraIndisponible"));
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setErreurCamera(texte("cameraIndisponible"));
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setErreurCamera(texte("cameraIndisponible"));
        return;
      }
      onPhotoChange(new File([blob], `photo-membre-${Date.now()}.jpg`, { type: "image/jpeg" }));
      fermerCamera();
      setErreurCamera("");
    }, "image/jpeg", 0.9);
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
        <h3 id="member-photo-title">{texte("photoTitre")} <span>({texte("facultative")})</span></h3>
        <div className="member-photo-control">
          {apercuPhoto ? (
            <img className="member-avatar member-photo-preview" src={apercuPhoto} alt={texte("apercuPhoto")} />
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
              {photoFile ? texte("modifierChoixGalerie") : texte("gallery")}
            </button>
            <button
              className="member-photo-camera"
              type="button"
              onClick={() => void ouvrirCamera()}
              disabled={cameraActive}
            >
              {texte("takePhoto")}
            </button>
            <button
              className="member-photo-file-picker"
              type="button"
              onClick={() => fichiersInput.current?.click()}
            >
              {texte("parcourirFichiersPhoto")}
            </button>
            {!cameraActive && erreurCamera && (
              <button
                className="member-photo-file-picker"
                type="button"
                onClick={() => cameraInput.current?.click()}
              >
                {texte("cameraTelephone")}
              </button>
            )}
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
              ref={fichiersInput}
              className="member-photo-input"
              type="file"
              accept="*/*"
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
                {texte("cancelPhotoSelection")}
              </button>
            )}
            {!photoFile && photoPath && edition && !supprimerPhoto && (
              <button className="member-photo-clear" type="button" onClick={onSupprimerPhoto}>
                {texte("supprimerPhoto")}
              </button>
            )}
            {supprimerPhoto && (
              <button className="member-photo-clear" type="button" onClick={onSupprimerPhoto}>
                {texte("conserverPhoto")}
              </button>
            )}
          </div>
        </div>
        {cameraActive && (
          <div className="member-camera">
            <video ref={videoCamera} playsInline muted aria-label={texte("apercuCamera")} />
            <div className="member-camera-actions">
              <button className="primary-button" type="button" onClick={capturerPhoto}>{texte("takePhoto")}</button>
              <button className="secondary-button" type="button" onClick={fermerCamera}>{texte("fermerCamera")}</button>
            </div>
          </div>
        )}
        {erreurCamera && <p className="member-photo-error" role="alert">{erreurCamera}</p>}
        <p className="member-field-hint">{texte("photoTypesIndications")}</p>
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
              const section = nomActiviteAffiche(sections.find((item) => item.id === abonnement.section_id)?.name ?? "Abonnement");
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
                    {nomActiviteAffiche(section.name)}{section.is_active === false ? " · désactivée" : ""}
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
                <option key={tarif.id} value={tarif.id}>{texte(tarif.category === "etudiant_enfant" ? "enfant" : "adulte")}</option>
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
