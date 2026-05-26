import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({ pathname: "/dashboard", search: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: state.push }),
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={String(href)} {...p}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/actions/bookings", () => ({ createBookingAction: vi.fn() }));
vi.mock("@/lib/actions/property", () => ({ setActivePropertyAction: vi.fn() }));
vi.mock("@/lib/actions/booking-detail", () => ({
  fetchBookingDetailAction: vi.fn(async () => ({ ok: false, message: "stub" })),
}));

import { OwnerShell } from "./OwnerShell";

const props = {
  user: { name: "Priya R.", role: "OWNER" },
  property: { id: "p1", name: "Coorg Coffee Cottage" },
  properties: [
    { id: "p1", name: "Coorg Coffee Cottage" },
    { id: "p2", name: "Backwaters Verandah" },
  ],
  rooms: [{ id: "r1", label: "101 — Hibiscus (Deluxe)", baseRateRupees: 6300 }],
  channels: [{ key: "direct", name: "Direct" }],
  demo: true,
};

beforeEach(() => {
  state.pathname = "/dashboard";
  state.search = "";
});

describe("OwnerShell", () => {
  it("renders the brand, property, nav and the signed-in user", () => {
    render(<OwnerShell {...props}>content</OwnerShell>);
    expect(screen.getByText("Coorg Coffee Cottage")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Dashboard/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /MCP for Claude/ })).toBeTruthy();
    expect(screen.getByText("PR")).toBeTruthy(); // initials
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("marks the nav item for the current path active", () => {
    state.pathname = "/calendar";
    render(<OwnerShell {...props}>x</OwnerShell>);
    expect(screen.getByRole("link", { name: /Calendar/ }).className).toContain("active");
    expect(screen.getByRole("link", { name: /Dashboard/ }).className).not.toContain("active");
  });

  it("shows the demo banner only in demo mode", () => {
    const { rerender } = render(<OwnerShell {...props}>x</OwnerShell>);
    expect(screen.getByText(/Demo mode/)).toBeTruthy();
    rerender(
      <OwnerShell {...props} demo={false}>
        x
      </OwnerShell>,
    );
    expect(screen.queryByText(/Demo mode/)).toBeNull();
  });

  it("renders the page title from the path", () => {
    render(<OwnerShell {...props}>x</OwnerShell>);
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
  });
});
