import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { FilterChips, type SectionFilter } from "../components/FilterChips";
import { Panel } from "../components/Panel";
import { StatusChip, type Status } from "../components/StatusChip";
import { messageErreur, useAuth } from "../hooks/useAuth";
import { composerMessageRelance, MESSAGE_RELANCE_PAR_DEFAUT } from "../lib/reminderMessage";
import { supabase } from "../lib/supabase";
import {
  utilisateurConnecteId,
} from "../lib/offlineStore";
import { joursEntreDates, statutAbonnement } from "../lib/calculations";
import { EVENEMENT_DONNEES_LOCALES_MAJ, lireMetaLocale } from "../lib/localDatabase";
import { lireDonneesLocales } from "../lib/localRepository";
import { CLE_DATE_DERNIERE_SAUVEGARDE, dateFichierTunis } from "../lib/backups";
import { guidePremiereUtilisation, texte } from "../lib/textes";
import type { Abonnement, Membre, Paiement, SalleSection } from "../types/members";

interface AbonnementAccueil extends Abonnement {
  members: Pick<Membre, "full_name" | "phone">;
}

interface DonneesAccueil {
  abonnements: AbonnementAccueil[];
  sections: SalleSection[];
  paiements: Paiement[];
  depenses: { amount: number | string; spent_at: string }[];
}

interface Relance {
  membre: Membre;
  abonnements: AbonnementAccueil[];
  echeanceLaPlusProche: string;
  urgence: number;
}

const donneesInitiales: DonneesAccueil = { abonnements: [], sections: [], paiements: [], depenses: [] };

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

