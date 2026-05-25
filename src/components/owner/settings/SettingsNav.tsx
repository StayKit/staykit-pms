"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { can, type Role, type Permission } from "@/lib/rbac/policy";

/** The Settings left sub-nav. Each item is a real route so deep-links + back work.
 * `perm`, when set, hides the item from roles that lack it (audit P2 #24). */
export const SETTINGS_NAV: {
  href: string;
  label: string;
  icon: string;
  perm?: Permission;
}[] = [
  { href: "/settings/property", label: "Property", icon: "map-pin", perm: "properties:write" },
  { href: "/settings/integrations", label: "Integrations", icon: "sparkles", perm: "team:manage" },
  { href: "/settings/team", label: "Team & roles", icon: "users", perm: "team:manage" },
  {
    href: "/settings/notifications",
    label: "Notifications",
    icon: "bell",
    perm: "notifications:read",
  },
  { href: "/settings/legal", label: "Legal & DPDP", icon: "shield" },
  { href: "/settings/account", label: "Account", icon: "user" },
];

export function SettingsNav({ role }: Readonly<{ role: Role }>) {
  const path = usePathname();
  return (
    <nav aria-label="Settings sections">
      {SETTINGS_NAV.filter((s) => !s.perm || can(role, s.perm)).map((s) => {
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
