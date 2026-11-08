import { supabase } from "./supabase";

const NOM_BASE = "moulares-offline";
const VERSION_BASE = 1;
const MAGASIN_CACHE = "snapshots";
const MAGASIN_PAIEMENTS = "pending-payments";
export const EVENEMENT_FILE_PAIEMENTS = "moulares-pending-payments-changed";
export const EVENEMENT_PAIEMENTS_SYNCHRONISES = "moulares-payments-synced";
export const EVENEMENT_CACHE_HORS_LIGNE = "moulares-offline-cache-used";
export const EVENEMENT_CACHE_ACTUALISE = "moulares-offline-cache-refreshed";

interface EnregistrementCache {
  key: string;
  userId: string;
  data: unknown;
  updatedAt: string;
}

export interface InstantaneCache<T> {
  data: T;
  updatedAt: string;
}

export interface PaiementEnAttente {
  requestId: string;
  userId: string;
  queuedAt: string;
  member_id: string;
  subscription_id: string;
  amount: number;
  method: "especes" | "virement" | "autre";
  paid_at: string;
  renew_on_payment: boolean;
  renewal_price: number | null;
}

export async function utilisateurConnecteId(): Promise<string> {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Votre session a expiré. Reconnectez-vous pour charger les données.");
  return userId;
}

function ouvrirBase(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("Le stockage hors connexion n’est pas disponible sur cet appareil."));
  }

  return new Promise((resolve, reject) => {
    const demande = indexedDB.open(NOM_BASE, VERSION_BASE);
    demande.onupgradeneeded = () => {
      const base = demande.result;
      if (!base.objectStoreNames.contains(MAGASIN_CACHE)) {
        base.createObjectStore(MAGASIN_CACHE, { keyPath: "key" });
      }
      if (!base.objectStoreNames.contains(MAGASIN_PAIEMENTS)) {
        base.createObjectStore(MAGASIN_PAIEMENTS, { keyPath: "requestId" });
      }
    };
    demande.onsuccess = () => resolve(demande.result);
    demande.onerror = () => reject(demande.error ?? new Error("Impossible d’ouvrir le stockage hors connexion."));
    demande.onblocked = () => reject(new Error("Le stockage hors connexion est bloqué par un autre onglet."));
  });
}

async function operationMagasin<T>(
  magasin: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const base = await ouvrirBase();
  return new Promise((resolve, reject) => {
    const transaction = base.transaction(magasin, mode);
    const demande = operation(transaction.objectStore(magasin));
    let resultat!: T;
    demande.onsuccess = () => {
      resultat = demande.result;
    };
    demande.onerror = () => reject(demande.error ?? new Error("Échec du stockage hors connexion."));
    transaction.onabort = () => {
      base.close();
      reject(transaction.error ?? new Error("Transaction de stockage interrompue."));
    };
    transaction.oncomplete = () => {
      base.close();
      resolve(resultat);
    };
    transaction.onerror = () => {
      base.close();
      reject(transaction.error ?? new Error("Échec de la transaction de stockage."));
    };
  });
}

function cleCache(userId: string, key: string): string {
  return `${userId}:${key}`;
}

export async function lireInstantane<T>(userId: string, key: string): Promise<InstantaneCache<T> | null> {
  const record = await operationMagasin<EnregistrementCache | undefined>(
    MAGASIN_CACHE,
    "readonly",
    (store) => store.get(cleCache(userId, key)),
  );
  if (!record || record.userId !== userId || !record.updatedAt) return null;
  return { data: record.data as T, updatedAt: record.updatedAt };
}

export async function enregistrerInstantane<T>(userId: string, key: string, data: T): Promise<void> {
  const record: EnregistrementCache = {
    key: cleCache(userId, key),
    userId,
    data,
    updatedAt: new Date().toISOString(),
  };
  await operationMagasin<IDBValidKey>(
    MAGASIN_CACHE,
    "readwrite",
    (store) => store.put(record),
  );
}

