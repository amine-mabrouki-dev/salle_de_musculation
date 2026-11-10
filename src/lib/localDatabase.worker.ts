/// <reference lib="webworker" />

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type {
  EntreeOutbox,
  ApercuSauvegarde,
  JournalConflit,
  LigneLocale,
  ResultatRestauration,
  TableSynchronisee,
  WorkerRequest,
  WorkerResponse,
} from "./localDatabase.types";
import { TABLES_SYNCHRONISEES } from "./localDatabase.types";
import {
  conserverDateCreationLocaleAbonnement,
  conserverPhotoLocaleMembre,
  vainqueurConflit,
} from "./syncQueue";
import { fusionnerLignesSauvegarde, verifierEnteteSauvegarde } from "./backupFormat";
import {
  cartographierIdentifiantsInvalides,
  isUuid,
  remplacerReferencesLegacy,
  verifierIdentifiantsLigne,
} from "./uuid";

type Backend = "sqlite" | "indexeddb";

interface IndexedRecord {
  key: string;
  kind: "entity" | "outbox" | "meta" | "log";
  ownerId: string;
  table?: TableSynchronisee;
  entityId?: string;
  row?: LigneLocale;
  entry?: EntreeOutbox;
  metaKey?: string;
  metaValue?: string;
  log?: JournalConflit;
}

let backend: Backend | null = null;
let sqlite: Awaited<ReturnType<typeof sqlite3InitModule>> | null = null;
let database: InstanceType<NonNullable<Awaited<ReturnType<typeof sqlite3InitModule>>["oo1"]["DB"]>> | null = null;
let indexedDatabase: IDBDatabase | null = null;
const restaurationsEnAttente = new Map<string, { ownerId: string; lignes: Record<TableSynchronisee, LigneLocale[]> }>();
const VERSION_SCHEMA_SQLITE = 2;

function verifierTable(table: string): asserts table is TableSynchronisee {
  if (!TABLES_SYNCHRONISEES.some((candidate) => candidate === table)) {
    throw new Error(`Table locale non autorisée : ${table}`);
  }
}

function jsonStable(value: unknown): string {
  return JSON.stringify(value);
}

function contenuMetier(row: LigneLocale): string {
  return jsonStable(Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== "updated_at"),
  ));
}

function ouvrirIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("gym4you-local-fallback", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("records")) {
        request.result.createObjectStore("records", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Impossible d’ouvrir IndexedDB."));
    request.onblocked = () => reject(new Error("L’ouverture d’IndexedDB est bloquée par un autre onglet."));
  });
}

function executerSql(
  sql: string,
  bind?: Record<string, string | number | null>,
): Record<string, string | number | null>[] {
  if (!database) throw new Error("La base SQLite n’est pas initialisée.");
  const resultRows: Record<string, string | number | null>[] = [];
  database.exec({ sql, bind, rowMode: "object", resultRows });
  return resultRows;
}

