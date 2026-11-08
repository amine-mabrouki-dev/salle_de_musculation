import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BottomSheet } from "./BottomSheet";
import { lireDonneesLocales } from "../lib/localRepository";
import { utilisateurConnecteId } from "../lib/offlineStore";
import { enregistrerPaiement } from "../lib/members";
import { texte } from "../lib/textes";
import type { Abonnement, Membre, ModePaiement } from "../types/members";

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

function monnaie(value: number): string {
  return `${new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 3 }).format(value)} DT`;
}

export function ActionsRapides() {
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [abonnements, setAbonnements] = useState<Abonnement[]>([]);
  const [membreId, setMembreId] = useState("");
  const [abonnementId, setAbonnementId] = useState("");
  const [montant, setMontant] = useState("");
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);

  useEffect(() => {
    if (!ouvert) return;
    let active = true;
    void utilisateurConnecteId()
      .then(lireDonneesLocales)
      .then((data) => {
        if (active) {
          setMembres(data.membres);
          setAbonnements(data.abonnements);
        }
      })
      .catch(() => {
        if (active) setErreur(texte("erreurGenerique"));
      });
    return () => { active = false; };
  }, [ouvert]);

  const membre = membres.find((item) => item.id === membreId);
  const abonnementsPayables = abonnements
    .filter((item) => item.member_id === membreId && Number(item.amount_due) > 0);
  const abonnement = abonnementsPayables.find((item) => item.id === abonnementId)
    ?? abonnementsPayables[0];

  function ouvrirPaiement() {
    setErreur("");
    setMessage("");
    setMembreId("");
    setAbonnementId("");
    setMontant("");
    setOuvert(true);
  }

  function choisirMembre(id: string) {
    setMembreId(id);
    setAbonnementId("");
    const payable = abonnements.find((item) => item.member_id === id && Number(item.amount_due) > 0);
    setMontant(payable ? String(payable.amount_due) : "");
  }

  function choisirAbonnement(id: string) {
    setAbonnementId(id);
    const choisi = abonnementsPayables.find((item) => item.id === id);
    setMontant(choisi ? String(choisi.amount_due) : "");
  }

  async function soumettre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!membre || !abonnement) {
      setErreur(texte("aucunPaiementPossible"));
      return;
    }
    const somme = Number(montant);
    if (!Number.isFinite(somme) || somme <= 0 || somme > Number(abonnement.amount_due)) {
      setErreur("Saisissez un montant valide, inférieur ou égal au montant restant.");
      return;
    }
    setErreur("");
    setEnregistrement(true);
    try {
      const resultat = await enregistrerPaiement({
        member_id: membre.id,
        subscription_id: abonnement.id,
        amount: somme,
        method: "especes" satisfies ModePaiement,
        paid_at: dateTunis(),
      });
      setMessage(resultat === "en_attente" ? texte("paiementHorsLigne") : texte("paiementAjoute"));
      setOuvert(false);
    } catch {
      setErreur(texte("erreurGenerique"));
    } finally {
      setEnregistrement(false);
    }
  }

  return (
    <>
      <div className="quick-actions" aria-label="Actions rapides">
        <button className="quick-payment-button" type="button" onClick={ouvrirPaiement}>
          {texte("nouveauPaiement")}
        </button>
        <button
          className="quick-member-button"
          type="button"
          onClick={() => navigate("/membres", { state: { nouveauMembre: true } })}
        >
          {texte("nouveauMembre")}
        </button>
      </div>
      {message && <div className="quick-action-toast" role="status">{message}</div>}
      <BottomSheet open={ouvert} title={texte("nouveauPaiement")} onClose={() => setOuvert(false)}>
        <form className="quick-payment-form" onSubmit={(event) => void soumettre(event)}>
          <label className="member-field">
            {texte("choisirMembre")}
            <select value={membreId} onChange={(event) => choisirMembre(event.target.value)} required>
              <option value="">{texte("choisirMembre")}</option>
              {membres.map((item) => (
                <option key={item.id} value={item.id}>{item.full_name} · {item.phone ?? "Sans téléphone"}</option>
              ))}
            </select>
          </label>
          {membre && abonnementsPayables.length > 1 && (
            <label className="member-field">
              {texte("abonnement")}
              <select value={abonnement?.id ?? ""} onChange={(event) => choisirAbonnement(event.target.value)}>
                {abonnementsPayables.map((item) => (
                  <option key={item.id} value={item.id}>{monnaie(Number(item.amount_due))} restant</option>
                ))}
              </select>
            </label>
          )}
          {membre && !abonnementsPayables.length && (
            <p className="quick-payment-note">{texte("aucunPaiementPossible")}</p>
          )}
          {abonnement && (
            <>
              <label className="member-field">
                {texte("montant")} (DT)
                <input
                  type="number"
                  min="0.001"
                  max={Number(abonnement.amount_due)}
                  step="0.001"
                  inputMode="decimal"
                  value={montant}
                  onChange={(event) => setMontant(event.target.value)}
                  required
                />
              </label>
              <p className="quick-payment-note">
                {texte("labelDate")} : {new Intl.DateTimeFormat("fr-TN", { dateStyle: "long", timeZone: "Africa/Tunis" }).format(new Date())}
                {" · "}{texte("labelModePaiement")} : {texte("especes")}
              </p>
            </>
          )}
          {erreur && <p className="members-error" role="alert">{erreur}</p>}
          <button className="primary-button" type="submit" disabled={!abonnement || enregistrement}>
            {enregistrement ? "Enregistrement…" : texte("enregistrerPaiement")}
          </button>
        </form>
      </BottomSheet>
    </>
  );
}
