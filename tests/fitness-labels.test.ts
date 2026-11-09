import { describe, expect, it } from "vitest";
import { nomActiviteAffiche, nomActiviteCanonique, texte } from "../src/lib/textes";

describe("nom et catégorie de l’activité Fitness", () => {
  it("normalise les anciens noms sans modifier les identifiants", () => {
    expect(nomActiviteCanonique("Femme")).toBe("Fitness");
    expect(nomActiviteCanonique("Femmes")).toBe("Fitness");
    expect(nomActiviteAffiche("Femmes", "fr")).toBe("Fitness");
  });

  it("affiche Fitness en arabe et Enfant dans les deux langues", () => {
    expect(nomActiviteAffiche("Fitness", "ar")).toBe("اللياقة البدنية");
    expect(texte("enfant", "fr")).toBe("Enfant");
    expect(texte("enfant", "ar")).toBe("طفل");
  });
});
