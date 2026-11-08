import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { BottomNavigation } from "./components/BottomNavigation";
import { ActionsRapides } from "./components/ActionsRapides";
import { PwaControls } from "./components/PwaControls";
import { useSyncStatus } from "./components/SyncManager";
import { useAuth } from "./hooks/useAuth";
import { appliquerLangueInterface, getLangueInterface, texte } from "./lib/textes";

const AbonnementsPage = lazy(() => import("./pages/AbonnementsPage").then(({ AbonnementsPage: page }) => ({ default: page })));
const AidePage = lazy(() => import("./pages/AidePage").then(({ AidePage: page }) => ({ default: page })));
const AccueilPage = lazy(() => import("./pages/AccueilPage").then(({ AccueilPage: page }) => ({ default: page })));
const ConnexionPage = lazy(() => import("./pages/ConnexionPage").then(({ ConnexionPage: page }) => ({ default: page })));
const MembresPage = lazy(() => import("./pages/MembresPage").then(({ MembresPage: page }) => ({ default: page })));
const ReglagesPage = lazy(() => import("./pages/ReglagesPage").then(({ ReglagesPage: page }) => ({ default: page })));
const RentabilitePage = lazy(() => import("./pages/RentabilitePage").then(({ RentabilitePage: page }) => ({ default: page })));

function PageEnChargement() {
  return <main className="auth-loading" role="status">Chargement de la page…</main>;
}

function AppLayout() {
  const { session, access, loading } = useAuth();
  const { state: syncState } = useSyncStatus();
  const location = useLocation();
  const langue = getLangueInterface();
  useEffect(() => {
    appliquerLangueInterface(langue);
  }, [langue]);
  const afficherNavigation = location.pathname !== "/connexion" && Boolean(session) && Boolean(access);
  const afficherReglages = access?.role === "gerant";

  return (
    <div className="app-shell">
      <PwaControls />
      {afficherNavigation && (
        <header className="app-header">
          <strong>Gym4You</strong>
          <div className="app-header-actions">
            <span className={`connection-indicator ${syncState.status === "hors-ligne" || syncState.status === "erreur" ? "connection-indicator-alert" : "connection-indicator-ok"}`} aria-live="polite">
              <span className="connection-dot" aria-hidden="true" />
              {syncState.status === "hors-ligne" || syncState.status === "erreur" ? syncState.status === "hors-ligne" ? texte("etatHorsConnexion") : texte("etatErreur") : texte("etatEnLigne")}
            </span>
            <Link className="help-link" to="/aide">{texte("navigationAide")}</Link>
            {afficherReglages && <Link
              className="settings-link"
              to="/reglages"
              aria-label={texte("navigationReglages")}
              onPointerEnter={() => void import("./pages/ReglagesPage")}
              onFocus={() => void import("./pages/ReglagesPage")}
            >
              {texte("navigationReglages")}
            </Link>}
          </div>
        </header>
      )}
      <Outlet />
      {afficherNavigation && <ActionsRapides />}
      {afficherNavigation && <BottomNavigation />}
      {loading && !session && location.pathname !== "/connexion" && (
        <div className="route-loading" role="status">Vérification de la session…</div>
      )}
    </div>
  );
}

function ProtectedRoutes() {
  const { session, loading, access, accessLoading, accessError } = useAuth();
  const location = useLocation();

  if (loading) {
    return <main className="auth-loading" role="status">Vérification de la session…</main>;
  }
  if (!session) {
    return <Navigate to="/connexion" replace state={{ from: location }} />;
  }
  if (accessLoading) {
    return <main className="auth-loading" role="status">Vérification de l’accès à la salle…</main>;
  }
  if (accessError || !access) {
    return <main className="auth-loading" role="alert">{accessError ?? "Accès à la salle indisponible."}</main>;
  }
  if (access.role === "assistant" && ["/reglages", "/rentabilite"].includes(location.pathname)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="connexion" element={<Suspense fallback={<PageEnChargement />}><ConnexionPage /></Suspense>} />
          <Route element={<ProtectedRoutes />}>
            <Route index element={<Suspense fallback={<PageEnChargement />}><AccueilPage /></Suspense>} />
            <Route path="membres" element={<Suspense fallback={<PageEnChargement />}><MembresPage /></Suspense>} />
            <Route path="abonnements" element={<Suspense fallback={<PageEnChargement />}><AbonnementsPage /></Suspense>} />
            <Route path="rentabilite" element={<Suspense fallback={<PageEnChargement />}><RentabilitePage /></Suspense>} />
            <Route path="reglages" element={<Suspense fallback={<PageEnChargement />}><ReglagesPage /></Suspense>} />
            <Route path="aide" element={<Suspense fallback={<PageEnChargement />}><AidePage /></Suspense>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
