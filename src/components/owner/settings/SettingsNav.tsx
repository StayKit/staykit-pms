"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";

/** The Settings left sub-nav. Each item is a real route so deep-links + back work. */
export const SETTINGS_NAV = [
  { href: "/settings/property", label: "Property", icon: "map-pin" },
  { href: "/settings/integrations", label: "Integrations", icon: "sparkles" },
  { href: "/settings/team", label: "Team & roles", icon: "users" },
  { href: "/settings/notifications", label: "Notifications", icon: "bell" },
  { href: "/settings/legal", label: "Legal & DPDP", icon: "shield" },
  { href: "/settings/account", label: "Account", icon: "user" },
] as const;

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav aria-label="Settings sections">
      {SETTINGS_NAV.map((s) => {
        const active = path === s.href || path.startsWith(s.href + "/");
        return (
          <Link
            key={s.href}
            href={s.href}
            className={"nav-item " + (active ? "active" : "")}
            style={{ width: "100%" }}
          >
            <Icon name={s.icon} className="icon" />
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
