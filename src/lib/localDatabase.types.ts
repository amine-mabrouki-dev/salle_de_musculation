export const TABLES_SYNCHRONISEES = [
  "sections",
  "tariffs",
  "members",
  "subscriptions",
  "payments",
  "expenses",
  "payment_cancellations",
  "expense_cancellations",
] as const;

export type TableSynchronisee = (typeof TABLES_SYNCHRONISEES)[number];
export type OperationOutbox = "upsert" | "delete";

export interface LigneLocale {
  id: string;
  updated_at: string;
  deleted_at: string | null;
  gym_id?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

export interface EntreeOutbox {
  id: string;
  owner_id: string;
  entity_id: string;
  table_name: TableSynchronisee;
  operation: OperationOutbox;
  payload: LigneLocale;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

export interface JournalConflit {
  id: string;
  table_name: TableSynchronisee;
  entity_id: string;
  local_updated_at: string;
  remote_updated_at: string;
  winner: "local" | "remote";
  recorded_at: string;
}

export interface ApercuSauvegarde {
  token: string;
  membres: number;
  paiements: number;
  derniereDate: string | null;
}

export interface ResultatRestauration {
  ajouts: number;
  conserves: number;
}

export type WorkerRequest =
  | { id: string; action: "init" }
  | { id: string; action: "read"; ownerId: string; table: TableSynchronisee }
  | { id: string; action: "save"; ownerId: string; table: TableSynchronisee; row: LigneLocale; operation: OperationOutbox }
  | { id: string; action: "save-many"; ownerId: string; items: { table: TableSynchronisee; row: LigneLocale; operation: OperationOutbox }[] }
  | { id: string; action: "merge"; ownerId: string; table: TableSynchronisee; row: LigneLocale }
  | { id: string; action: "outbox"; ownerId: string }
  | { id: string; action: "ack"; ownerId: string; outboxId: string }
  | { id: string; action: "fail"; ownerId: string; outboxId: string; error: string }
  | { id: string; action: "pending-count"; ownerId: string }
  | { id: string; action: "meta-get"; ownerId: string; key: string }
  | { id: string; action: "meta-set"; ownerId: string; key: string; value: string }
  | { id: string; action: "logs"; ownerId: string }
  | { id: string; action: "clear"; ownerId: string }
  | { id: string; action: "backup-export"; ownerId: string }
  | { id: string; action: "backup-preview"; ownerId: string; bytes: ArrayBuffer }
  | { id: string; action: "backup-restore"; ownerId: string; token: string };

export type WorkerResponse =
  | { id: string; ok: true; result: unknown; mode?: "opfs-sahpool" | "indexeddb"; warning?: string }
  | { id: string; ok: false; error: string };

export type WorkerCommand = WorkerRequest extends infer Request
  ? Request extends { id: string }
    ? Omit<Request, "id">
    : never
  : never;
