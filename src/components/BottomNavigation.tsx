import { NavLink } from "react-router-dom";
import type { NavigationItem } from "../types";
import type { ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { texte } from "../lib/textes";

const navigationItems: NavigationItem[] = [
  { path: "/", label: texte("navigationAccueil"), icon: "home" },
  { path: "/membres", label: texte("navigationMembres"), icon: "members" },
  { path: "/abonnements", label: texte("navigationAbonnements"), icon: "subscriptions" },
  { path: "/rentabilite", label: texte("navigationBenefice"), icon: "profitability" },
];

const prechargerPage: Partial<Record<string, () => Promise<unknown>>> = {
  "/": () => import("../pages/AccueilPage"),
  "/membres": () => import("../pages/MembresPage"),
  "/abonnements": () => import("../pages/AbonnementsPage"),
  "/rentabilite": () => import("../pages/RentabilitePage"),
};

export function BottomNavigation() {
  const { access } = useAuth();
  const visibleItems = access?.role === "assistant"
    ? navigationItems.filter((item) => item.path !== "/rentabilite")
    : navigationItems;

  return (
    <nav className="bottom-navigation" aria-label="Navigation principale">
      {visibleItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === "/"}
          className={({ isActive }) =>
            `navigation-link${isActive ? " navigation-link-active" : ""}`
          }
          aria-label={item.label}
          onPointerEnter={() => void prechargerPage[item.path]?.()}
          onFocus={() => void prechargerPage[item.path]?.()}
        >
          <NavigationIcon icon={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function NavigationIcon({ icon }: { icon: NavigationItem["icon"] }) {
  const paths: Record<NavigationItem["icon"], ReactNode> = {
    home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
    members: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 5a3.5 3.5 0 0 1 0 7m2 2c2 .7 3 2.5 3 5" />
      </>
    ),
    subscriptions: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4m8-4v4" />
      </>
    ),
    profitability: <path d="M4 19V9m6 10V5m6 14v-7m6 7H2" />,
  };

  return (
    <svg
      className="navigation-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[icon]}
    </svg>
  );
}
