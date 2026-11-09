import { creerArchiveZip, creerCsv } from "./backupFormat";
import {
  ecrireMetaLocale,
  exporterBaseLocale,
  type LigneLocale,
} from "./localDatabase";
import { lireDonneesLocales } from "./localRepository";
import { synchroniserBaseLocale } from "./syncEngine";
import { nomActiviteAffiche } from "./textes";
import { creerHtmlRapportSauvegarde } from "./backupReport";

export const CLE_DATE_DERNIERE_SAUVEGARDE = "backup:last-created";

export interface FichiersSauvegarde {
  sqlite: File;
  zip: File;
  rapportHtml: string;
}

function blobDepuisOctets(bytes: Uint8Array, type: string): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type });
}

export function dateFichierTunis(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function ligneExport(row: { id: string; updated_at?: string; deleted_at?: string | null }): LigneLocale {
  return {
    ...row,
    updated_at: row.updated_at ?? "",
    deleted_at: row.deleted_at ?? null,
  };
}

export async function creerFichiersSauvegarde(ownerId: string): Promise<FichiersSauvegarde> {
  if (navigator.onLine) await synchroniserBaseLocale(ownerId, true);
  const [sqliteBytes, donnees] = await Promise.all([
    exporterBaseLocale(ownerId),
    lireDonneesLocales(ownerId),
  ]);
  const dateExport = new Date();
  const date = dateFichierTunis(dateExport);
  const nomSectionParId = new Map(donnees.sections.map((section) => [section.id, section.name]));
  const csvFiles = [
    { name: "membres.csv", bytes: creerCsv("members", donnees.membres.map(ligneExport)) },
    {
      name: "abonnements.csv",
      bytes: creerCsv("subscriptions", donnees.abonnements.map((row) => ({
        ...ligneExport(row),
        section_name: nomActiviteAffiche(nomSectionParId.get(row.section_id) ?? ""),
      }))),
    },
    { name: "paiements.csv", bytes: creerCsv("payments", donnees.paiements.map(ligneExport)) },
    {
      name: "depenses.csv",
      bytes: creerCsv("expenses", donnees.depenses.map((row) => ({
        ...ligneExport(row),
        section_name: row.section_id ? nomActiviteAffiche(nomSectionParId.get(row.section_id) ?? "") : "",
      }))),
    },
  ];
  const zipBytes = creerArchiveZip(csvFiles);
  return {
    sqlite: new File([blobDepuisOctets(sqliteBytes, "application/vnd.sqlite3")], `salle-${date}.sqlite`, { type: "application/vnd.sqlite3" }),
    zip: new File([blobDepuisOctets(zipBytes, "application/zip")], `salle-${date}.zip`, { type: "application/zip" }),
    rapportHtml: creerHtmlRapportSauvegarde(donnees, dateExport),
  };
}

function telecharger(fichier: File): void {
  const url = URL.createObjectURL(fichier);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = fichier.name;
  lien.hidden = true;
  document.body.append(lien);
  lien.click();
  lien.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function partagerOuTelechargerSauvegarde(
  ownerId: string,
  files: FichiersSauvegarde,
): Promise<"partage" | "telechargement"> {
  const shareFiles = [files.sqlite, files.zip];
  if (navigator.share && navigator.canShare?.({ files: shareFiles })) {
    try {
      await navigator.share({
        title: "Sauvegarde Gym4You",
        text: "Sauvegarde de la salle de sport.",
        files: shareFiles,
      });
      await ecrireMetaLocale(ownerId, CLE_DATE_DERNIERE_SAUVEGARDE, dateFichierTunis());
      return "partage";
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
    }
  }
  shareFiles.forEach(telecharger);
  await ecrireMetaLocale(ownerId, CLE_DATE_DERNIERE_SAUVEGARDE, dateFichierTunis());
  return "telechargement";
}

export async function telechargerSauvegardeAutomatique(
  ownerId: string,
  bytes: Uint8Array,
): Promise<void> {
  const file = new File([blobDepuisOctets(bytes, "application/vnd.sqlite3")], `salle-avant-restauration-${dateFichierTunis()}.sqlite`, {
    type: "application/vnd.sqlite3",
  });
  telecharger(file);
  await ecrireMetaLocale(ownerId, CLE_DATE_DERNIERE_SAUVEGARDE, dateFichierTunis());
}