function initialiserSchemaSqlite(): void {
  if (!database) throw new Error("La base SQLite n’est pas initialisée.");
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sections (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id, id));
    CREATE TABLE IF NOT EXISTS tariffs (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id, id));
    CREATE TABLE IF NOT EXISTS members (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id, id));
    CREATE TABLE IF NOT EXISTS subscriptions (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id, id));
    CREATE TABLE IF NOT EXISTS payments (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id, id));
    CREATE TABLE IF NOT EXISTS expenses (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id, id));
    CREATE TABLE IF NOT EXISTS payment_cancellations (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id, id));
    CREATE TABLE IF NOT EXISTS expense_cancellations (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id, id));
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, entity_id TEXT NOT NULL, table_name TEXT NOT NULL,
      operation TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS outbox_order_idx ON outbox(owner_id, created_at, id);
    CREATE TABLE IF NOT EXISTS sync_meta (owner_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(owner_id, key));
    CREATE TABLE IF NOT EXISTS sync_log (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, table_name TEXT NOT NULL, entity_id TEXT NOT NULL,
      local_updated_at TEXT NOT NULL, remote_updated_at TEXT NOT NULL, winner TEXT NOT NULL, recorded_at TEXT NOT NULL
    );
  `);
}

interface OutboxStockee extends EntreeOutbox {}

interface JournalStocke extends JournalConflit {
  owner_id: string;
}

async function sauvegarderAvantMigrationIdentifiants(): Promise<void> {
  try {
    if (!database || !sqlite) throw new Error("SQLite n’est pas initialisé.");
    const pointer = database.affirmOpen().pointer;
    if (pointer === undefined) throw new Error("La connexion locale est indisponible.");
    const bytes = sqlite.capi.sqlite3_js_db_export(pointer);
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle("gym4you-safety-backups", { create: true });
    const nom = `avant-migration-uuid-${new Date().toISOString().replaceAll(":", "-")}.sqlite3`;
    const file = await directory.getFileHandle(nom, { create: true });
    const writable = await file.createWritable();
    try {
      await writable.write(bytes);
      await writable.close();
    } catch (error: unknown) {
      await writable.abort();
      throw error;
    }
  } catch (error: unknown) {
    throw new Error("La copie de sécurité locale a échoué. Les données n’ont pas été migrées.", { cause: error });
  }
}

async function migrerSchemaSqlite(): Promise<void> {
  if (!database) throw new Error("SQLite n’est pas initialisé.");
  const version = Number(executerSql("PRAGMA user_version")[0]?.user_version ?? 0);
  if (version >= VERSION_SCHEMA_SQLITE) return;

  const lignes = TABLES_SYNCHRONISEES.flatMap((table) =>
    executerSql(`SELECT owner_id,id,payload FROM ${table}`).map((row) => ({
      table,
      owner_id: String(row.owner_id),
      id: String(row.id),
      payload: String(row.payload),
    })),
  );
  const outbox = executerSql(
    "SELECT id,owner_id,entity_id,table_name,operation,payload,created_at,attempts,last_error FROM outbox",
  ).map((row) => ({
    id: String(row.id),
    owner_id: String(row.owner_id),
    entity_id: String(row.entity_id),
    table_name: String(row.table_name) as TableSynchronisee,
    operation: String(row.operation) as EntreeOutbox["operation"],
    payload: JSON.parse(String(row.payload)) as LigneLocale,
    created_at: String(row.created_at),
    attempts: Number(row.attempts),
    last_error: row.last_error == null ? null : String(row.last_error),
  } satisfies OutboxStockee));
  const journaux = executerSql(
    "SELECT id,owner_id,table_name,entity_id,local_updated_at,remote_updated_at,winner,recorded_at FROM sync_log",
  ).map((row) => row as unknown as JournalStocke);

  const cartographie = cartographierIdentifiantsInvalides([
    ...lignes.map((row) => ({ table: row.table, id: row.id })),
    ...outbox.map((entry) => ({ table: entry.table_name, id: entry.payload.id })),
    ...outbox.map((entry) => ({ table: entry.table_name, id: entry.entity_id })),
    ...journaux.map((entry) => ({ table: entry.table_name, id: entry.entity_id })),
    ...journaux.map((entry) => ({ table: "sync_log", id: entry.id })),
    ...outbox.map((entry) => ({ table: "outbox", id: entry.id })),
  ]);
  for (const entry of outbox) {
    if (/invalid input syntax for type uuid/i.test(entry.last_error ?? "")) {
      const byTable = cartographie.get(entry.table_name) ?? new Map<string, string>();
      if (!byTable.has(entry.payload.id)) byTable.set(entry.payload.id, crypto.randomUUID());
      cartographie.set(entry.table_name, byTable);
    }
  }

  const lignesConverties = lignes.map((row) => {
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    const convertie = remplacerReferencesLegacy(row.table, payload, cartographie);
    verifierIdentifiantsLigne(convertie);
    return { ...row, nouveauId: String(convertie.id), nouveauPayload: jsonStable(convertie) };
  });
  const outboxConvertie = outbox.map((entry) => {
    verifierTable(entry.table_name);
    const payload = remplacerReferencesLegacy(
      entry.table_name,
      entry.payload as unknown as Record<string, unknown>,
      cartographie,
    ) as unknown as LigneLocale;
    verifierIdentifiantsLigne(payload);
    const entityId = cartographie.get(entry.table_name)?.get(entry.entity_id) ?? payload.id;
    if (!isUuid(entityId)) throw new Error("Identifiant invalide");
    const change = payload.id !== entry.payload.id || entityId !== entry.entity_id;
    return {
      ...entry,
      nouveauId: cartographie.get("outbox")?.get(entry.id) ?? entry.id,
      entity_id: entityId,
      payload,
      attempts: change || /invalid input syntax for type uuid/i.test(entry.last_error ?? "") ? 0 : entry.attempts,
      last_error: change || /invalid input syntax for type uuid/i.test(entry.last_error ?? "") ? null : entry.last_error,
    };
  });
  const journauxConvertis = journaux.map((entry) => {
    const entityId = cartographie.get(entry.table_name)?.get(entry.entity_id) ?? entry.entity_id;
    if (!isUuid(entry.id) || !isUuid(entityId)) throw new Error("Identifiant invalide");
    return {
      ...entry,
      nouveauId: cartographie.get("sync_log")?.get(entry.id) ?? entry.id,
      entity_id: entityId,
    };
  });

  const necessiteReecriture = lignesConverties.some((row) => row.nouveauId !== row.id || row.nouveauPayload !== row.payload)
    || outboxConvertie.some((entry, index) =>
      entry.nouveauId !== outbox[index].id
      || entry.entity_id !== outbox[index].entity_id
      || jsonStable(entry.payload) !== jsonStable(outbox[index].payload)
      || entry.last_error !== outbox[index].last_error,
    )
    || journauxConvertis.some((entry, index) =>
      entry.nouveauId !== journaux[index].id || entry.entity_id !== journaux[index].entity_id,
    );

  if (necessiteReecriture) await sauvegarderAvantMigrationIdentifiants();
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const row of lignesConverties) {
      executerSql(
        `UPDATE ${row.table} SET id=$new_id,payload=$payload WHERE owner_id=$owner AND id=$old_id`,
        { $new_id: row.nouveauId, $payload: row.nouveauPayload, $owner: row.owner_id, $old_id: row.id },
      );
    }
    for (let index = 0; index < outboxConvertie.length; index += 1) {
      const entry = outboxConvertie[index];
      const original = outbox[index];
      executerSql(
        "UPDATE outbox SET id=$new_id,entity_id=$entity,payload=$payload,attempts=$attempts,last_error=$error WHERE owner_id=$owner AND id=$old_id",
        {
          $new_id: entry.nouveauId,
          $entity: entry.entity_id,
          $payload: jsonStable(entry.payload),
          $attempts: entry.attempts,
          $error: entry.last_error,
          $owner: entry.owner_id,
          $old_id: original.id,
        },
      );
    }
    for (let index = 0; index < journauxConvertis.length; index += 1) {
      const entry = journauxConvertis[index];
      const original = journaux[index];
      executerSql(
        "UPDATE sync_log SET id=$new_id,entity_id=$entity WHERE owner_id=$owner AND id=$old_id",
        { $new_id: entry.nouveauId, $entity: entry.entity_id, $owner: entry.owner_id, $old_id: original.id },
      );
    }
    database.exec(`PRAGMA user_version = ${VERSION_SCHEMA_SQLITE}`);
    database.exec("COMMIT");
  } catch (error: unknown) {
    database.exec("ROLLBACK");
    throw error;
  }
}

async function initialiser(): Promise<{ mode: "opfs-sahpool" | "indexeddb"; warning?: string }> {
  if (backend) {
    return backend === "sqlite"
      ? { mode: "opfs-sahpool" }
      : { mode: "indexeddb", warning: "Vos données sont enregistrées sur ce téléphone. Faites une sauvegarde régulièrement pour ne rien perdre." };
  }
  let erreurOpfs: unknown;
  try {
    if (!("storage" in navigator) || !navigator.storage?.getDirectory) {
      throw new Error("OPFS n’est pas disponible dans ce navigateur.");
    }
    sqlite = await sqlite3InitModule();
    const pool = await sqlite.installOpfsSAHPoolVfs({
      name: "opfs-sahpool",
      directory: "/gym4you-sqlite",
      initialCapacity: 8,
      preserveOnInitFailure: true,
    });
    database = new pool.OpfsSAHPoolDb("/gym4you.sqlite3");
    initialiserSchemaSqlite();
  } catch (error: unknown) {
    erreurOpfs = error;
    database?.close();
    database = null;
    sqlite = null;
  }
  if (database) {
    await migrerSchemaSqlite();
    backend = "sqlite";
    return { mode: "opfs-sahpool" };
  }
  try {
    indexedDatabase = await ouvrirIndexedDb();
  } catch (error: unknown) {
    throw new Error(`Stockage local indisponible. OPFS : ${String(erreurOpfs)}. IndexedDB : ${error instanceof Error ? error.message : String(error)}`);
  }
  await migrerSchemaIndexedDb();
  backend = "indexeddb";
  return {
    mode: "indexeddb",
    warning: "Vos données sont enregistrées sur ce téléphone. Faites une sauvegarde régulièrement pour ne rien perdre.",
  };
}

function lireLigneSqlite(ownerId: string, table: TableSynchronisee, id: string): LigneLocale | null {
  const [record] = executerSql(
    `SELECT payload FROM ${table} WHERE owner_id = $owner AND id = $id`,
    { $owner: ownerId, $id: id },
  );
  return record?.payload ? JSON.parse(String(record.payload)) as LigneLocale : null;
}

function enregistrerLigneSqlite(ownerId: string, table: TableSynchronisee, row: LigneLocale): void {
  executerSql(
    `INSERT INTO ${table}(owner_id,id,payload,updated_at,deleted_at) VALUES($owner,$id,$payload,$updated,$deleted)
     ON CONFLICT(owner_id,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at`,
    {
      $owner: ownerId,
      $id: row.id,
      $payload: jsonStable(row),
      $updated: row.updated_at,
      $deleted: row.deleted_at,
    },
  );
}

function lireEntreesOutboxSqlite(ownerId: string): EntreeOutbox[] {
  return executerSql(
    "SELECT id,owner_id,entity_id,table_name,operation,payload,created_at,attempts,last_error FROM outbox WHERE owner_id=$owner ORDER BY created_at,id",
    { $owner: ownerId },
  ).map((row) => ({
    id: String(row.id),
    owner_id: String(row.owner_id),
    entity_id: String(row.entity_id),
    table_name: String(row.table_name) as TableSynchronisee,
    operation: String(row.operation) as EntreeOutbox["operation"],
    payload: JSON.parse(String(row.payload)) as LigneLocale,
    created_at: String(row.created_at),
    attempts: Number(row.attempts),
    last_error: row.last_error == null ? null : String(row.last_error),
  }));
}

function cleRecord(ownerId: string, kind: string, id: string): string {
  return `${ownerId}:${kind}:${id}`;
}

function prochainHorodatageOutbox(dernier: string | null | undefined): () => string {
  let precedent = dernier ? Date.parse(dernier) : Number.NaN;
  return () => {
    precedent = Math.max(Date.now(), Number.isFinite(precedent) ? precedent + 1 : 0);
    return new Date(precedent).toISOString();
  };
}

function schemaSauvegarde(db: NonNullable<typeof database>): void {
  db.exec(`
    CREATE TABLE backup_manifest (format TEXT NOT NULL, version INTEGER NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE sections (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id,id));
    CREATE TABLE tariffs (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id,id));
    CREATE TABLE members (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id,id));
    CREATE TABLE subscriptions (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id,id));
    CREATE TABLE payments (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id,id));
    CREATE TABLE expenses (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id,id));
    CREATE TABLE payment_cancellations (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id,id));
    CREATE TABLE expense_cancellations (owner_id TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id,id));
  `);
}

function insererLignesSauvegarde(
  db: NonNullable<typeof database>,
  ownerId: string,
  table: TableSynchronisee,
  lignes: LigneLocale[],
): void {
  for (const row of lignes) {
    db.exec({
      sql: `INSERT INTO ${table}(owner_id,id,payload,updated_at,deleted_at) VALUES($owner,$id,$payload,$updated,$deleted)`,
      bind: {
        $owner: ownerId,
        $id: row.id,
        $payload: jsonStable(row),
        $updated: row.updated_at,
        $deleted: row.deleted_at,
      },
    });
  }
}

function ouvrirBaseImportee(bytes: Uint8Array): NonNullable<typeof database> {
  if (!sqlite) throw new Error("SQLite n’est pas initialisé.");
  verifierEnteteSauvegarde(bytes);
  const imported = new sqlite.oo1.DB();
  const pointer = sqlite.wasm.allocFromTypedArray(bytes);
  try {
    const databasePointer = imported.affirmOpen().pointer;
    if (databasePointer === undefined) throw new Error("Impossible d’ouvrir la sauvegarde SQLite.");
    const result = sqlite.capi.sqlite3_deserialize(
      databasePointer,
      "main",
      pointer,
      bytes.byteLength,
      bytes.byteLength,
      1,
    );
    if (result !== 0) {
      throw new Error(`Impossible de lire la base SQLite (code ${result}).`);
    }
    return imported;
  } catch (error: unknown) {
    sqlite.wasm.dealloc(pointer);
    imported.close();
    throw error;
  }
}

function lignesDepuisBaseImportee(
  imported: NonNullable<typeof database>,
  ownerId: string,
): Record<TableSynchronisee, LigneLocale[]> {
  const integrityRows: Record<string, string | number | null>[] = [];
  imported.exec({ sql: "PRAGMA quick_check", rowMode: "object", resultRows: integrityRows });
  if (integrityRows.length !== 1 || Object.values(integrityRows[0] ?? {})[0] !== "ok") {
    throw new Error("La sauvegarde SQLite est endommagée.");
  }
  const [manifest] = (() => {
    const resultRows: Record<string, string | number | null>[] = [];
    imported.exec({ sql: "SELECT format,version,owner_id,created_at FROM backup_manifest", rowMode: "object", resultRows });
    return resultRows;
  })();
  if (
    manifest?.format !== "gym4you-sqlite-backup"
    || Number(manifest.version) !== 1
    || manifest.owner_id !== ownerId
  ) {
    throw new Error("Cette sauvegarde est invalide, incompatible ou appartient à un autre compte.");
  }

  const rowsByTable = {} as Record<TableSynchronisee, LigneLocale[]>;
  const requiredFields: Record<TableSynchronisee, string[]> = {
    sections: ["name", "coach_name", "coach_phone", "is_active"],
    tariffs: ["section_id", "category", "monthly_price", "annual_price"],
    members: ["user_id", "full_name", "phone", "notes", "created_at", "gym_id", "created_by", "updated_by"],
    subscriptions: ["user_id", "member_id", "section_id", "tariff_id", "duration", "start_date", "end_date", "price", "gym_id", "created_by", "updated_by"],
    payments: ["user_id", "member_id", "subscription_id", "amount", "paid_at", "method", "gym_id", "created_by", "updated_by"],
    expenses: ["user_id", "label", "amount", "category", "spent_at", "gym_id", "created_by", "updated_by"],
    payment_cancellations: ["user_id", "payment_id", "type", "reason", "cancelled_by", "cancelled_at", "gym_id", "created_by", "updated_by"],
    expense_cancellations: ["user_id", "expense_id", "type", "reason", "cancelled_by", "cancelled_at", "gym_id", "created_by", "updated_by"],
  };
  for (const table of TABLES_SYNCHRONISEES) {
    const resultRows: Record<string, string | number | null>[] = [];
    imported.exec({
      sql: `SELECT id,payload,updated_at,deleted_at FROM ${table} ORDER BY id`,
      rowMode: "object",
      resultRows,
    });
    rowsByTable[table] = resultRows.map((record) => {
      let payload: unknown;
      try {
        payload = JSON.parse(String(record.payload));
      } catch {
        throw new Error(`La sauvegarde contient une ligne invalide dans « ${table} ».`);
      }
      if (
        !payload || typeof payload !== "object"
        || !("id" in payload) || payload.id !== record.id
        || !("updated_at" in payload) || payload.updated_at !== record.updated_at
        || !("deleted_at" in payload)
        || (payload.deleted_at !== null && typeof payload.deleted_at !== "string")
        || !Number.isFinite(Date.parse(String(record.updated_at)))
        || requiredFields[table].some((field) => !Object.hasOwn(payload, field))
        || (["members", "subscriptions", "payments", "expenses", "payment_cancellations", "expense_cancellations"].includes(table)
          && (typeof Reflect.get(payload, "user_id") !== "string"
            || typeof Reflect.get(payload, "gym_id") !== "string"))
      ) {
        throw new Error(`La sauvegarde ne respecte pas le schéma attendu dans « ${table} ».`);
      }
      return payload as LigneLocale;
    });
  }
  return rowsByTable;
}

function lireToutesLesLignes(ownerId: string): Record<TableSynchronisee, LigneLocale[]> {
  const rowsByTable = {} as Record<TableSynchronisee, LigneLocale[]>;
  for (const table of TABLES_SYNCHRONISEES) {
    if (backend === "sqlite") {
      rowsByTable[table] = executerSql(
        `SELECT payload FROM ${table} WHERE owner_id=$owner ORDER BY id`,
        { $owner: ownerId },
      ).map((row) => JSON.parse(String(row.payload)) as LigneLocale);
    } else {
      rowsByTable[table] = [];
    }
  }
  return rowsByTable;
}

async function creerSauvegardePortable(ownerId: string): Promise<Uint8Array> {
  if (!sqlite) throw new Error("SQLite n’est pas initialisé.");
  const backup = new sqlite.oo1.DB();
  try {
    schemaSauvegarde(backup);
    backup.exec({
      sql: "INSERT INTO backup_manifest(format,version,owner_id,created_at) VALUES($format,$version,$owner,$created)",
      bind: {
        $format: "gym4you-sqlite-backup",
        $version: 1,
        $owner: ownerId,
        $created: new Date().toISOString(),
      },
    });

    if (backend === "sqlite") {
      const currentRows = lireToutesLesLignes(ownerId);
      for (const table of TABLES_SYNCHRONISEES) {
        insererLignesSauvegarde(backup, ownerId, table, currentRows[table]);
      }
    } else {
      const records = await tousLesRecords(ownerId);
      for (const table of TABLES_SYNCHRONISEES) {
        const rows = records.flatMap((record) =>
          record.kind === "entity" && record.table === table && record.row ? [record.row] : [],
        );
        insererLignesSauvegarde(backup, ownerId, table, rows);
      }
    }
    const databasePointer = backup.affirmOpen().pointer;
    if (databasePointer === undefined) throw new Error("Impossible d’exporter la base SQLite locale.");
    return sqlite.capi.sqlite3_js_db_export(databasePointer);
  } finally {
    backup.close();
  }
}

function requeteIndexed<T>(
  magasin: IDBObjectStore,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = operation(magasin);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Erreur IndexedDB."));
  });
}

function attendreTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Échec d’une transaction IndexedDB."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Transaction IndexedDB interrompue."));
  });
}

async function migrerSchemaIndexedDb(): Promise<void> {
  if (!indexedDatabase) throw new Error("IndexedDB n’est pas initialisé.");
  const records = await requeteIndexed<IndexedRecord[]>(
    indexedDatabase.transaction("records", "readonly").objectStore("records"),
    (store) => store.getAll(),
  );
  const schema = records.find((record) =>
    record.kind === "meta" && record.ownerId === "__schema__" && record.metaKey === "version",
  );
  if (Number(schema?.metaValue ?? 0) >= VERSION_SCHEMA_SQLITE) return;

  const candidats = records.flatMap((record) => {
    if (record.kind === "entity" && record.table && record.row) {
      return [{ table: record.table, id: record.row.id }];
    }
    if (record.kind === "outbox" && record.entry) {
      return [
        { table: record.entry.table_name, id: record.entry.payload.id },
        { table: record.entry.table_name, id: record.entry.entity_id },
        { table: "outbox", id: record.entry.id },
      ];
    }
    if (record.kind === "log" && record.log) {
      return [
        { table: record.log.table_name, id: record.log.entity_id },
        { table: "sync_log", id: record.log.id },
      ];
    }
    return [];
  });
  const cartographie = cartographierIdentifiantsInvalides(candidats);
  for (const record of records) {
    const entry = record.kind === "outbox" ? record.entry : undefined;
    if (!entry || !/invalid input syntax for type uuid/i.test(entry.last_error ?? "")) continue;
    const parTable = cartographie.get(entry.table_name) ?? new Map<string, string>();
    if (!parTable.has(entry.payload.id)) parTable.set(entry.payload.id, crypto.randomUUID());
    cartographie.set(entry.table_name, parTable);
  }

  const updatedRecords: IndexedRecord[] = [];
  for (const record of records) {
    if (record.kind === "entity" && record.table && record.row) {
      const row = remplacerReferencesLegacy(record.table, record.row as unknown as Record<string, unknown>, cartographie) as unknown as LigneLocale;
      verifierIdentifiantsLigne(row);
      updatedRecords.push({
        ...record,
        key: cleRecord(record.ownerId, "entity", `${record.table}:${row.id}`),
        entityId: row.id,
        row,
      });
    } else if (record.kind === "outbox" && record.entry) {
      verifierTable(record.entry.table_name);
      const payload = remplacerReferencesLegacy(
        record.entry.table_name,
        record.entry.payload as unknown as Record<string, unknown>,
        cartographie,
      ) as unknown as LigneLocale;
      verifierIdentifiantsLigne(payload);
      const entityId = cartographie.get(record.entry.table_name)?.get(record.entry.entity_id) ?? payload.id;
      if (!isUuid(entityId)) throw new Error("Identifiant invalide");
      const change = payload.id !== record.entry.payload.id || entityId !== record.entry.entity_id;
      const entry: EntreeOutbox = {
        ...record.entry,
        id: cartographie.get("outbox")?.get(record.entry.id) ?? record.entry.id,
        entity_id: entityId,
        payload,
        attempts: change || /invalid input syntax for type uuid/i.test(record.entry.last_error ?? "") ? 0 : record.entry.attempts,
        last_error: change || /invalid input syntax for type uuid/i.test(record.entry.last_error ?? "") ? null : record.entry.last_error,
      };
      updatedRecords.push({
        ...record,
        key: cleRecord(record.ownerId, "outbox", entry.id),
        entityId,
        entry,
      });
    } else if (record.kind === "log" && record.log) {
      const log = {
        ...record.log,
        id: cartographie.get("sync_log")?.get(record.log.id) ?? record.log.id,
        entity_id: cartographie.get(record.log.table_name)?.get(record.log.entity_id) ?? record.log.entity_id,
      };
      if (!isUuid(log.id) || !isUuid(log.entity_id)) throw new Error("Identifiant invalide");
      updatedRecords.push({
        ...record,
        key: cleRecord(record.ownerId, "log", log.id),
        log,
      });
    } else {
      updatedRecords.push(record);
    }
  }

  const backupKey = cleRecord("__schema__", "meta", `backup-uuid-${Date.now()}`);
  const transaction = indexedDatabase.transaction("records", "readwrite");
  const store = transaction.objectStore("records");
  store.put({
    key: backupKey,
    kind: "meta",
    ownerId: "__schema__",
    metaKey: backupKey,
    metaValue: JSON.stringify(records),
  } satisfies IndexedRecord);
  records.forEach((record) => store.delete(record.key));
  updatedRecords.forEach((record) => store.put(record));
  store.put({
    key: cleRecord("__schema__", "meta", "version"),
    kind: "meta",
    ownerId: "__schema__",
    metaKey: "version",
    metaValue: String(VERSION_SCHEMA_SQLITE),
  } satisfies IndexedRecord);
  await attendreTransaction(transaction);
}

async function tousLesRecords(ownerId: string): Promise<IndexedRecord[]> {
  if (!indexedDatabase) throw new Error("IndexedDB n’est pas initialisé.");
  const transaction = indexedDatabase.transaction("records", "readonly");
  const rows = await requeteIndexed<IndexedRecord[]>(transaction.objectStore("records"), (store) => store.getAll());
  return rows.filter((row) => row.ownerId === ownerId);
}

async function traiter(request: WorkerRequest): Promise<{ result: unknown; mode: "opfs-sahpool" | "indexeddb"; warning?: string }> {
  const init = await initialiser();
  if (request.action === "init") return { result: true, ...init };

  if (request.action === "read") {
    verifierTable(request.table);
    if (backend === "sqlite") {
      const rows = executerSql(`SELECT payload FROM ${request.table} WHERE owner_id=$owner`, { $owner: request.ownerId });
      return { result: rows.map((row) => JSON.parse(String(row.payload)) as LigneLocale), mode: init.mode, warning: init.warning };
    }
    const records = (await tousLesRecords(request.ownerId)).filter((row) => row.kind === "entity" && row.table === request.table);
    return { result: records.flatMap((row) => row.row ? [row.row] : []), mode: init.mode, warning: init.warning };
  }

  if (request.action === "save" || request.action === "save-many") {
    const items = request.action === "save"
      ? [{ table: request.table, row: request.row, operation: request.operation }]
      : request.items;
    items.forEach((item) => {
      verifierTable(item.table);
      verifierIdentifiantsLigne(item.row);
    });
    if (backend === "sqlite") {
      if (!database) throw new Error("SQLite n’est pas initialisé.");
      database.exec("BEGIN IMMEDIATE");
      try {
        const [latest] = executerSql(
          "SELECT max(created_at) AS created_at FROM outbox WHERE owner_id=$owner",
          { $owner: request.ownerId },
        );
        const creerHorodatage = prochainHorodatageOutbox(
          latest?.created_at == null ? null : String(latest.created_at),
        );
        for (const item of items) {
          enregistrerLigneSqlite(request.ownerId, item.table, item.row);
          const [pending] = executerSql(
            "SELECT id FROM outbox WHERE owner_id=$owner AND table_name=$table AND entity_id=$entity LIMIT 1",
            { $owner: request.ownerId, $table: item.table, $entity: item.row.id },
          );
          if (pending) {
            executerSql(
              "UPDATE outbox SET operation=$operation,payload=$payload,attempts=0,last_error=NULL WHERE id=$id",
              { $operation: item.operation, $payload: jsonStable(item.row), $id: String(pending.id) },
            );
          } else {
            executerSql(
              "INSERT INTO outbox(id,owner_id,entity_id,table_name,operation,payload,created_at) VALUES($id,$owner,$entity,$table,$operation,$payload,$created)",
              {
                $id: crypto.randomUUID(), $owner: request.ownerId, $entity: item.row.id,
                $table: item.table, $operation: item.operation, $payload: jsonStable(item.row),
                $created: creerHorodatage(),
              },
            );
          }
        }
        database.exec("COMMIT");
      } catch (error: unknown) {
        database.exec("ROLLBACK");
        throw error;
      }
    } else {
      if (!indexedDatabase) throw new Error("IndexedDB n’est pas initialisé.");
      const transaction = indexedDatabase.transaction("records", "readwrite");
      const store = transaction.objectStore("records");
      const all = await requeteIndexed<IndexedRecord[]>(store, (recordStore) => recordStore.getAll());
      const lastCreatedAt = all
        .filter((record) => record.kind === "outbox" && record.ownerId === request.ownerId && record.entry)
        .map((record) => record.entry!.created_at)
        .sort()
        .at(-1) ?? null;
      const creerHorodatage = prochainHorodatageOutbox(lastCreatedAt);
      for (const item of items) {
        const matching = all.find((row) => row.kind === "outbox" && row.ownerId === request.ownerId
          && row.table === item.table && row.entityId === item.row.id);
        store.put({
          key: cleRecord(request.ownerId, "entity", `${item.table}:${item.row.id}`),
          kind: "entity", ownerId: request.ownerId, table: item.table, entityId: item.row.id, row: item.row,
        } satisfies IndexedRecord);
        const entry: EntreeOutbox = {
          id: matching?.entry?.id ?? crypto.randomUUID(),
          owner_id: request.ownerId,
          entity_id: item.row.id,
          table_name: item.table,
          operation: item.operation,
          payload: item.row,
          created_at: matching?.entry?.created_at ?? creerHorodatage(),
          attempts: 0,
          last_error: null,
        };
        store.put({
          key: cleRecord(request.ownerId, "outbox", entry.id),
          kind: "outbox", ownerId: request.ownerId, table: item.table, entityId: item.row.id, entry,
        } satisfies IndexedRecord);
      }
      await attendreTransaction(transaction);
    }
    return { result: true, mode: init.mode, warning: init.warning };
  }

  if (request.action === "merge") {
    verifierTable(request.table);
    verifierIdentifiantsLigne(request.row);
    const local = backend === "sqlite"
      ? lireLigneSqlite(request.ownerId, request.table, request.row.id)
      : (await tousLesRecords(request.ownerId)).find((record) =>
        record.kind === "entity" && record.table === request.table && record.entityId === request.row.id,
      )?.row ?? null;
    const avecDateLocale = conserverDateCreationLocaleAbonnement(request.table, local, request.row);
    const ligneDistante = conserverPhotoLocaleMembre(request.table, local, avecDateLocale);
    if (local && contenuMetier(local) !== contenuMetier(ligneDistante) && local.updated_at !== ligneDistante.updated_at) {
      const winner = vainqueurConflit(local.updated_at, ligneDistante.updated_at);
      const conflict: JournalConflit = {
        id: crypto.randomUUID(),
        table_name: request.table,
        entity_id: request.row.id,
        local_updated_at: local.updated_at,
        remote_updated_at: ligneDistante.updated_at,
        winner,
        recorded_at: new Date().toISOString(),
      };
      if (backend === "sqlite") {
        executerSql(
          "INSERT INTO sync_log(id,owner_id,table_name,entity_id,local_updated_at,remote_updated_at,winner,recorded_at) VALUES($id,$owner,$table,$entity,$local,$remote,$winner,$recorded)",
          {
            $id: conflict.id, $owner: request.ownerId, $table: conflict.table_name, $entity: conflict.entity_id,
            $local: conflict.local_updated_at, $remote: conflict.remote_updated_at,
            $winner: winner, $recorded: conflict.recorded_at,
          },
        );
      } else {
        const transaction = indexedDatabase!.transaction("records", "readwrite");
        transaction.objectStore("records").put({
          key: cleRecord(request.ownerId, "log", conflict.id), kind: "log",
          ownerId: request.ownerId, log: conflict,
        } satisfies IndexedRecord);
        await attendreTransaction(transaction);
      }
      if (winner === "local") return { result: "local", mode: init.mode, warning: init.warning };
    }
    if (backend === "sqlite") {
      enregistrerLigneSqlite(request.ownerId, request.table, ligneDistante);
    } else {
      const transaction = indexedDatabase!.transaction("records", "readwrite");
      transaction.objectStore("records").put({
        key: cleRecord(request.ownerId, "entity", `${request.table}:${request.row.id}`),
        kind: "entity", ownerId: request.ownerId, table: request.table,
        entityId: request.row.id, row: ligneDistante,
      } satisfies IndexedRecord);
      await attendreTransaction(transaction);
    }
    return { result: "remote", mode: init.mode, warning: init.warning };
  }

  if (request.action === "outbox") {
    const entries = backend === "sqlite"
      ? lireEntreesOutboxSqlite(request.ownerId)
      : (await tousLesRecords(request.ownerId))
        .flatMap((record) => record.kind === "outbox" && record.entry ? [record.entry] : [])
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    return { result: entries, mode: init.mode, warning: init.warning };
  }

  if (request.action === "pending-count") {
    const count = backend === "sqlite"
      ? Number(executerSql("SELECT count(*) AS count FROM outbox WHERE owner_id=$owner", { $owner: request.ownerId })[0]?.count ?? 0)
      : (await tousLesRecords(request.ownerId)).filter((record) => record.kind === "outbox").length;
    return { result: count, mode: init.mode, warning: init.warning };
  }

  if (request.action === "ack" || request.action === "fail") {
    if (backend === "sqlite") {
      if (request.action === "ack") {
        executerSql("DELETE FROM outbox WHERE id=$id AND owner_id=$owner", { $id: request.outboxId, $owner: request.ownerId });
      } else {
        executerSql("UPDATE outbox SET attempts=attempts+1,last_error=$error WHERE id=$id AND owner_id=$owner", {
          $error: request.error, $id: request.outboxId, $owner: request.ownerId,
        });
      }
    } else {
      const transaction = indexedDatabase!.transaction("records", "readwrite");
      const store = transaction.objectStore("records");
      const key = cleRecord(request.ownerId, "outbox", request.outboxId);
      const record = await requeteIndexed<IndexedRecord | undefined>(store, (recordStore) => recordStore.get(key));
      if (record?.entry) {
        if (request.action === "ack") store.delete(key);
        else store.put({
          ...record,
          entry: { ...record.entry, attempts: record.entry.attempts + 1, last_error: request.error },
        } satisfies IndexedRecord);
      }
      await attendreTransaction(transaction);
    }
    return { result: true, mode: init.mode, warning: init.warning };
  }

  if (request.action === "meta-get") {
    const [row] = backend === "sqlite"
      ? executerSql("SELECT value FROM sync_meta WHERE owner_id=$owner AND key=$key", { $owner: request.ownerId, $key: request.key })
      : [];
    if (backend === "indexeddb") {
      const record = (await tousLesRecords(request.ownerId)).find((item) => item.kind === "meta" && item.metaKey === request.key);
      return { result: record?.metaValue ?? null, mode: init.mode, warning: init.warning };
    }
    return { result: row?.value == null ? null : String(row.value), mode: init.mode, warning: init.warning };
  }

  if (request.action === "meta-set") {
    if (backend === "sqlite") {
      executerSql(
        "INSERT INTO sync_meta(owner_id,key,value) VALUES($owner,$key,$value) ON CONFLICT(owner_id,key) DO UPDATE SET value=excluded.value",
        { $owner: request.ownerId, $key: request.key, $value: request.value },
      );
    } else {
      const transaction = indexedDatabase!.transaction("records", "readwrite");
      transaction.objectStore("records").put({
        key: cleRecord(request.ownerId, "meta", request.key), kind: "meta",
        ownerId: request.ownerId, metaKey: request.key, metaValue: request.value,
      } satisfies IndexedRecord);
      await attendreTransaction(transaction);
    }
    return { result: true, mode: init.mode, warning: init.warning };
  }

  if (request.action === "logs") {
    const logs = backend === "sqlite"
      ? executerSql(
        "SELECT id,table_name,entity_id,local_updated_at,remote_updated_at,winner,recorded_at FROM sync_log WHERE owner_id=$owner ORDER BY recorded_at DESC",
        { $owner: request.ownerId },
      ).map((row) => row as unknown as JournalConflit)
      : (await tousLesRecords(request.ownerId))
        .flatMap((record) => record.kind === "log" && record.log ? [record.log] : []);
    return { result: logs, mode: init.mode, warning: init.warning };
  }

  if (request.action === "backup-export") {
    const bytes = await creerSauvegardePortable(request.ownerId);
    return { result: bytes, mode: init.mode, warning: init.warning };
  }

  if (request.action === "backup-preview") {
    if (request.bytes.byteLength > 50 * 1024 * 1024) {
      throw new Error("Le fichier dépasse la limite de 50 Mo.");
    }
    let imported: NonNullable<typeof database> | null = null;
    try {
      imported = ouvrirBaseImportee(new Uint8Array(request.bytes));
      const lignes = lignesDepuisBaseImportee(imported, request.ownerId);
      const membres = lignes.members.filter((row) => row.deleted_at === null).length;
      const paiements = lignes.payments.filter((row) => row.deleted_at === null).length;
      const derniereDate = TABLES_SYNCHRONISEES
        .flatMap((table) => lignes[table].map((row) => row.updated_at))
        .reduce<string | null>((latest, value) =>
          latest === null || Date.parse(value) > Date.parse(latest) ? value : latest,
        null);
      const token = crypto.randomUUID();
      restaurationsEnAttente.set(token, { ownerId: request.ownerId, lignes });
      return {
        result: { token, membres, paiements, derniereDate } satisfies ApercuSauvegarde,
        mode: init.mode,
        warning: init.warning,
      };
    } catch (error: unknown) {
      if (error instanceof Error && (
        error.message.includes("sauvegarde")
        || error.message.includes("dépasse")
        || error.message.includes("SQLite")
      )) throw error;
      throw new Error("Le fichier choisi n’est pas une sauvegarde Gym4You valide ou son schéma est incompatible.");
    } finally {
      imported?.close();
    }
  }

  if (request.action === "backup-restore") {
    const pending = restaurationsEnAttente.get(request.token);
    if (!pending || pending.ownerId !== request.ownerId) {
      throw new Error("L’aperçu de cette sauvegarde a expiré. Choisissez à nouveau le fichier.");
    }
    const currentRows = backend === "sqlite"
      ? lireToutesLesLignes(request.ownerId)
      : null;
    const indexedRecords = backend === "indexeddb" ? await tousLesRecords(request.ownerId) : [];
    const changes: { table: TableSynchronisee; row: LigneLocale }[] = [];
    let ajouts = 0;
    let conserves = 0;

    for (const table of TABLES_SYNCHRONISEES) {
      const localRows = currentRows?.[table] ?? indexedRecords.flatMap((record) =>
        record.kind === "entity" && record.table === table && record.row ? [record.row] : [],
      );
      const importedRows = pending.lignes[table];
      const merged = fusionnerLignesSauvegarde(localRows, importedRows);
      ajouts += merged.ajouts;
      conserves += merged.conserves;
      const localById = new Map(localRows.map((row) => [row.id, row]));
      changes.push(...importedRows.filter((row) => {
        const local = localById.get(row.id);
        return !local || Date.parse(row.updated_at) > Date.parse(local.updated_at);
      }).map((row) => ({ table, row })));
    }

    const creerHorodatage = prochainHorodatageOutbox(
      indexedRecords
        .flatMap((record) => record.kind === "outbox" && record.entry ? [record.entry.created_at] : [])
        .sort()
        .at(-1),
    );
    if (backend === "sqlite") {
      database!.exec("BEGIN IMMEDIATE");
      try {
        for (const item of changes) {
          enregistrerLigneSqlite(request.ownerId, item.table, item.row);
          const [pendingEntry] = executerSql(
            "SELECT id FROM outbox WHERE owner_id=$owner AND table_name=$table AND entity_id=$entity LIMIT 1",
            { $owner: request.ownerId, $table: item.table, $entity: item.row.id },
          );
          if (pendingEntry) {
            executerSql(
              "UPDATE outbox SET operation='upsert',payload=$payload,attempts=0,last_error=NULL WHERE id=$id",
              { $payload: jsonStable(item.row), $id: String(pendingEntry.id) },
            );
          } else {
            executerSql(
              "INSERT INTO outbox(id,owner_id,entity_id,table_name,operation,payload,created_at) VALUES($id,$owner,$entity,$table,'upsert',$payload,$created)",
              {
                $id: crypto.randomUUID(), $owner: request.ownerId, $entity: item.row.id,
                $table: item.table, $payload: jsonStable(item.row), $created: creerHorodatage(),
              },
            );
          }
        }
        database!.exec("COMMIT");
      } catch (error: unknown) {
        database!.exec("ROLLBACK");
        throw error;
      }
    } else {
      const transaction = indexedDatabase!.transaction("records", "readwrite");
      const store = transaction.objectStore("records");
      for (const item of changes) {
        const matching = indexedRecords.find((record) =>
          record.kind === "outbox" && record.table === item.table && record.entityId === item.row.id,
        );
        store.put({
          key: cleRecord(request.ownerId, "entity", `${item.table}:${item.row.id}`),
          kind: "entity", ownerId: request.ownerId, table: item.table, entityId: item.row.id, row: item.row,
        } satisfies IndexedRecord);
        const entry: EntreeOutbox = {
          id: matching?.entry?.id ?? crypto.randomUUID(),
          owner_id: request.ownerId,
          entity_id: item.row.id,
          table_name: item.table,
          operation: "upsert",
          payload: item.row,
          created_at: matching?.entry?.created_at ?? creerHorodatage(),
          attempts: 0,
          last_error: null,
        };
        store.put({
          key: cleRecord(request.ownerId, "outbox", entry.id),
          kind: "outbox", ownerId: request.ownerId, table: item.table, entityId: item.row.id, entry,
        } satisfies IndexedRecord);
      }
      await attendreTransaction(transaction);
    }
    restaurationsEnAttente.delete(request.token);
    return {
      result: { ajouts, conserves } satisfies ResultatRestauration,
      mode: init.mode,
      warning: init.warning,
    };
  }

  if (request.action === "clear") {
    if (backend === "sqlite") {
      if (!database) throw new Error("SQLite n’est pas initialisé.");
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const table of TABLES_SYNCHRONISEES) {
          executerSql(`DELETE FROM ${table} WHERE owner_id=$owner`, { $owner: request.ownerId });
        }
        executerSql("DELETE FROM outbox WHERE owner_id=$owner", { $owner: request.ownerId });
        executerSql("DELETE FROM sync_meta WHERE owner_id=$owner", { $owner: request.ownerId });
        executerSql("DELETE FROM sync_log WHERE owner_id=$owner", { $owner: request.ownerId });
        database.exec("COMMIT");
      } catch (error: unknown) {
        database.exec("ROLLBACK");
        throw error;
      }
    } else {
      const records = await tousLesRecords(request.ownerId);
      const transaction = indexedDatabase!.transaction("records", "readwrite");
      const store = transaction.objectStore("records");
      records.forEach((record) => store.delete(record.key));
      await attendreTransaction(transaction);
    }
    return { result: true, mode: init.mode, warning: init.warning };
  }

  throw new Error("Commande de stockage local inconnue.");
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  void traiter(request).then(
    ({ result, mode, warning }) => {
      const response: WorkerResponse = { id: request.id, ok: true, result, mode, warning };
      self.postMessage(response);
    },
    (error: unknown) => {
      const response: WorkerResponse = {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
    },
  );
};
