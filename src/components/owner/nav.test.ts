import { describe, it, expect } from "vitest";
import { NAV, TITLES, titleForPath } from "./nav";

describe("nav config", () => {
  it("groups items into workspace and advanced sections", () => {
    expect(NAV.some((n) => n.section === "workspace")).toBe(true);
    expect(NAV.some((n) => n.section === "advanced")).toBe(true);
    expect(NAV.find((n) => n.href === "/assistant")?.label).toBe("MCP for Claude");
  });
});

describe("titleForPath", () => {
  it("returns the configured title for a known top-level path", () => {
    expect(titleForPath("/dashboard")).toEqual(TITLES["/dashboard"]);
  });
  it("matches nested paths under a section", () => {
    expect(titleForPath("/calendar/anything")).toEqual(TITLES["/calendar"]);
  });
  it("special-cases the booking detail route", () => {
    expect(titleForPath("/bookings/abc123")).toEqual({ h: "Booking", s: "Detail" });
  });
  it("falls back to the brand for unknown paths", () => {
    expect(titleForPath("/totally-unknown")).toEqual({ h: "StayKit", s: "" });
  });
});