function dateLisible(date: string): string {
  return new Intl.DateTimeFormat("fr-TN", {
    timeZone: "Africa/Tunis",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

function monnaie(value: number): string {
  return new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 3 }).format(value);
}

function joursAvant(date: string): number {
  return joursEntreDates(date, dateTunis());
}

function statutPour(abonnement: Abonnement): Status {
  return statutAbonnement(abonnement.end_date, dateTunis());
}

function libelleEcheance(date: string): string {
  const jours = joursAvant(date);
  if (jours < 0) return texte("abonnementTermineLe").replace("{date}", dateLisible(date));
  if (jours === 0) return "Expire aujourd’hui";
  if (jours === 1) return "Expire demain";
  return `Expire dans ${jours} jours`;
}

export function AccueilPage() {
  const { access } = useAuth();
  const [donnees, setDonnees] = useState<DonneesAccueil>(donneesInitiales);
  const [filtre, setFiltre] = useState<SectionFilter>("Tous");
  const [modeleRelance, setModeleRelance] = useState(MESSAGE_RELANCE_PAR_DEFAUT);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [rappelSauvegarde, setRappelSauvegarde] = useState(false);
  const [guideVisible, setGuideVisible] = useState(() => localStorage.getItem("gym4you-guide-termine") !== "oui");
  const dejaCharge = useRef(false);

  const charger = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setErreur(texte("erreurGenerique"));
      setChargement(false);
      return;
    }
    if (!dejaCharge.current) setChargement(true);
    setErreur("");
    try {
      const userId = await utilisateurConnecteId();
      const [local, derniereSauvegarde] = await Promise.all([
        lireDonneesLocales(userId),
        lireMetaLocale(userId, CLE_DATE_DERNIERE_SAUVEGARDE),
      ]);
      const ageSauvegarde = derniereSauvegarde
        ? (Date.parse(`${dateFichierTunis()}T00:00:00Z`) - Date.parse(`${derniereSauvegarde.slice(0, 10)}T00:00:00Z`)) / 86_400_000
        : Number.POSITIVE_INFINITY;
      setRappelSauvegarde(!Number.isFinite(ageSauvegarde) || ageSauvegarde > 30);
      const membres = new Map(local.membres.map((member) => [member.id, member]));
      const abonnements: AbonnementAccueil[] = local.abonnements.flatMap((abonnement) => {
        const member = membres.get(abonnement.member_id);
        if (!member) return [];
        return [{
          ...abonnement,
          status: statutAbonnement(abonnement.end_date, dateTunis()),
          members: { full_name: member.full_name, phone: member.phone },
        }];
      });
      setDonnees({
        abonnements,
        sections: local.sections,
        paiements: local.paiements.filter((payment) => payment.paid_at.slice(0, 7) === dateTunis().slice(0, 7)),
        depenses: local.depenses.filter((expense) => expense.spent_at.slice(0, 7) === dateTunis().slice(0, 7)),
      });
      dejaCharge.current = true;
      setChargement(false);
      if (navigator.onLine && client) {
        void client.from("gym_settings").select("reminder_message").maybeSingle().then(({ data, error: settingsError }) => {
          if (settingsError) {
            console.error("Chargement du message de relance impossible.", settingsError);
            return;
          }
          setModeleRelance(data?.reminder_message ?? MESSAGE_RELANCE_PAR_DEFAUT);
        });
      }
    } catch (cause: unknown) {
      setErreur(`Chargement de l’accueil impossible : ${messageErreur(cause)}`);
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

  const relances = useMemo(() => {
    const parMembre = new Map<string, Relance>();
    for (const abonnement of donnees.abonnements) {
      const jours = joursAvant(abonnement.end_date);
      if (jours > 7) continue;
      if (filtre !== "Tous" && donnees.sections.find((section) => section.id === abonnement.section_id)?.name !== filtre) continue;

      const existante = parMembre.get(abonnement.member_id);
      if (existante) {
        existante.abonnements.push(abonnement);
        existante.urgence = Math.min(existante.urgence, jours);
        if (abonnement.end_date < existante.echeanceLaPlusProche) {
          existante.echeanceLaPlusProche = abonnement.end_date;
        }
      } else {
        parMembre.set(abonnement.member_id, {
          membre: {
            id: abonnement.member_id,
            full_name: abonnement.members.full_name,
            phone: abonnement.members.phone,
            notes: null,
            created_at: "",
          },
          abonnements: [abonnement],
          echeanceLaPlusProche: abonnement.end_date,
          urgence: jours,
        });
      }
    }
    return [...parMembre.values()].sort(
      (a, b) => a.urgence - b.urgence || a.echeanceLaPlusProche.localeCompare(b.echeanceLaPlusProche) || a.membre.full_name.localeCompare(b.membre.full_name, "fr"),
    );
  }, [donnees.abonnements, donnees.sections, filtre]);

  const encaissementsDuMois = donnees.paiements
    .filter((paiement) => !paiement.cancelled_at)
    .reduce((somme, paiement) => somme + Number(paiement.amount), 0);

  function messageWhatsApp(relance: Relance, abonnement: AbonnementAccueil): string {
    return composerMessageRelance(modeleRelance, {
      nom: relance.membre.full_name,
      expiration: dateLisible(abonnement.end_date),
      reste_a_payer: monnaie(Number(abonnement.amount_due)),
    });
  }

  return (
    <main className="page-content home-page" aria-label="Accueil">
      <header className="home-heading">
        <p className="members-eyebrow">Moularès · Gafsa</p>
        <h1>{texte("accueilQuestion")} <span className="home-heading-count">{relances.length}</span></h1>
      </header>

      {rappelSauvegarde && access?.role === "gerant" && (
        <div className="backup-reminder" role="status">
          <span>{texte("sauvegarde")}</span>
          {access?.role === "gerant" && <Link to="/reglages" className="backup-reminder-link">Ouvrir les réglages</Link>}
        </div>
      )}
      {erreur && <div className="members-error" role="alert">{erreur}</div>}
      {chargement ? (
        <Panel aria-label="Chargement de l’accueil" aria-busy="true">
          <div className="members-loading" role="status"><span className="loading-spinner" aria-hidden="true" />Chargement du tableau de bord…</div>
        </Panel>
      ) : erreur && !dejaCharge.current ? (
        <Panel>
          <EmptyState
            title="Le tableau de bord est indisponible"
            description={navigator.onLine ? erreur : texte("aucunReseau")}
            action={<button className="secondary-button" type="button" onClick={() => void charger()}>Réessayer</button>}
          />
        </Panel>
      ) : (
        <>
          {guideVisible && access?.role === "gerant" && (
            <Panel className="first-use-guide">
              <div className="first-use-guide-heading">
                <h2>{texte("guideTitre")}</h2>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    localStorage.setItem("gym4you-guide-termine", "oui");
                    setGuideVisible(false);
                  }}
                >
                  {texte("guidePasser")}
                </button>
              </div>
              <ol>
                {guidePremiereUtilisation.map((key, index) => {
                  const destinations = ["/reglages", "/membres", "/membres", "/reglages"];
                  return (
                    <li key={key}>
                      <span>{index + 1}.</span>{" "}
                      <Link to={destinations[index] ?? "/"}>{texte(key)}</Link>
                    </li>
                  );
                })}
              </ol>
            </Panel>
          )}

          <div className="home-reminders-heading">
            <h2>{texte("rappelAEnvoyer")}</h2>
          </div>
          <FilterChips
            sections={donnees.sections.filter((section) => section.is_active !== false).map((section) => section.name)}
            value={filtre}
            onChange={setFiltre}
          />

          {relances.length ? (
            <Panel className="home-reminder-list">
              {relances.map((relance) => (
                <article className="home-reminder-item" key={relance.membre.id}>
                  <div className="home-reminder-member">
                    <strong>{relance.membre.full_name}</strong>
                    <span>{libelleEcheance(relance.echeanceLaPlusProche)}</span>
                    <span>{relance.abonnements.map((abonnement) => {
                      const section = donnees.sections.find((item) => item.id === abonnement.section_id)?.name ?? "Activité";
                      return `${section} · ${texte("resteDu")} ${monnaie(Number(abonnement.amount_due))} DT`;
                    }).join(" / ")}</span>
                    <div className="home-reminder-statuses">
                      {relance.abonnements.map((abonnement) => (
                        <StatusChip
                          key={abonnement.id}
                          status={statutPour(abonnement)}
                          label={`${donnees.sections.find((section) => section.id === abonnement.section_id)?.name ?? "Activité"} · ${texte(statutPour(abonnement) === "expire" ? "statutTermine" : "statutBientot")}`}
                        />
                      ))}
                    </div>
                  </div>
                  {relance.membre.phone && /^\d{8}$/.test(relance.membre.phone.replace(/\D/g, "")) ? (
                    <a
                      className="primary-button home-reminder-button"
                      href={`https://wa.me/216${relance.membre.phone.replace(/\D/g, "")}?text=${encodeURIComponent(messageWhatsApp(relance, relance.abonnements.reduce((urgence, abonnement) => abonnement.end_date < urgence.end_date ? abonnement : urgence)))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {texte("envoyerRappel")}
                    </a>
                  ) : <span className="home-no-phone">{texte("telephoneHuitChiffres")}</span>}
                </article>
              ))}
            </Panel>
          ) : (
            <Panel>
              <EmptyState
                title={texte("rappelEnvoye")}
                description={filtre === "Tous" ? "Tous les abonnements sont en cours." : `Aucun membre à rappeler pour ${filtre}.`}
              />
            </Panel>
          )}

          {access?.role === "gerant" && <section className="home-month-summary" aria-labelledby="home-month-heading">
            <h2 id="home-month-heading">{texte("ceMoisCi")}</h2>
            <div className="home-metrics">
              <Panel className="home-metric-card">
                <span>{texte("argentRecu")}</span>
                <strong>{monnaie(encaissementsDuMois)} <small>DT</small></strong>
              </Panel>
              <Panel className="home-metric-card">
                <span>{texte("depenses")}</span>
                <strong>{monnaie(donnees.depenses.reduce((total, item) => total + Number(item.amount), 0))} <small>DT</small></strong>
              </Panel>
              <Panel className="home-metric-card">
                <span>{texte("benefice")}</span>
                <strong>{monnaie(encaissementsDuMois - donnees.depenses.reduce((total, item) => total + Number(item.amount), 0))} <small>DT</small></strong>
              </Panel>
            </div>
          </section>}
        </>
      )}
    </main>
  );
}
