import { describe, expect, it } from "vitest";
import { creerArchiveZip, creerCsv, fusionnerLignesSauvegarde, verifierEnteteSauvegarde } from "../src/lib/backupFormat";
import type { LigneLocale } from "../src/lib/localDatabase.types";

const ligne: LigneLocale & { full_name: string; notes: string } = {
  id: "member-1",
  full_name: "Élève de Moularès",
  notes: "Sauvegarde française",
  updated_at: "2026-11-08T10:00:00.000Z",
  deleted_at: null,
};

describe("sauvegardes", () => {
  it("exporte puis fusionne exactement les données d’origine", () => {
    const exportRows = [ligne];
    const restauration = fusionnerLignesSauvegarde([], exportRows);
    expect(restauration.lignes).toEqual(exportRows);
    expect(fusionnerLignesSauvegarde(restauration.lignes, exportRows).lignes).toEqual(exportRows);
  });

  it("préserve la ligne locale la plus récente lors de la fusion", () => {
    const local = { ...ligne, full_name: "Version récente", updated_at: "2026-11-08T11:00:00.000Z" };
    const resultat = fusionnerLignesSauvegarde([local], [ligne]);
    expect(resultat.lignes).toEqual([local]);
    expect(resultat.conserves).toBe(1);
  });

  it("prépare un CSV avec BOM UTF-8 et une archive ZIP", () => {
    const csv = creerCsv("members", [ligne]);
    expect([...csv.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(csv)).toContain("Nom complet");
    expect(new TextDecoder().decode(csv)).toContain("Élève de Moularès");

    const zip = creerArchiveZip([{ name: "membres.csv", bytes: csv }]);
    expect([...zip.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(zip)).toContain("membres.csv");
  });

  it("refuse clairement un fichier qui n’est pas au format SQLite", () => {
    expect(() => verifierEnteteSauvegarde(new TextEncoder().encode("fichier invalide")))
      .toThrow("Le fichier choisi n’est pas une sauvegarde SQLite valide.");
  });
});
