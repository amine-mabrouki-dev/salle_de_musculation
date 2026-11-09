import { utilisateurConnecteId } from "./offlineStore";
import { lireDonneesLocales, nouvelleLigne, enregistrerLocalement } from "./localRepository";
import type { Abonnement, DureeAbonnement, Membre, SalleSection, Tarif } from "../types/members";
import { statutAbonnement } from "./calculations";
import { verifierIdentifiantsLigne } from "./uuid";

export interface MembreAbonnements extends Membre {
  subscriptions: Abonnement[];
}

export interface DonneesAbonnements {
  membres: MembreAbonnements[];
  abonnements: Abonnement[];
  sections: SalleSection[];
  tarifs: Tarif[];
}

interface ParametresAbonnement {
  member_id: string;
  section_id: string;
  tariff_id: string;
  duration: DureeAbonnement;
  subscription_id: string | null;
  confirm_annual_estimate: boolean;
  manual_price: number | null;
  client_request_id: string;
}

const demandesEnCours = new Map<string, Promise<void>>();
const verrousParActivite = new Map<string, Promise<void>>();

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

export function ajouterJours(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function calculerDebutRenouvellement(dateReference: string, abonnementSource: { end_date: string } | null | undefined): string {
  if (!abonnementSource) return dateReference;
  const dateDebut = ajouterJours(abonnementSource.end_date, 1);
  return new Date(`${dateReference}T00:00:00Z`) >= new Date(`${dateDebut}T00:00:00Z`)
    ? dateReference
    : dateDebut;
}

export function chevauchementAbonnements(
  debutA: string,
  finA: string,
  debutB: string,
  finB: string,
): boolean {
  return debutA <= finB && debutB <= finA;
}

export async function chargerDonneesAbonnements(): Promise<DonneesAbonnements> {
  const userId = await utilisateurConnecteId();
  const { membres, abonnements, sections, tarifs } = await lireDonneesLocales(userId);
  const aujourdhui = dateTunis();
  const abonnementsAvecStatut = abonnements.map((item) => ({
    ...item,
    status: statutAbonnement(item.end_date, aujourdhui),
  }));
  return {
    membres: membres
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "fr"))
      .map((member) => ({
        ...member,
        subscriptions: abonnementsAvecStatut.filter((sub) => sub.member_id === member.id),
      })),
    abonnements: abonnementsAvecStatut,
    sections: sections.sort((a, b) => a.name.localeCompare(b.name, "fr")),
    tarifs,
  };
}

export function creerOuRenouvelerAbonnement(parametres: ParametresAbonnement): Promise<void> {
  verifierIdentifiantsLigne({ id: parametres.client_request_id });
  const demandeExistante = demandesEnCours.get(parametres.client_request_id);
  if (demandeExistante) return demandeExistante;

  const lockKey = `${parametres.member_id}:${parametres.section_id}`;
  const precedente = verrousParActivite.get(lockKey) ?? Promise.resolve();
  let liberer!: () => void;
  const verrou = new Promise<void>((resolve) => { liberer = resolve; });
  const queue = precedente.then(() => verrou);
  verrousParActivite.set(lockKey, queue);

  const operation = precedente.then(() => creerSousVerrou(parametres)).finally(() => {
    liberer();
    if (verrousParActivite.get(lockKey) === queue) verrousParActivite.delete(lockKey);
  });
  const suivie = operation.finally(() => {
    if (demandesEnCours.get(parametres.client_request_id) === suivie) {
      demandesEnCours.delete(parametres.client_request_id);
    }
  });
  demandesEnCours.set(parametres.client_request_id, suivie);
  return suivie;
}

async function creerSousVerrou(parametres: ParametresAbonnement): Promise<void> {
  const userId = await utilisateurConnecteId();
  const donnees = await lireDonneesLocales(userId);
  const dejaEnregistre = donnees.abonnements.find((item) => item.id === parametres.client_request_id);
  if (dejaEnregistre) {
    if (
      dejaEnregistre.member_id === parametres.member_id
      && dejaEnregistre.section_id === parametres.section_id
      && dejaEnregistre.tariff_id === parametres.tariff_id
      && dejaEnregistre.duration === parametres.duration
    ) return;
    throw new Error("Cet identifiant de demande est déjà utilisé.");
  }
  if (!donnees.membres.some((member) => member.id === parametres.member_id)) {
    throw new Error("Ce membre n’existe pas dans les données locales.");
  }
  const section = donnees.sections.find((item) => item.id === parametres.section_id);
  const tarif = donnees.tarifs.find((item) => item.id === parametres.tariff_id && item.section_id === parametres.section_id);
  if (!section || !tarif) throw new Error("La section ou le tarif choisi est introuvable localement.");
  if (!parametres.subscription_id && !section.is_active) {
    throw new Error("Cette activité est désactivée et ne peut pas recevoir de nouvel abonnement.");
  }

  const tarifCatalogue = parametres.duration === "monthly" ? tarif.monthly_price : tarif.annual_price;
  let price: number;
  if (parametres.duration === "monthly") {
    if (tarifCatalogue == null) {
      if (parametres.manual_price == null || parametres.manual_price < 0) {
        throw new Error("Aucun tarif mensuel n’est défini. Saisissez un prix valide.");
      }
      price = parametres.manual_price;
    } else {
      price = Number(tarifCatalogue);
    }
  } else if (tarif.annual_price != null) {
    price = Number(tarif.annual_price);
  } else if (tarif.monthly_price != null) {
    if (!parametres.confirm_annual_estimate) throw new Error("Le tarif annuel proposé doit être confirmé.");
    price = Number(tarif.monthly_price) * 10;
  } else {
    if (parametres.manual_price == null || parametres.manual_price < 0) {
      throw new Error("Aucun tarif annuel n’est défini. Saisissez un prix valide.");
    }
    price = parametres.manual_price;
  }

  const source = parametres.subscription_id
    ? donnees.abonnements.find((item) => item.id === parametres.subscription_id && item.member_id === parametres.member_id)
    : null;
  if (parametres.subscription_id && !source) throw new Error("L’abonnement à renouveler est introuvable localement.");

  const dateReference = dateTunis();
  const startDate = calculerDebutRenouvellement(dateReference, source);
  const endDate = ajouterJours(startDate, parametres.duration === "annual" ? 365 : 30);
  const creeLe = new Date().toISOString();
  const abonnementsMemeActivite = donnees.abonnements.filter((item) =>
    item.member_id === parametres.member_id
    && item.section_id === parametres.section_id
    && item.id !== parametres.subscription_id
    && item.deleted_at == null,
  );

  const chevauchement = abonnementsMemeActivite.some((item) => chevauchementAbonnements(startDate, endDate, item.start_date, item.end_date));
  if (chevauchement) {
    throw new Error("Cet abonnement existe déjà pour cette activité.");
  }

  await enregistrerLocalement(userId, "subscriptions", nouvelleLigne({
    id: parametres.client_request_id,
    user_id: userId,
    member_id: parametres.member_id,
    section_id: section.id,
    tariff_id: tarif.id,
    duration: parametres.duration,
    start_date: startDate,
    end_date: endDate,
    price,
    local_created_at: creeLe,
    updated_at: creeLe,
  }));
}
