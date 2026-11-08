import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth, messageErreur } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { texte } from "../lib/textes";

export function ConnexionPage() {
  const { session, loading, configurationError } = useAuth();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [soumission, setSoumission] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) {
    return <main className="auth-loading" role="status">{texte("verificationConnexion")}</main>;
  }
  if (session) {
    return <Navigate to={destinationApresConnexion(location.state)} replace />;
  }

  async function seConnecter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErreur("");
    if (!supabase) {
      setErreur(configurationError ?? texte("connexionPasPrete"));
      return;
    }

    setSoumission(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: motDePasse,
      });
      if (error) {
        setErreur(messageErreur(error));
        return;
      }

      navigate(destinationApresConnexion(location.state), { replace: true });
    } catch (error: unknown) {
      setErreur(messageErreur(error));
    } finally {
      setSoumission(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="auth-eyebrow">Moularès · Gafsa</p>
        <h1>{texte("titreConnexion")}</h1>
        <p className="auth-description">{texte("connexionDescription")}</p>

        {(configurationError || erreur) && (
          <div className="auth-error" role="alert">
            {erreur || configurationError}
          </div>
        )}

        <form className="auth-form" onSubmit={(event) => void seConnecter(event)}>
          <label htmlFor="email">{texte("connexionEmail")}</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={soumission || Boolean(configurationError)}
          />

          <label htmlFor="password">{texte("connexionMotDePasse")}</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={motDePasse}
            onChange={(event) => setMotDePasse(event.target.value)}
            required
            disabled={soumission || Boolean(configurationError)}
          />

          <button
            className="auth-submit"
            type="submit"
            disabled={soumission || Boolean(configurationError)}
          >
            {soumission ? texte("verificationConnexion") : texte("connexionButton")}
          </button>
        </form>

        <p className="auth-footnote">
          {texte("connexionAucuneCreation")}
        </p>
      </div>
    </main>
  );
}

function destinationApresConnexion(state: unknown): string {
  if (typeof state === "object" && state !== null && "from" in state) {
    const from = state.from;
    if (
      typeof from === "object" &&
      from !== null &&
      "pathname" in from &&
      typeof from.pathname === "string" &&
      from.pathname.startsWith("/") &&
      !from.pathname.startsWith("//") &&
      from.pathname !== "/connexion"
    ) {
      return from.pathname;
    }
  }
  return "/";
}
