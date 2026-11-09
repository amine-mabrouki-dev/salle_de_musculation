import { useState, type FormEvent } from "react";
import { EmptyState } from "./EmptyState";
import { Panel } from "./Panel";
import { StatusChip, type Status } from "./StatusChip";
import { Toast } from "./Toast";
import { MemberAvatar } from "./MemberAvatar";
import { nomActiviteAffiche, texte } from "../lib/textes";
import { useAuth } from "../hooks/useAuth";
import type { Abonnement, MembreComplet, ModePaiement, Paiement, SalleSection, Tarif } from "../types/members";
import { joursEntreDates, statutAbonnement } from "../lib/calculations";
import { formaterMontantDT } from "../lib/money";

function monnaie(value: number | string | null): string {
  if (value === null) return "À définir";
  return `${formaterMontantDT(value)} DT`;
}

function dateLisible(date: string): string {
  return new Intl.DateTimeFormat("fr-TN", {
    timeZone: "Africa/Tunis",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function dateHeureLisible(date: string): string {
  return new Intl.DateTimeFormat("fr-TN", {
    timeZone: "Africa/Tunis",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

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

function joursAvantEcheance(date: string): number {
  return joursEntreDates(date, dateTunis());
}

function statut(abonnement: Abonnement): Status {
  return statutAbonnement(abonnement.end_date, dateTunis());
}

function statutLibelle(value: Status): string {
  return texte(value === "actif" ? "statutValide" : value === "bientot" ? "statutBientot" : "statutTermine");
}

function echeance(date: string): string {
  const jours = joursAvantEcheance(date);
  if (jours < 0) return texte("abonnementTermineDepuis")
    .replace("{jours}", String(Math.abs(jours)));
  if (jours === 0) return "Expire aujourd’hui";
  if (jours === 1) return "Expire demain";
  return `Expire dans ${jours} jours`;
}

export interface MemberDetailProps {
  membre: MembreComplet;
  sections: SalleSection[];
  tarifs: Tarif[];
  erreur: string;
  enregistrement: boolean;
  onModifier: () => void;
  onSupprimer: () => void;
  onEnregistrerPaiement: (paiement: {
    subscription_id: string;
    amount: number;
    method: ModePaiement;
    paid_at: string;
  }) => Promise<"enregistre" | "en_attente" | false>;
  onAnnulerPaiement: (paymentId: string, reason: string) => Promise<boolean>;
  toast: string;
  onCloseToast: () => void;
}

export function MemberDetail({
  membre,
  sections,
  tarifs,
  erreur,
  enregistrement,
  onModifier,
  onSupprimer,
  onEnregistrerPaiement,
  onAnnulerPaiement,
  toast,
  onCloseToast,
}: MemberDetailProps) {
  const { session, access } = useAuth();
  const [formulairePaiement, setFormulairePaiement] = useState(false);
  const [abonnementPaiement, setAbonnementPaiement] = useState("");
  const [montantPaiement, setMontantPaiement] = useState("");
  const [modePaiement, setModePaiement] = useState<ModePaiement>("especes");
  const [datePaiement, setDatePaiement] = useState(dateTunis);
  const [erreurPaiement, setErreurPaiement] = useState("");
  const reste = membre.subscriptions.reduce((somme, abonnement) => somme + Number(abonnement.amount_due), 0);
  const telephone = membre.phone?.replace(/\D/g, "") ?? "";
  const message = `Bonjour ${membre.full_name.split(" ")[0]}, nous vous contactons au sujet de votre abonnement à la salle de Moularès.`;
  const abonnementChoisi = membre.subscriptions.find((item) => item.id === abonnementPaiement);
  const soldeDuPaiement = Number(abonnementChoisi?.amount_due ?? 0);
  const montantNumerique = Number(montantPaiement);

  function ouvrirPaiement(abonnement: Abonnement) {
    const solde = Number(abonnement.amount_due);
    setAbonnementPaiement(abonnement.id);
    setMontantPaiement(solde > 0 ? String(solde) : "");
    setModePaiement("especes");
    setDatePaiement(dateTunis());
    setErreurPaiement("");
    setFormulairePaiement(true);
  }

  function choisirAbonnement(subscriptionId: string) {
    const abonnement = membre.subscriptions.find((item) => item.id === subscriptionId);
    setAbonnementPaiement(subscriptionId);
    if (!abonnement) return;
    const solde = Number(abonnement.amount_due);
    setMontantPaiement(solde > 0 ? String(solde) : "");
    setErreurPaiement("");
  }

  async function soumettrePaiement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!abonnementChoisi) {
      setErreurPaiement("Sélectionnez un abonnement.");
      return;
    }
    if (!Number.isFinite(montantNumerique) || montantNumerique <= 0) {
      setErreurPaiement("Le montant doit être supérieur à zéro.");
      return;
    }
    if (montantNumerique > soldeDuPaiement) {
      setErreurPaiement(`Le paiement ne peut pas dépasser le solde de ${monnaie(soldeDuPaiement)}.`);
      return;
    }
    const resultat = await onEnregistrerPaiement({
      subscription_id: abonnementChoisi.id,
      amount: montantNumerique,
      method: modePaiement,
      paid_at: datePaiement,
    });
    if (resultat) {
      setFormulairePaiement(false);
      setErreurPaiement("");
    }
  }

  async function confirmerAnnulation(paiement: Paiement) {
    const confirmer = window.confirm(
      `Annuler le paiement de ${monnaie(paiement.amount)} du ${dateLisible(paiement.paid_at.slice(0, 10))} ?`,
    );
    if (!confirmer) return;
    const reason = window.prompt("Indiquez le motif de l’annulation :", "")?.trim();
    if (!reason) return;
    await onAnnulerPaiement(paiement.id, reason);
  }

  return (
    <div className="member-detail">
      <Toast message={toast} onClose={onCloseToast} />
      <div className="member-contact-line">
        <MemberAvatar nom={membre.full_name} photoPath={membre.photo_path} className="member-avatar-large" />
        <div>
          <strong>{membre.full_name}</strong>
          <span>{telephone.length === 8 ? `${telephone.slice(0, 2)} ${telephone.slice(2, 5)} ${telephone.slice(5)}` : "Téléphone invalide"}</span>
        </div>
      </div>
      {membre.updated_at && (
        <p className="member-audit-line">
          Modifié par{" "}
          {membre.updated_by === session?.user.id
            ? access?.displayName ?? "vous"
            : membre.updated_by
              ? `le compte ${membre.updated_by.slice(0, 8)}`
              : "un utilisateur"}{" "}
          le {dateHeureLisible(membre.updated_at)}
        </p>
      )}

      <div className="member-contact-actions">
        {telephone.length === 8 ? (
          <>
            <a className="primary-button" href={`tel:+216${telephone}`}>{texte("appeler")}</a>
            <a
              className="secondary-button"
              href={`https://wa.me/216${telephone}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          </>
        ) : <p className="member-no-payments">{texte("noMemberPhone")}</p>}
      </div>

      <section className="member-detail-section" aria-labelledby="abonnements-heading">
        <div className="member-detail-title-row">
          <h3 id="abonnements-heading">Abonnements</h3>
          {reste > 0 && <span className="member-due-total">{texte("resteDu")} <strong>{monnaie(reste)}</strong></span>}
        </div>
        {membre.subscriptions.length ? (
          <div className="member-subscription-list">
            {membre.subscriptions.map((abonnement) => {
              const section = nomActiviteAffiche(sections.find((item) => item.id === abonnement.section_id)?.name ?? texte("noSection"));
              const tarif = tarifs.find((item) => item.id === abonnement.tariff_id);
              const status = statut(abonnement);
              return (
                <Panel className="subscription-card" key={abonnement.id}>
                  <div className="subscription-heading">
                    <strong>{section}</strong>
                    <StatusChip status={status} label={statutLibelle(status)} />
                  </div>
                  <p>{texte(tarif?.category === "etudiant_enfant" ? "enfant" : "adulte")} · {abonnement.duration === "annual" ? "Annuel" : "Mensuel"}</p>
                  <p>{echeance(abonnement.end_date)} · {dateLisible(abonnement.end_date)}</p>
                  <div className="subscription-amounts">
                    <span>Tarif : {monnaie(abonnement.price)}</span>
                    <span>{texte("resteDu")} : {monnaie(abonnement.amount_due)}</span>
                  </div>
                  <button
                    className="secondary-button payment-open-button"
                    type="button"
                    onClick={() => ouvrirPaiement(abonnement)}
                    disabled={enregistrement || Number(abonnement.amount_due) <= 0}
                  >
                    {Number(abonnement.amount_due) > 0 ? texte("payer") : texte("soldeRegle")}
                  </button>
                </Panel>
              );
            })}
          </div>
        ) : (
          <EmptyState title={texte("aucunAbonnementDisponible")} description={texte("aucunAbonnementMembre")} />
        )}
      </section>

      {formulairePaiement && (
        <section className="member-detail-section" aria-labelledby="nouveau-paiement-heading">
          <div className="member-detail-title-row">
            <h3 id="nouveau-paiement-heading">Enregistrer un paiement</h3>
          </div>
          <form className="member-form payment-form" onSubmit={(event) => void soumettrePaiement(event)}>
            <label className="member-field">
              Abonnement
              <select value={abonnementPaiement} onChange={(event) => choisirAbonnement(event.target.value)} required>
                {membre.subscriptions.map((abonnement) => {
                  const section = nomActiviteAffiche(sections.find((item) => item.id === abonnement.section_id)?.name ?? "Section");
                  return (
                    <option key={abonnement.id} value={abonnement.id}>
                      {section} · {abonnement.duration === "annual" ? "Annuel" : "Mensuel"}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="member-form-grid">
              <label className="member-field">
                Montant (DT)
                <input
                  type="number"
                  min="0.001"
                  max={soldeDuPaiement || undefined}
                  step="0.001"
                  inputMode="decimal"
                  value={montantPaiement}
                  onChange={(event) => setMontantPaiement(event.target.value)}
                  required
                />
              </label>
              <label className="member-field">
                Date
                <input
                  type="date"
                  value={datePaiement}
                  onChange={(event) => setDatePaiement(event.target.value)}
                  required
                />
              </label>
            </div>
            <label className="member-field">
              Mode de paiement
              <select value={modePaiement} onChange={(event) => setModePaiement(event.target.value as ModePaiement)}>
                <option value="especes">Espèces</option>
                <option value="virement">Virement</option>
                <option value="autre">Autre</option>
              </select>
            </label>
            <p className="member-field-hint">
              Solde calculé à partir des paiements : {monnaie(soldeDuPaiement)}.
              {" "}Pour renouveler, créez un nouvel abonnement dans Abonnements.
            </p>
            {erreurPaiement && <div className="members-error" role="alert">{erreurPaiement}</div>}
            <div className="member-form-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => { setFormulairePaiement(false); setErreurPaiement(""); }}
                disabled={enregistrement}
              >
                Annuler
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={
                  enregistrement
                  || !abonnementChoisi
                  || soldeDuPaiement <= 0
                  || !Number.isFinite(montantNumerique)
                  || montantNumerique <= 0
                  || montantNumerique > soldeDuPaiement
                }
              >
                {enregistrement ? "Enregistrement…" : "Enregistrer le paiement"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="member-detail-section" aria-labelledby="paiements-heading">
        <div className="member-detail-title-row">
          <h3 id="paiements-heading">Historique des paiements</h3>
          <span className="member-payment-count">{membre.payments.length}</span>
        </div>
        {membre.payments.length ? (
          <ul className="payment-history">
            {membre.payments.map((paiement) => {
              const abonnement = membre.subscriptions.find((item) => item.id === paiement.subscription_id);
              const section = abonnement
                ? nomActiviteAffiche(sections.find((item) => item.id === abonnement.section_id)?.name ?? "Abonnement")
                : "Abonnement";
              return (
                <li key={paiement.id}>
                  <span>
                    <strong>{monnaie(paiement.amount)}</strong>
                    <small>{section} · {dateLisible(paiement.paid_at.slice(0, 10))}</small>
                    {paiement.cancelled_at && (
                      <small className="payment-cancel-hint">
                        Annulé le {dateHeureLisible(paiement.cancelled_at)} · Motif : {paiement.cancellation_reason}
                      </small>
                    )}
                  </span>
                  <span className="payment-history-actions">
                    <span className="payment-method">
                      {paiement.method === "especes" ? "Espèces" : paiement.method === "virement" ? "Virement" : "Autre"}
                    </span>
                    {!paiement.cancelled_at && (
                      <button
                        className="payment-cancel-button"
                        type="button"
                        onClick={() => void confirmerAnnulation(paiement)}
                        disabled={enregistrement}
                        aria-label="Annuler ce paiement"
                      >
                        Annuler
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="member-no-payments">Aucun paiement enregistré.</p>
        )}
      </section>

      {erreur && <div className="members-error" role="alert">{erreur}</div>}
      <div className="member-detail-actions">
        <button className="primary-button" type="button" onClick={onModifier}>Modifier</button>
        <button className="delete-member-button" type="button" onClick={onSupprimer} disabled={enregistrement}>
          {enregistrement ? "Suppression…" : "Supprimer le membre"}
        </button>
      </div>
    </div>
  );
}
