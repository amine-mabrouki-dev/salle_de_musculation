import { utilisateurConnecteId } from "./offlineStore";
import { convertirImageRedimensionneeEnBlob } from "./fondSalle";
import { enregistrerLocalement, lireDonneesLocales, nouvelleLigne } from "./localRepository";
import { lireOutbox } from "./localDatabase";
import { synchroniserBaseLocale } from "./syncEngine";
import { supabase } from "./supabase";
import { verifierIdentifiantsLigne } from "./uuid";

const bucket = "member-photos";
const limiteImage = 5 * 1024 * 1024;

export function messageErreurPhoto(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/column\s+members\.photo_path\s+does not exist/i.test(message)) {
    return "La base Supabase n’est pas à jour. Exécutez supabase/migrations/011_member_photos.sql dans Supabase > SQL Editor.";
  }
  if (/column\s+(sections|tariffs|members|subscriptions|payments|expenses)\.(updated_at|deleted_at)\s+does not exist/i.test(message)) {
    return "La synchronisation Supabase n’est pas configurée. Exécutez d’abord supabase/migrations/010_sync.sql, puis 011_member_photos.sql.";
  }
  if (/bucket.*not found|bucket.*does not exist/i.test(message)) {
    return "Le stockage des photos n’est pas configuré. Exécutez supabase/migrations/011_member_photos.sql dans Supabase > SQL Editor.";
  }
  if (/row-level security|permission denied|unauthorized/i.test(message)) {
    return "Supabase a refusé l’accès à cette photo. Vérifiez que vous êtes connecté et que la migration 011 est appliquée.";
  }
  return message;
}

export async function modifierPhotoMembre(memberId: string, fichier: File | null): Promise<void> {
  const userId = await utilisateurConnecteId();
  verifierIdentifiantsLigne({ id: userId });
  verifierIdentifiantsLigne({ id: memberId });
  const client = supabase;
  if (!navigator.onLine || !client) {
    throw new Error("La photo d’un membre peut être ajoutée ou modifiée uniquement avec une connexion Internet.");
  }
  const donnees = await lireDonneesLocales(userId);
  const membre = donnees.membres.find((row) => row.id === memberId);
  if (!membre) throw new Error("Ce membre est introuvable dans les données locales.");

  const nouveauChemin = fichier ? `${userId}/${memberId}/${crypto.randomUUID()}.jpg` : null;
  if (fichier && nouveauChemin) {
    if (!fichier.type.startsWith("image/")) {
      throw new Error("Choisissez un fichier image valide.");
    }
    if (fichier.size > 12 * 1024 * 1024) {
      throw new Error("La photo dépasse 12 Mo. Choisissez une image plus légère.");
    }
    const image = await convertirImageRedimensionneeEnBlob(fichier);
    if (image.size > limiteImage) {
      throw new Error("La photo optimisée dépasse la limite de 5 Mo.");
    }
    const { error } = await client.storage.from(bucket).upload(nouveauChemin, image, {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "3600",
    });
    if (error) throw error;
  }

  const updatedAt = new Date().toISOString();
  try {
    await enregistrerLocalement(userId, "members", nouvelleLigne({
      ...membre,
      photo_path: nouveauChemin,
      updated_at: updatedAt,
    }));
  } catch (error: unknown) {
    if (nouveauChemin) {
      const { error: erreurNettoyage } = await client.storage.from(bucket).remove([nouveauChemin]);
      if (erreurNettoyage) {
        throw new Error(`L’enregistrement local de la photo a échoué et son fichier temporaire n’a pas pu être supprimé : ${erreurNettoyage.message}`, { cause: error });
      }
    }
    throw new Error(
      `L’enregistrement local de la photo a échoué : ${messageErreurPhoto(error)}`,
      { cause: error },
    );
  }

  try {
    await synchroniserBaseLocale(userId, true);
    const mutationEnAttente = (await lireOutbox(userId)).some(
      (item) => item.table_name === "members" && item.entity_id === memberId,
    );
    if (mutationEnAttente) {
      throw new Error("La mise à jour de la photo est encore dans la file de synchronisation.");
    }
  } catch (error: unknown) {
    throw new Error(
      `La photo est enregistrée sur cet appareil et sera synchronisée plus tard. ${messageErreurPhoto(error)}`,
      { cause: error },
    );
  }

  if (membre.photo_path && membre.photo_path !== nouveauChemin) {
    const { error } = await client.storage.from(bucket).remove([membre.photo_path]);
    if (error) {
      throw new Error("La nouvelle photo est enregistrée, mais l’ancienne image n’a pas pu être supprimée.");
    }
  }
}
