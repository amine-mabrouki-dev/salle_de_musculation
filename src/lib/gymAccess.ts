import { enregistrerInstantane, lireInstantane } from "./offlineStore";
import { supabase } from "./supabase";

function messageErreurAccess(erreur: unknown): string {
  const message =
    typeof erreur === "string"
      ? erreur
      : erreur instanceof Error
      ? erreur.message
      : typeof erreur === "object" && erreur !== null && "message" in erreur
        ? String(erreur.message)
        : "";

  if (/could not find the table|relation .* does not exist|does not exist|not found/i.test(message)
    && /gym_memberships|member_history|members|subscriptions|payments|expenses|sections|tariffs|gyms/i.test(message)) {
    return "La base de données de la salle n’est pas encore prête. Demandez au responsable d’appliquer la mise à jour de la base.";
  }

  if (!message) return "La base de données de la salle n’est pas disponible pour le moment.";
  return message;
}

export type RoleSalle = "gerant" | "assistant";

export interface AccesSalle {
  gymId: string;
  role: RoleSalle;
  displayName: string;
}

const cleCache = "gym-access-v1";

export async function chargerAccesSalle(userId: string): Promise<AccesSalle> {
  if (navigator.onLine && supabase) {
    try {
      const { data, error } = await supabase
        .from("gym_memberships")
        .select("gym_id,role,display_name")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        if (data.role !== "gerant" && data.role !== "assistant") {
          throw new Error("Le rôle associé à ce compte est invalide.");
        }
        const access: AccesSalle = {
          gymId: data.gym_id,
          role: data.role,
          displayName: data.display_name || (data.role === "gerant" ? "Gérant" : "Assistant"),
        };
        await enregistrerInstantane(userId, cleCache, access);
        return access;
      }
      throw new Error("Ce compte n’est associé à aucune salle. Demandez au gérant de l’ajouter dans Supabase.");
    } catch (error: unknown) {
      const message = messageErreurAccess(error);
      const cached = await lireInstantane<AccesSalle>(userId, cleCache);
      if (cached && (cached.data.role === "gerant" || cached.data.role === "assistant")) {
        return cached.data;
      }
      throw new Error(message);
    }
  }

  const cached = await lireInstantane<AccesSalle>(userId, cleCache);
  if (cached && (cached.data.role === "gerant" || cached.data.role === "assistant")) {
    return cached.data;
  }
  throw new Error("L’accès à la salle n’est pas disponible hors connexion sur cet appareil. Connectez-vous une première fois en ligne.");
}
