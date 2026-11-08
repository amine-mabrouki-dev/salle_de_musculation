import { describe, expect, it } from "vitest";
import { messageErreur } from "../src/hooks/useAuth";

describe("messages d’erreur", () => {
  it("affiche directement les erreurs déjà formatées en chaîne", () => {
    expect(messageErreur("La colonne subscriptions.updated_at est absente."))
      .toBe("La colonne subscriptions.updated_at est absente.");
  });

  it("rédige clairement un message quand une table Supabase manque dans le schéma", () => {
    expect(messageErreur("Could not find the table 'public.gym_memberships' in the schema cache"))
      .toBe("La base de données de la salle n’est pas encore prête. Demandez au responsable d’appliquer la mise à jour de la base.");
  });
});
