import type { LigneLocale, TableSynchronisee } from "./localDatabase.types";

export type LignesSauvegarde = Record<TableSynchronisee, LigneLocale[]>;

export function verifierEnteteSauvegarde(bytes: Uint8Array): void {
  if (bytes.length < 100 || new TextDecoder().decode(bytes.subarray(0, 16)) !== "SQLite format 3\u0000") {
    throw new Error("Le fichier choisi n’est pas une sauvegarde SQLite valide.");
  }
}

const colonnesCsv: Record<"members" | "subscriptions" | "payments" | "expenses", [string, string][]> = {
  members: [
    ["id", "Identifiant"],
    ["full_name", "Nom complet"],
    ["phone", "Téléphone"],
    ["notes", "Notes"],
    ["photo_path", "Photo"],
    ["created_at", "Créé le"],
    ["updated_at", "Modifié le"],
    ["deleted_at", "Supprimé le"],
  ],
  subscriptions: [
    ["id", "Identifiant"],
    ["member_id", "Identifiant du membre"],
    ["section_id", "Identifiant de l’activité"],
    ["section_name", "Activité"],
    ["tariff_id", "Identifiant du tarif"],
    ["duration", "Durée"],
    ["start_date", "Date de début"],
    ["end_date", "Date de fin"],
    ["price", "Prix (DT)"],
    ["amount_due", "Il doit encore (DT)"],
    ["status", "Statut"],
    ["renew_on_payment", "Renouveler au paiement"],
    ["updated_at", "Modifié le"],
    ["deleted_at", "Supprimé le"],
  ],
  payments: [
    ["id", "Identifiant"],
    ["member_id", "Identifiant du membre"],
    ["subscription_id", "Identifiant de l’abonnement"],
    ["amount", "Montant (DT)"],
    ["paid_at", "Payé le"],
    ["method", "Mode de paiement"],
    ["recorded_at", "Enregistré le"],
    ["updated_at", "Modifié le"],
    ["deleted_at", "Supprimé le"],
  ],
  expenses: [
    ["id", "Identifiant"],
    ["label", "Libellé"],
    ["amount", "Montant (DT)"],
    ["category", "Catégorie"],
    ["section_id", "Identifiant de l’activité"],
    ["section_name", "Activité"],
    ["spent_at", "Dépensé le"],
    ["updated_at", "Modifié le"],
    ["deleted_at", "Supprimé le"],
  ],
};

function champCsv(value: unknown): string {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function creerCsv(
  table: keyof typeof colonnesCsv,
  rows: LigneLocale[],
): Uint8Array {
  const columns = colonnesCsv[table];
  const lines = [
    columns.map(([, label]) => champCsv(label)).join(";"),
    ...rows.map((row) => columns.map(([field]) => champCsv(Reflect.get(row, field))).join(";")),
  ];
  return new TextEncoder().encode(`\uFEFF${lines.join("\r\n")}\r\n`);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function ecrire16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function ecrire32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

export function creerArchiveZip(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const checksum = crc32(file.bytes);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    ecrire32(localView, 0, 0x04034b50);
    ecrire16(localView, 4, 20);
    ecrire32(localView, 14, checksum);
    ecrire32(localView, 18, file.bytes.length);
    ecrire32(localView, 22, file.bytes.length);
    ecrire16(localView, 26, name.length);
    local.set(name, 30);
    localHeaders.push(local, file.bytes);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    ecrire32(centralView, 0, 0x02014b50);
    ecrire16(centralView, 4, 20);
    ecrire16(centralView, 6, 20);
    ecrire32(centralView, 16, checksum);
    ecrire32(centralView, 20, file.bytes.length);
    ecrire32(centralView, 24, file.bytes.length);
    ecrire16(centralView, 28, name.length);
    ecrire32(centralView, 42, offset);
    central.set(name, 46);
    centralHeaders.push(central);
    offset += local.length + file.bytes.length;
  }

  const centralSize = centralHeaders.reduce((sum, header) => sum + header.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  ecrire32(endView, 0, 0x06054b50);
  ecrire16(endView, 8, files.length);
  ecrire16(endView, 10, files.length);
  ecrire32(endView, 12, centralSize);
  ecrire32(endView, 16, offset);
  const parts = [...localHeaders, ...centralHeaders, end];
  const archive = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  return archive;
}

export function fusionnerLignesSauvegarde<T extends LigneLocale>(
  locales: T[],
  importees: T[],
): { lignes: T[]; ajouts: number; conserves: number } {
  const result = new Map(locales.map((row) => [row.id, row]));
  let ajouts = 0;
  let conserves = 0;
  for (const row of importees) {
    const local = result.get(row.id);
    if (!local || Date.parse(row.updated_at) > Date.parse(local.updated_at)) {
      result.set(row.id, row);
      ajouts += 1;
    } else {
      conserves += 1;
    }
  }
  return { lignes: [...result.values()], ajouts, conserves };
}
