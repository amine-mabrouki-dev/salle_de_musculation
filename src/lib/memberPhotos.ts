import { utilisateurConnecteId } from "./offlineStore";
import { redimensionnerImage } from "./fondSalle";
import { enregistrerLocalement, lireDonneesLocales, nouvelleLigne } from "./localRepository";
import { verifierIdentifiantsLigne } from "./uuid";

const limiteImage = 5 * 1024 * 1024;
const limiteFichierOriginal = 12 * 1024 * 1024;

export async function preparerPhotoMembre(fichier: File): Promise<string> {
  if (!fichier.type.startsWith("image/")) {
    throw new Error("Choisissez un fichier image valide.");
  }
  if (fichier.size > limiteFichierOriginal) {
    throw new Error("La photo dépasse 12 Mo. Choisissez une image plus légère.");
  }
  const image = await redimensionnerImage(fichier);
  const imageBlob = await fetch(image).then((response) => {
    if (!response.ok) throw new Error("Impossible de préparer la photo.");
    return response.blob();
  });
  if (imageBlob.size > limiteImage) {
    throw new Error("La photo optimisée dépasse la limite de 5 Mo.");
  }
  return image;
}

export async function modifierPhotoMembre(
  memberId: string,
  photoPendingData: string | null,
): Promise<void> {
  const userId = await utilisateurConnecteId();
  verifierIdentifiantsLigne({ id: userId });
  verifierIdentifiantsLigne({ id: memberId });
  const donnees = await lireDonneesLocales(userId);
  const membre = donnees.membres.find((row) => row.id === memberId);
  if (!membre) throw new Error("Ce membre est introuvable dans les données locales.");

  const updatedAt = new Date().toISOString();
  await enregistrerLocalement(userId, "members", nouvelleLigne({
    ...membre,
    photo_path: photoPendingData ? membre.photo_path ?? null : null,
    photo_pending_data: photoPendingData,
    photo_pending_delete_path: photoPendingData ? null : membre.photo_path ?? null,
    updated_at: updatedAt,
  }));
}
