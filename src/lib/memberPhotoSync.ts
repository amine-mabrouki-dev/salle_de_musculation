import {
  enregistrerLigneLocale,
  lireTableLocale,
  type LigneLocale,
} from "./localDatabase";
import { supabase } from "./supabase";

const bucket = "member-photos";

interface MembreAvecPhotoLocale extends LigneLocale {
  photo_path?: string | null;
  photo_pending_data?: string | null;
  photo_pending_delete_path?: string | null;
}

export async function synchroniserPhotosMembres(ownerId: string): Promise<boolean> {
  if (!supabase || !navigator.onLine) return false;
  const membres = await lireTableLocale<MembreAvecPhotoLocale>(ownerId, "members");
  let modifie = false;

  for (const membre of membres) {
    if (!membre.photo_pending_data) continue;
    if (!membre.photo_pending_data.startsWith("data:image/jpeg;base64,")) {
      throw new Error("Une photo en attente est invalide. Réessayez de la choisir depuis l’appareil.");
    }

    const reponse = await fetch(membre.photo_pending_data);
    if (!reponse.ok) throw new Error("Impossible de lire la photo enregistrée sur cet appareil.");
    const image = await reponse.blob();
    if (image.size > 5 * 1024 * 1024) {
      throw new Error("Une photo en attente dépasse la limite de stockage de 5 Mo.");
    }

    const chemin = `${ownerId}/${membre.id}/${crypto.randomUUID()}.jpg`;
    const { error: erreurEnvoi } = await supabase.storage.from(bucket).upload(chemin, image, {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "3600",
    });
    if (erreurEnvoi) throw erreurEnvoi;

    try {
      const ligneMiseAJour: MembreAvecPhotoLocale = {
        ...membre,
        photo_path: chemin,
        photo_pending_data: null,
        photo_pending_delete_path: membre.photo_pending_delete_path ?? membre.photo_path ?? null,
        updated_at: new Date().toISOString(),
      };
      await enregistrerLigneLocale(ownerId, "members", ligneMiseAJour);
    } catch (error: unknown) {
      const { error: erreurNettoyage } = await supabase.storage.from(bucket).remove([chemin]);
      if (erreurNettoyage) {
        throw new Error(`La photo a été envoyée, mais son enregistrement local a échoué et le fichier envoyé n’a pas pu être nettoyé : ${erreurNettoyage.message}`, { cause: error });
      }
      throw error;
    }
    modifie = true;
  }
  return modifie;
}

export async function nettoyerAnciennesPhotosMembres(ownerId: string): Promise<boolean> {
  if (!supabase || !navigator.onLine) return false;
  const membres = await lireTableLocale<MembreAvecPhotoLocale>(ownerId, "members");
  let modifie = false;

  for (const membre of membres) {
    const ancienChemin = membre.photo_pending_delete_path;
    if (!ancienChemin) continue;

    const { data: distante, error: erreurLecture } = await supabase
      .from("members")
      .select("photo_path")
      .eq("id", membre.id)
      .maybeSingle();
    if (erreurLecture) throw erreurLecture;
    if (!distante || distante.photo_path !== (membre.photo_path ?? null)) continue;

    const { error: erreurSuppression } = await supabase.storage.from(bucket).remove([ancienChemin]);
    if (erreurSuppression) throw erreurSuppression;
    const ligneMiseAJour: MembreAvecPhotoLocale = {
      ...membre,
      photo_pending_delete_path: null,
      updated_at: new Date().toISOString(),
    };
    await enregistrerLigneLocale(ownerId, "members", ligneMiseAJour);
    modifie = true;
  }
  return modifie;
}
