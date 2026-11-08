import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

const rappelRedemarrage = "Redémarrez npm run dev après avoir modifié .env.";

function verifierConfiguration(): string | null {
  if (!url || !anonKey) {
    const manquantes = [
      !url && "VITE_SUPABASE_URL",
      !anonKey && "VITE_SUPABASE_ANON_KEY",
    ].filter(Boolean);
    return `Configuration Supabase incomplète : variable absente ou vide (${manquantes.join(", ")}). ${rappelRedemarrage}`;
  }

  if (!/^https:\/\/[^/]+\.supabase\.co\/?$/i.test(url)) {
    return `URL Supabase invalide : elle doit commencer par https:// et finir par .supabase.co. ${rappelRedemarrage}`;
  }

  if (
    /^sb_secret_/i.test(anonKey)
    || /service_role/i.test(anonKey)
    || (() => {
      try {
        const charge = anonKey.split(".")[1];
        if (!charge) return false;
        const payload = JSON.parse(atob(charge.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: unknown };
        return payload.role === "service_role";
      } catch {
        return false;
      }
    })()
  ) {
    return `Clé Supabase dangereuse : cette clé semble être une service_role. Ne l’utilisez jamais dans l’application ; remplacez-la par la clé publique anon. ${rappelRedemarrage}`;
  }

  return null;
}

export const supabaseConfigurationError = verifierConfiguration();

export const supabase = !supabaseConfigurationError
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