export async function supprimerInstantanesUtilisateur(userId: string): Promise<void> {
  const base = await ouvrirBase();
  await new Promise<void>((resolve, reject) => {
    const transaction = base.transaction(MAGASIN_CACHE, "readwrite");
    const store = transaction.objectStore(MAGASIN_CACHE);
    const demande = store.openCursor();
    demande.onsuccess = () => {
      const curseur = demande.result;
      if (!curseur) return;
      const record = curseur.value as EnregistrementCache;
      if (record.userId === userId) curseur.delete();
      curseur.continue();
    };
    demande.onerror = () => reject(demande.error ?? new Error("Impossible d’effacer les données hors connexion."));
    transaction.oncomplete = () => {
      base.close();
      resolve();
    };
    transaction.onerror = () => {
      base.close();
      reject(transaction.error ?? new Error("Échec de l’effacement des données hors connexion."));
    };
    transaction.onabort = () => {
      base.close();
      reject(transaction.error ?? new Error("Effacement des données hors connexion interrompu."));
    };
  });
}

export function estErreurReseau(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "";
  return /failed to fetch|fetch failed|network|offline|connection|load failed/i.test(message);
}

export async function chargerAvecCache<T>(
  userId: string,
  key: string,
  charger: () => Promise<T>,
): Promise<{ data: T; depuisCache: boolean }> {
  let instantane: InstantaneCache<T> | null = null;
  try {
    instantane = await lireInstantane<T>(userId, key);
  } catch (error: unknown) {
    console.error("Impossible de lire la copie locale des données.", error);
  }
  if (!navigator.onLine) {
    if (instantane) {
      window.dispatchEvent(new CustomEvent(EVENEMENT_CACHE_HORS_LIGNE, { detail: instantane.updatedAt }));
      return { data: instantane.data, depuisCache: true };
    }
    throw new Error("Aucune donnée enregistrée sur cet appareil. Reconnectez-vous pour charger les données.");
  }

  try {
    const data = await charger();
    try {
      await enregistrerInstantane(userId, key, data);
      window.dispatchEvent(new Event(EVENEMENT_CACHE_ACTUALISE));
    } catch (error: unknown) {
      console.error("Impossible de conserver une copie hors connexion des données.", error);
    }
    return { data, depuisCache: false };
  } catch (error: unknown) {
    if (estErreurReseau(error) && instantane) {
      window.dispatchEvent(new CustomEvent(EVENEMENT_CACHE_HORS_LIGNE, { detail: instantane.updatedAt }));
      return { data: instantane.data, depuisCache: true };
    }
    throw error;
  }
}

export async function ajouterPaiementEnAttente(paiement: PaiementEnAttente): Promise<void> {
  await operationMagasin<IDBValidKey>(
    MAGASIN_PAIEMENTS,
    "readwrite",
    (store) => store.put(paiement),
  );
  window.dispatchEvent(new Event(EVENEMENT_FILE_PAIEMENTS));
}

export async function lirePaiementsEnAttente(userId: string): Promise<PaiementEnAttente[]> {
  const paiements = await operationMagasin<PaiementEnAttente[]>(
    MAGASIN_PAIEMENTS,
    "readonly",
    (store) => store.getAll(),
  );
  return paiements.filter((paiement) => paiement.userId === userId);
}

export async function retirerPaiementEnAttente(requestId: string): Promise<void> {
  await operationMagasin<undefined>(
    MAGASIN_PAIEMENTS,
    "readwrite",
    (store) => store.delete(requestId),
  );
  window.dispatchEvent(new Event(EVENEMENT_FILE_PAIEMENTS));
}

export async function viderPaiementsEnAttente(userId: string): Promise<void> {
  const base = await ouvrirBase();
  await new Promise<void>((resolve, reject) => {
    const transaction = base.transaction(MAGASIN_PAIEMENTS, "readwrite");
    const demande = transaction.objectStore(MAGASIN_PAIEMENTS).openCursor();
    demande.onsuccess = () => {
      const curseur = demande.result;
      if (!curseur) return;
      const paiement = curseur.value as PaiementEnAttente;
      if (paiement.userId === userId) curseur.delete();
      curseur.continue();
    };
    demande.onerror = () => reject(demande.error ?? new Error("Impossible de vider la file hors connexion."));
    transaction.oncomplete = () => {
      base.close();
      resolve();
    };
    transaction.onerror = () => {
      base.close();
      reject(transaction.error ?? new Error("Échec du vidage de la file hors connexion."));
    };
    transaction.onabort = () => {
      base.close();
      reject(transaction.error ?? new Error("Vidage de la file hors connexion interrompu."));
    };
  });
  window.dispatchEvent(new Event(EVENEMENT_FILE_PAIEMENTS));
}
