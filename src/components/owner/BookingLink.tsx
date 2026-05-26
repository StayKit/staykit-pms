"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useBookingSidebarOptional } from "./BookingSidebar";

/**
 * Click target for a booking. Renders an anchor at /bookings/{id} (so middle/Ctrl
 * click still opens it in a new tab and the URL is shareable), but a plain click
 * opens the global sidebar so the user stays on the current page.
 */
export function BookingLink({
  id,
  className,
  style,
  children,
  title,
}: Readonly<{
  id: string;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
  title?: string;
}>) {
  const sidebar = useBookingSidebarOptional();

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    // Let modifier-clicks (new tab/window, download, save) go through as a normal link.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
    // No provider mounted (tests, future non-owner contexts) → fall through to the route.
    if (!sidebar) return;
    e.preventDefault();
    sidebar.openBooking(id);
  }

  return (
    <Link
      href={`/bookings/${id}`}
      className={className}
      style={style}
      title={title}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
