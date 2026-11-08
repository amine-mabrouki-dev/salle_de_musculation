import { supabase } from "./supabase";
import { MESSAGE_RELANCE_PAR_DEFAUT } from "./reminderMessage";
import type { SalleSection, Tarif } from "../types/members";
import { utilisateurConnecteId } from "./offlineStore";
import { enregistrerLocalement, enregistrerMutationsLocalement, lireDonneesLocales, nouvelleLigne } from "./localRepository";
import { verifierIdentifiantsLigne } from "./uuid";

export const BUCKET_FOND_SALLE = "gym-backgrounds";
export const EVENEMENT_FOND_SALLE_MAJ = "gym-background-updated";

export function notifierFondSalleMisAJour(): void {
  window.dispatchEvent(new Event(EVENEMENT_FOND_SALLE_MAJ));
}

export interface CatalogueReglages {
  sections: SalleSection[];
  tarifs: Tarif[];
  messageRelance: string;
  userId: string;
}

export async function chargerCatalogueReglages(): Promise<CatalogueReglages> {
  const userId = await utilisateurConnecteId();
  const { sections, tarifs } = await lireDonneesLocales(userId);
  let messageRelance = MESSAGE_RELANCE_PAR_DEFAUT;
  if (navigator.onLine && supabase) {
    const { data, error } = await supabase.from("gym_settings").select("reminder_message").maybeSingle();
    if (error) throw error;
    messageRelance = data?.reminder_message ?? messageRelance;
  }
  return {
    sections: sections.sort((a, b) => a.name.localeCompare(b.name, "fr")),
    tarifs,
    messageRelance,
    userId,
  };
}

export interface DonneesActivite {
  sectionId: string | null;
  name: string;
  coachName: string;
  coachPhone: string;
  adulteMonthly: number | null;
  adulteAnnual: number | null;
  etudiantMonthly: number | null;
  etudiantAnnual: number | null;
}

export async function enregistrerActivite(activite: DonneesActivite): Promise<void> {
  const userId = await utilisateurConnecteId();
  const current = await lireDonneesLocales(userId);
  const timestamp = new Date().toISOString();
  const existing = activite.sectionId
    ? current.sections.find((section) => section.id === activite.sectionId)
    : undefined;
  if (activite.sectionId && !existing) throw new Error("Cette activité n’existe pas dans la copie locale.");
  const section = nouvelleLigne({
    id: activite.sectionId ?? crypto.randomUUID(),
    name: activite.name.trim(),
    coach_name: activite.coachName.trim() || null,
    coach_phone: activite.coachPhone.trim() || null,
    is_active: existing?.is_active ?? true,
    updated_at: timestamp,
    deleted_at: null,
  });
  const tarifByCategory = (category: Tarif["category"], monthly: number | null, annual: number | null) => {
    const currentTariff = current.tarifs.find((item) => item.section_id === section.id && item.category === category);
    return nouvelleLigne({
      id: currentTariff?.id ?? crypto.randomUUID(),
      section_id: section.id,
      category,
      monthly_price: monthly,
      annual_price: annual,
      updated_at: timestamp,
      deleted_at: null,
    });
  };
  await enregistrerMutationsLocalement(userId, [
    { table: "sections", row: section },
    { table: "tariffs", row: tarifByCategory("adulte", activite.adulteMonthly, activite.adulteAnnual) },
    { table: "tariffs", row: tarifByCategory("etudiant_enfant", activite.etudiantMonthly, activite.etudiantAnnual) },
  ]);
}

export async function changerEtatActivite(sectionId: string, active: boolean): Promise<void> {
  const userId = await utilisateurConnecteId();
  const current = await lireDonneesLocales(userId);
  const section = current.sections.find((item) => item.id === sectionId);
  if (!section) throw new Error("Cette activité est introuvable localement.");
  await enregistrerLocalement(userId, "sections", nouvelleLigne({
    ...section,
    is_active: active,
    updated_at: new Date().toISOString(),
  }));
}

export async function enregistrerMessageRelanceCloud(message: string): Promise<void> {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Votre session a expiré. Reconnectez-vous.");
  verifierIdentifiantsLigne({ id: userId });
  const { error } = await supabase.from("gym_settings").upsert({
    user_id: userId,
    reminder_message: message,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function televerserFondSalle(image: Blob, userId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  verifierIdentifiantsLigne({ id: userId });
  const { error } = await supabase.storage.from(BUCKET_FOND_SALLE).upload(
    `${userId}/fond-salle.jpg`,
    image,
    { contentType: "image/jpeg", upsert: true, cacheControl: "3600" },
  );
  if (error) throw error;
}

export async function chargerFondSalleCloud(userId: string): Promise<Blob | null> {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const { data, error } = await supabase.storage
    .from(BUCKET_FOND_SALLE)
    .download(`${userId}/fond-salle.jpg`);
  if (error?.name === "NotFound" || error?.message.toLowerCase().includes("not found")) return null;
  if (error) throw error;
  return data;
}

export async function supprimerFondSalleCloud(userId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  verifierIdentifiantsLigne({ id: userId });
  const { error } = await supabase.storage.from(BUCKET_FOND_SALLE).remove([`${userId}/fond-salle.jpg`]);
  if (error && !error.message.toLowerCase().includes("not found")) throw error;
}

export async function changerMotDePasse(nouveauMotDePasse: string): Promise<void> {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const { error } = await supabase.auth.updateUser({ password: nouveauMotDePasse });
  if (error) throw error;
}
