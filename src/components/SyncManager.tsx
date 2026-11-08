import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  EVENEMENT_DONNEES_LOCALES_MAJ,
  initialiserBaseLocale,
} from "../lib/localDatabase";
import {
  EVENEMENT_ETAT_SYNCHRONISATION,
  EVENEMENT_SYNCHRONISATION_TERMINEE,
  lireInstantaneSynchronisation,
  synchroniserBaseLocale,
  type InstantaneSynchronisation,
} from "../lib/syncEngine";
import { compterOutbox } from "../lib/localDatabase";

interface SyncContextValue {
  state: InstantaneSynchronisation;
  retry: (force?: boolean) => Promise<void>;
}

const stateInitial: InstantaneSynchronisation = {
  status: navigator.onLine ? "en-ligne" : "hors-ligne",
  pending: 0,
  error: null,
  storageWarning: null,
  lastSync: null,
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncManager({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const [state, setState] = useState(stateInitial);
  const stateRef = useRef(state);
  stateRef.current = state;

  const actualiser = useCallback(async () => {
    if (!ownerId) {
      setState((current) => ({ ...current, pending: 0, error: null }));
      return;
    }
    const storage = await initialiserBaseLocale();
    const snapshot = await lireInstantaneSynchronisation(ownerId, storage.warning ?? null);
    setState((current) => ({ ...snapshot, error: current.error }));
  }, [ownerId]);

  const retry = useCallback(async (force = false) => {
    if (!ownerId || !navigator.onLine) return;
    setState((current) => ({ ...current, status: "synchronisation", error: null }));
    try {
      await synchroniserBaseLocale(ownerId, force);
      const storage = await initialiserBaseLocale();
      const snapshot = await lireInstantaneSynchronisation(ownerId, storage.warning ?? null);
      setState({ ...snapshot, status: "en-ligne", error: null });
    } catch (error: unknown) {
      const storage = await initialiserBaseLocale().catch(() => null);
      const pending = await compterOutbox(ownerId).catch(() => stateRef.current.pending);
      setState({
        status: "erreur",
        pending,
        error: error instanceof Error ? error.message : String(error),
        storageWarning: storage?.warning ?? stateRef.current.storageWarning,
        lastSync: stateRef.current.lastSync,
      });
    }
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    let timer: number | undefined;

    const publier = (next: InstantaneSynchronisation) => {
      if (active) setState(next);
    };
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<InstantaneSynchronisation>).detail;
      if (detail) {
        setState((current) => ({
          ...detail,
          storageWarning: detail.storageWarning ?? current.storageWarning,
        }));
      }
    };
    const onOffline = () => {
      void actualiser().then(() => setState((current) => ({ ...current, status: "hors-ligne" })));
    };
    const onOnline = () => void retry();
    const onLocalChange = () => void actualiser();
    const onComplete = () => {
      void actualiser().then(() => setState((current) => ({ ...current, status: navigator.onLine ? "en-ligne" : "hors-ligne", error: null })));
    };

    window.addEventListener(EVENEMENT_ETAT_SYNCHRONISATION, onState);
    window.addEventListener(EVENEMENT_SYNCHRONISATION_TERMINEE, onComplete);
    window.addEventListener(EVENEMENT_DONNEES_LOCALES_MAJ, onLocalChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    void (async () => {
      try {
        const storage = await initialiserBaseLocale();
        if (!active) return;
        const snapshot = await lireInstantaneSynchronisation(ownerId, storage.warning ?? null);
        publier(snapshot);
        if (navigator.onLine) await retry();
      } catch (error: unknown) {
        if (!active) return;
        setState((current) => ({
          ...current,
          status: "erreur",
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    })();

    timer = window.setInterval(() => {
      if (navigator.onLine) void retry();
    }, 120_000);

    return () => {
      active = false;
      if (timer !== undefined) window.clearInterval(timer);
      window.removeEventListener(EVENEMENT_ETAT_SYNCHRONISATION, onState);
      window.removeEventListener(EVENEMENT_SYNCHRONISATION_TERMINEE, onComplete);
      window.removeEventListener(EVENEMENT_DONNEES_LOCALES_MAJ, onLocalChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [actualiser, ownerId, retry]);

  const value = useMemo(() => ({ state, retry }), [retry, state]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSyncStatus(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSyncStatus doit être utilisé dans SyncManager.");
  return context;
}
