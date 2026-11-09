import { describe, expect, it } from "vitest";
import { nomActiviteAffiche, texte, textesArabes } from "../src/lib/textes";

const clesAbonnements = [
  "abonnementsTitre",
  "abonnementsEnCours",
  "abonnementsAnnuels",
  "abonnementsMensuels",
  "abonnementsMensuelsEnCours",
  "abonnementsAnnuelsEnCours",
  "grilleTarifs",
  "nouvelAbonnementBouton",
  "abonnementNouveauTitre",
  "abonnementRenouvelerTitre",
  "abonnementMensuel30Jours",
  "abonnementAnnuel365Jours",
  "abonnementTarifAnnuelEstime",
  "abonnementPrixADefinir",
  "abonnementConfirmerPrix",
  "abonnementPrixManuel",
  "abonnementRenouvellementDate",
  "abonnementSectionDesactivee",
  "abonnementsFiltrerAria",
  "abonnementFin",
  "abonnementFinCourte",
  "abonnementArenouveler",
  "abonnementCategorie",
  "abonnementOperation",
  "abonnementCreerOption",
  "abonnementRenouvelerOption",
  "abonnementChoisir",
  "abonnementDebutPrevu",
  "abonnementFinPrevue",
  "abonnementPrixLabel",
  "abonnementAnnuler",
  "abonnementEnregistrement",
  "abonnementRenouvelerAction",
  "abonnementCreerAction",
  "abonnementRenouvele",
  "nouvelAbonnementCree",
  "abonnementEnregistreActualisationEchouee",
  "tarifNonConfigureSection",
  "prixFormuleInvalide",
  "confirmerTarifAnnuelErreur",
  "selectionnerAbonnementErreur",
  "erreurChargementAbonnements",
  "erreurEnregistrementAbonnement",
  "aucunAbonnementDuree",
  "abonnementMensuel",
  "abonnementAnnuel",
  "tarifNonConfigure",
  "abonnementMensuel30Jours",
  "abonnementAnnuel365Jours",
  "abonnementsEnCours",
  "abonnementsAnnuels",
  "abonnementsMensuels",
  "abonnementsMensuelsEnCours",
  "abonnementsAnnuelsEnCours",
  "grilleTarifs",
  "tarifMensuel",
  "tarifAnnuel",
  "aConfirmer",
  "membreInconnu",
  "abonnementNouveauTitre",
  "abonnementRenouvelerTitre",
  "abonnementSection",
  "abonnementRenouvele",
  "nouvelAbonnementCree",
] as const;

describe("traduction de la page Abonnements", () => {
  it("fournit une traduction arabe spécifique pour chaque libellé de la page", () => {
    for (const cle of clesAbonnements) {
      expect(textesArabes[cle], `${cle} doit être traduit en arabe`).toBeTruthy();
      expect(texte(cle, "ar")).not.toBe(texte(cle, "fr"));
    }
  });

  it("traduit les activités connues et garde un nom d’activité personnalisé", () => {
    expect(nomActiviteAffiche("Musculation", "ar")).toBe("كمال الأجسام");
    expect(nomActiviteAffiche("Fitness", "ar")).toBe("اللياقة البدنية");
    expect(nomActiviteAffiche("Kick-boxing", "ar")).toBe("الكيك بوكسينغ");
    expect(nomActiviteAffiche("Cardio personnalisé", "ar")).toBe("Cardio personnalisé");
  });
});
