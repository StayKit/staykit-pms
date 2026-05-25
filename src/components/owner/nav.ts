export interface NavEntry {
  href: string;
  label: string;
  icon: string;
  section: "workspace" | "advanced";
  badge?: number;
}

export const NAV: NavEntry[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home", section: "workspace" },
  { href: "/overview", label: "Overview", icon: "bar-chart", section: "workspace" },
  { href: "/calendar", label: "Calendar", icon: "calendar", section: "workspace" },
  { href: "/bookings", label: "Bookings", icon: "book", section: "workspace" },
  { href: "/guests", label: "Guests", icon: "users", section: "workspace" },
  { href: "/notifications", label: "Notifications", icon: "bell", section: "workspace" },
  { href: "/reports", label: "Reports", icon: "bar-chart", section: "workspace" },
  { href: "/properties", label: "Properties", icon: "home", section: "advanced" },
  { href: "/channels", label: "Channels", icon: "tag", section: "advanced" },
  { href: "/assistant", label: "MCP for Claude", icon: "sparkles", section: "advanced" },
  { href: "/settings", label: "Settings", icon: "settings", section: "advanced" },
  { href: "/onboarding", label: "Setup guide", icon: "info", section: "advanced" },
];

export const TITLES: Record<string, { h: string; s: string }> = {
  "/dashboard": { h: "Dashboard", s: "Today at a glance" },
  "/overview": { h: "Overview", s: "All properties at a glance" },
  "/calendar": { h: "Calendar", s: "Tape chart" },
  "/bookings": { h: "Bookings", s: "Filterable list" },
  "/guests": { h: "Guests", s: "Address book" },
  "/notifications": { h: "Notifications", s: "Templates & automations" },
  "/reports": { h: "Reports", s: "Occupancy, revenue & GST" },
  "/properties": { h: "Properties", s: "Rooms, rates & inventory" },
  "/channels": { h: "Channels", s: "Booking source attribution" },
  "/assistant": { h: "MCP for Claude.ai", s: "AI assistant settings" },
  "/settings": { h: "Settings", s: "Workspace & integrations" },
};

export function titleForPath(path: string): { h: string; s: string } {
  if (path.startsWith("/bookings/")) return { h: "Booking", s: "Detail" };
  const key = Object.keys(TITLES).find((k) => path === k || path.startsWith(k + "/"));
  return key ? TITLES[key] : { h: "StayKit", s: "" };
}
