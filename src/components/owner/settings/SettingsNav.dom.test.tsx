import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({ pathname: "/settings/property" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={String(href)} {...p}>
      {children}
    </a>
  ),
}));

import { SettingsNav } from "./SettingsNav";

beforeEach(() => {
  state.pathname = "/settings/property";
});

describe("SettingsNav", () => {
  it("renders a link for every section", () => {
    render(<SettingsNav />);
    expect(screen.getByRole("link", { name: /Property/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Integrations/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Team & roles/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Account/ })).toBeTruthy();
  });

  it("marks only the active route", () => {
    state.pathname = "/settings/team";
    render(<SettingsNav />);
    expect(screen.getByRole("link", { name: /Team & roles/ }).className).toContain("active");
    expect(screen.getByRole("link", { name: /Property/ }).className).not.toContain("active");
  });

  it("treats nested routes under a section as active", () => {
    state.pathname = "/settings/property/details";
    render(<SettingsNav />);
    expect(screen.getByRole("link", { name: /Property/ }).className).toContain("active");
  });
});
