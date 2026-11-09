import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { chargerAccesSalle, type AccesSalle } from "../lib/gymAccess";
import { texte } from "../lib/textes";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  configurationError: string | null;
  access: AccesSalle | null;
  accessLoading: boolean;
  accessError: string | null;
  retryAccess: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [access, setAccess] = useState<AccesSalle | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessAttempt, setAccessAttempt] = useState(0);
  const sessionRef = useRef<Session | null>(null);
  const authEventReceived = useRef(false);
  useEffect(() => {
    if (!supabase) {
      setConfigurationError(texte("connexionPasPrete"));
      setLoading(false);
      return;
    }

    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!active) return;
      authEventReceived.current = true;
      const userChanged = sessionRef.current?.user.id !== currentSession?.user.id;
      sessionRef.current = currentSession;
      setSession(currentSession);
      if (userChanged) {
        setAccess(null);
        setAccessError(null);
        setAccessLoading(Boolean(currentSession));
      }
      setConfigurationError(null);
      setLoading(false);
    });

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || authEventReceived.current) return;
        if (error) {
          setConfigurationError(messageErreur(error));
        } else {
          const userChanged = sessionRef.current?.user.id !== data.session?.user.id;
          sessionRef.current = data.session;
          setSession(data.session);
          if (userChanged) {
            setAccess(null);
            setAccessError(null);
            setAccessLoading(Boolean(data.session));
          }
          setConfigurationError(null);
        }
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!active || authEventReceived.current) return;
        setConfigurationError(messageErreur(error));
        setLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) {
      setAccess(null);
      setAccessError(null);
      setAccessLoading(false);
      return;
    }
    let active = true;
    setAccessLoading(true);
    setAccessError(null);
    void chargerAccesSalle(userId).then((value) => {
      if (active) setAccess(value);
    }).catch((error: unknown) => {
      if (active) {
        setAccess(null);
        setAccessError(messageErreur(error));
      }
    }).finally(() => {
      if (active) setAccessLoading(false);
    });
    return () => { active = false; };
  }, [session?.user.id, accessAttempt]);

  const retryAccess = useCallback(() => setAccessAttempt((attempt) => attempt + 1), []);

  const value = useMemo(
    () => ({ session, loading, configurationError, access, accessLoading, accessError, retryAccess }),
    [session, loading, configurationError, access, accessLoading, accessError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé dans AuthProvider.");
  }
  return context;
}

function estErreurTableManquante(message: string): boolean {
  return /could not find the table|relation .* does not exist|does not exist|not found/i.test(message)
    && /gym_memberships|member_history|members|subscriptions|payments|expenses|sections|tariffs|gyms/i.test(message);
}

export function messageErreur(erreur: unknown): string {
  const message =
    typeof erreur === "string"
      ? erreur
      : erreur instanceof Error
      ? erreur.message
      : typeof erreur === "object" && erreur !== null && "message" in erreur
        ? String(erreur.message)
        : "";

  if (/failed to fetch|fetch failed|networkerror|load failed/i.test(message)) {
    return navigator.onLine
      ? texte("erreurGenerique")
      : texte("aucunReseau");
  }
  if (/invalid login credentials/i.test(message)) {
    return "Adresse e-mail ou mot de passe incorrect.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Cette adresse e-mail n’a pas encore été confirmée. Contactez le gérant de l’application.";
  }
  if (/too many requests/i.test(message)) {
    return "Trop de tentatives de connexion. Veuillez patienter avant de réessayer.";
  }
  if (/column subscription_status\.renew_on_payment does not exist/i.test(message)) {
    return texte("miseAJourRequise");
  }
  if (estErreurTableManquante(message)) {
    return "La base de données de la salle n’est pas encore prête. Demandez au responsable d’appliquer la mise à jour de la base.";
  }
  if (!message || /supabase|postgres|sql|rls|policy|column|constraint|uuid|http|error code|failed|database|relation|permission denied|duplicate key|violates|invalid input syntax/i.test(message)) {
    return navigator.onLine ? texte("erreurGenerique") : texte("aucunReseau");
  }
  return message;
}
