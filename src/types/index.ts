export type NavigationIcon = "home" | "members" | "subscriptions" | "profitability";

export interface NavigationItem {
  path: string;
  label: string;
  icon: NavigationIcon;
}
