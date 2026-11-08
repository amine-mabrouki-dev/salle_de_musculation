import { useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { lireFondSalle, proprietesFondSalle } from "../lib/fondSalle";
import { chargerFondSalleCloud, EVENEMENT_FOND_SALLE_MAJ } from "../lib/gymSettings";

export function AppBackground() {
  const { session } = useAuth();

  useEffect(() => {
    let active = true;
    let imageUrl: string | null = null;

    async function chargerFond() {
      if (!session?.user.id) {
        try {
          proprietesFondSalle(lireFondSalle());
        } catch (error: unknown) {
          console.error("Impossible de charger la photo de fond locale.", error);
        }
        return;
      }
      try {
        const image = await chargerFondSalleCloud(session.user.id);
        if (!active) return;
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        if (image) {
          imageUrl = URL.createObjectURL(image);
          proprietesFondSalle(imageUrl);
        } else {
          proprietesFondSalle(lireFondSalle());
        }
      } catch (error: unknown) {
        if (!active) return;
        console.error("Impossible de charger la photo de fond depuis Supabase Storage.", error);
        try {
          proprietesFondSalle(lireFondSalle());
        } catch (erreurLocal: unknown) {
          console.error("Impossible de charger la photo de fond locale.", erreurLocal);
        }
      }
    }

    void chargerFond();
    window.addEventListener(EVENEMENT_FOND_SALLE_MAJ, chargerFond);
    return () => {
      active = false;
      window.removeEventListener(EVENEMENT_FOND_SALLE_MAJ, chargerFond);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      document.documentElement.style.removeProperty("--user-gym-background");
    };
  }, [session?.user.id]);

  return <div className="app-backdrop" aria-hidden="true" />;
}
