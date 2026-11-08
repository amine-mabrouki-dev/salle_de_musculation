import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const methodesSupabase = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;

export default defineConfig({
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@supabase/")) return "supabase";
          if (id.includes("node_modules/react-router") || id.includes("node_modules/@remix-run/")) {
            return "router";
          }
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "react";
          }
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["fond-salle.jpg", "icon.svg", "apple-touch-icon.png"],
      workbox: {
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        globPatterns: ["**/*.{html,js,css,wasm,ico,png,svg,jpg,jpeg,webp,woff,woff2,ttf,otf}"],
        runtimeCaching: methodesSupabase.map((method) => ({
          urlPattern: ({ url }: { url: URL }) =>
            url.hostname === "supabase.co" || url.hostname.endsWith(".supabase.co"),
          method,
          handler: "NetworkOnly" as const,
          options: {
            fetchOptions: { cache: "no-store" as const },
          },
        })),
      },
      manifest: {
        name: "Gym4You",
        short_name: "Gym4You",
        description: "Application de gestion de la salle de sport de Moularès.",
        lang: "fr-TN",
        dir: "ltr",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0e141b",
        theme_color: "#0e141b",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
