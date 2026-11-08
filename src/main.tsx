import React from "react";
import ReactDOM from "react-dom/client";
import { AppRouter } from "./router";
import { AppBackground } from "./components/AppBackground";
import { SyncManager } from "./components/SyncManager";
import { AuthProvider } from "./hooks/useAuth";
import { enregistrerServiceWorker } from "./lib/serviceWorker";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <SyncManager>
        <AppBackground />
        <AppRouter />
      </SyncManager>
    </AuthProvider>
  </React.StrictMode>,
);

enregistrerServiceWorker();
