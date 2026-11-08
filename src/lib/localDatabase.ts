import type {
  EntreeOutbox,
  ApercuSauvegarde,
  JournalConflit,
  LigneLocale,
  OperationOutbox,
  ResultatRestauration,
  TableSynchronisee,
  WorkerCommand,
  WorkerRequest,
  WorkerResponse,
} from "./localDatabase.types";

export {
  TABLES_SYNCHRONISEES,
  type EntreeOutbox,
  type ApercuSauvegarde,
  type JournalConflit,
  type LigneLocale,
  type OperationOutbox,
  type ResultatRestauration,
  type TableSynchronisee,
} from "./localDatabase.types";

export const EVENEMENT_DONNEES_LOCALES_MAJ = "gym4you-local-data-updated";
export const EVENEMENT_STOCKAGE_LOCAL_PRET = "gym4you-local-storage-ready";

interface ReponseInitialisation {
  mode: "opfs-sahpool" | "indexeddb";
  warning: string | null;
}

let worker: Worker | null = null;
let sequence = 0;
const requetes = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
let initialisation: Promise<ReponseInitialisation> | null = null;
let modeStockage: ReponseInitialisation | null = null;

function obtenirWorker(): Worker {
  if (typeof Worker === "undefined") throw new Error("Les Web Workers ne sont pas disponibles dans ce navigateur.");
  if (worker) return worker;

  const instance = new Worker(new URL("./localDatabase.worker.ts", import.meta.url), { type: "module" });
  instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const attente = requetes.get(response.id);
    if (!attente) return;
    requetes.delete(response.id);
    if (!response.ok) {
      attente.reject(new Error(response.error));
      return;
    }
    if (response.mode) {
      modeStockage = {
        mode: response.mode,
        warning: response.warning ?? null,
      };
      (window as Window & { gym4youStorageWarning?: string }).gym4youStorageWarning =
        modeStockage.warning ?? undefined;
      window.dispatchEvent(new CustomEvent(EVENEMENT_STOCKAGE_LOCAL_PRET, { detail: modeStockage }));
    }
    attente.resolve(response.result);
  };
  instance.onerror = (event) => {
    const erreur = new Error(event.message || "Le Worker de stockage local a échoué.");
    requetes.forEach((attente) => attente.reject(erreur));
    requetes.clear();
  };
  worker = instance;
  return instance;
}

function envoyer<T>(commande: WorkerCommand): Promise<T> {
  const id = `local-${++sequence}`;
  return new Promise<T>((resolve, reject) => {
    requetes.set(id, { resolve: (value) => resolve(value as T), reject });
    try {
      obtenirWorker().postMessage({ ...commande, id } satisfies WorkerRequest);
    } catch (error: unknown) {
      requetes.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function initialiserBaseLocale(): Promise<ReponseInitialisation> {
  if (initialisation) return initialisation;
  initialisation = (async () => {
    if (navigator.storage?.persist) {
      try {
        await navigator.storage.persist();
      } catch (error: unknown) {
        console.error("La conservation permanente du stockage local n’a pas pu être demandée.", error);
      }
    }
    await envoyer<true>({ action: "init" });
    if (!modeStockage) throw new Error("Le moteur de stockage local n’a pas retourné son état.");
    return modeStockage;
  })().catch((error: unknown) => {
    initialisation = null;
    throw error;
  });
  return initialisation;
}

async function assurerInitialisation(): Promise<void> {
  await initialiserBaseLocale();
}

export async function lireTableLocale<T extends LigneLocale>(
  ownerId: string,
  table: TableSynchronisee,
): Promise<T[]> {
  await assurerInitialisation();
  return envoyer<T[]>({ action: "read", ownerId, table });
}

export async function enregistrerLigneLocale(
  ownerId: string,
  table: TableSynchronisee,
  row: LigneLocale,
  operation: OperationOutbox = "upsert",
): Promise<void> {
  await assurerInitialisation();
  await envoyer<true>({ action: "save", ownerId, table, row, operation });
  window.dispatchEvent(new Event(EVENEMENT_DONNEES_LOCALES_MAJ));
}

export async function enregistrerPlusieursLignesLocales(
  ownerId: string,
  items: { table: TableSynchronisee; row: LigneLocale; operation?: OperationOutbox }[],
): Promise<void> {
  await assurerInitialisation();
  await envoyer<true>({
    action: "save-many",
    ownerId,
    items: items.map((item) => ({ ...item, operation: item.operation ?? "upsert" })),
  });
  window.dispatchEvent(new Event(EVENEMENT_DONNEES_LOCALES_MAJ));
}

export async function fusionnerLigneDistante(
  ownerId: string,
  table: TableSynchronisee,
  row: LigneLocale,
): Promise<"local" | "remote"> {
  await assurerInitialisation();
  return envoyer<"local" | "remote">({ action: "merge", ownerId, table, row });
}

export async function lireOutbox(ownerId: string): Promise<EntreeOutbox[]> {
  await assurerInitialisation();
  return envoyer<EntreeOutbox[]>({ action: "outbox", ownerId });
}

export async function compterOutbox(ownerId: string): Promise<number> {
  await assurerInitialisation();
  return envoyer<number>({ action: "pending-count", ownerId });
}

export async function acquitterOutbox(ownerId: string, outboxId: string): Promise<void> {
  await assurerInitialisation();
  await envoyer<true>({ action: "ack", ownerId, outboxId });
}

export async function echouerOutbox(ownerId: string, outboxId: string, error: string): Promise<void> {
  await assurerInitialisation();
  await envoyer<true>({ action: "fail", ownerId, outboxId, error });
}

export async function lireMetaLocale(ownerId: string, key: string): Promise<string | null> {
  await assurerInitialisation();
  return envoyer<string | null>({ action: "meta-get", ownerId, key });
}

export async function ecrireMetaLocale(ownerId: string, key: string, value: string): Promise<void> {
  await assurerInitialisation();
  await envoyer<true>({ action: "meta-set", ownerId, key, value });
}

export async function lireJournalConflits(ownerId: string): Promise<JournalConflit[]> {
  await assurerInitialisation();
  return envoyer<JournalConflit[]>({ action: "logs", ownerId });
}

export async function viderBaseLocale(ownerId: string): Promise<void> {
  await assurerInitialisation();
  await envoyer<true>({ action: "clear", ownerId });
  window.dispatchEvent(new Event(EVENEMENT_DONNEES_LOCALES_MAJ));
}

export async function exporterBaseLocale(ownerId: string): Promise<Uint8Array> {
  await assurerInitialisation();
  return envoyer<Uint8Array>({ action: "backup-export", ownerId });
}

export async function previsualiserRestauration(
  ownerId: string,
  bytes: ArrayBuffer,
): Promise<ApercuSauvegarde> {
  await assurerInitialisation();
  return envoyer<ApercuSauvegarde>({ action: "backup-preview", ownerId, bytes });
}

export async function restaurerBaseLocale(
  ownerId: string,
  token: string,
): Promise<ResultatRestauration> {
  await assurerInitialisation();
  const result = await envoyer<ResultatRestauration>({ action: "backup-restore", ownerId, token });
  window.dispatchEvent(new Event(EVENEMENT_DONNEES_LOCALES_MAJ));
  return result;
}
