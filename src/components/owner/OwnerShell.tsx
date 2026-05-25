"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { NAV, titleForPath } from "./nav";
import { QuickAdd, type QuickAddChannel, type QuickAddRoom } from "./QuickAdd";
import { PropertySwitcher } from "./PropertySwitcher";
import type { PropertyOption } from "@/lib/property/active";

export function OwnerShell({
  children,
  user,
  property,
  properties = [],
  rooms,
  channels,
  demo,
  onlineEnabled = false,
}: {
  children: React.ReactNode;
  user: { name: string; role: string };
  property: { id: string; name: string };
  properties?: PropertyOption[];
  rooms: QuickAddRoom[];
  channels: QuickAddChannel[];
  demo: boolean;
  onlineEnabled?: boolean;
}) {
  const path = usePathname();
  const title = titleForPath(path);
  const workspace = NAV.filter((n) => n.section === "workspace");
  const advanced = NAV.filter((n) => n.section === "advanced");
  // The topbar lives only on the Dashboard; every other page carries its own heading, so elsewhere
  // it would just duplicate the nav. Those pages get a floating "New booking" button instead.
  const showTopbar = path === "/dashboard";
  const switcherList = properties.length ? properties : [property];

  const navItem = (n: (typeof NAV)[number]) => {
    const active = path === n.href || path.startsWith(n.href + "/");
    return (
      <Link key={n.href} href={n.href} className={"nav-item " + (active ? "active" : "")}>
        <Icon name={n.icon} className="icon" />
        <span>{n.label}</span>
      </Link>
    );
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="mark">S</div>
          <div>
            <div className="name">StayKit</div>
            <div className="sub">Open-source PMS</div>
          </div>
        </div>

        <PropertySwitcher activeId={property.id} properties={switcherList} />

        <div className="nav-section">Workspace</div>
        {workspace.map(navItem)}

        <div className="nav-section">Advanced</div>
        {advanced.map(navItem)}

        <div className="sidebar-user">
          <div className="avatar">
            {user.name
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0])
              .join("")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 550 }}>{user.name}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", textTransform: "capitalize" }}>
              {user.role.toLowerCase()}
            </div>
          </div>
          <Link className="icon-btn" href="/signin" title="Sign in / out">
            <Icon name="log-out" className="icon-sm" />
          </Link>
        </div>
      </aside>

      <main className="main">
        {demo && (
          <div className="demo-banner">
            Demo mode — browsing as {user.name}. Sign in from the bottom-left to use real sessions.
          </div>
        )}
        {showTopbar && (
          <header className="topbar">
            <div>
              <h1>{title.h}</h1>
              <div className="sub">{title.s}</div>
            </div>
            <div className="topbar-actions">
              <div className="search" style={{ width: 280 }}>
                <Icon name="search" className="icon" />
                <input placeholder="Search bookings, guests…" />
              </div>
              <button className="icon-btn" title="Notifications">
                <Icon name="bell" className="icon-sm" />
              </button>
              <Link className="btn btn-primary" href="?new=1">
                <Icon name="plus" className="icon-sm" />
                New booking
              </Link>
            </div>
          </header>
        )}

        {children}
      </main>

      {!showTopbar && (
        <Link className="fab" href="?new=1" title="New booking" aria-label="New booking">
          <span className="fab-label">New booking</span>
          <Icon name="plus" className="icon" />
        </Link>
      )}

      <QuickAdd
        propertyId={property.id}
        rooms={rooms}
        channels={channels}
        onlineEnabled={onlineEnabled}
      />
    </div>
  );
}
