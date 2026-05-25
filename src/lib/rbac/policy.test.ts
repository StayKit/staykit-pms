import { describe, it, expect } from "vitest";
import { can, assertAccess, AccessError, permissionsForRole } from "./policy";

// RBAC (B.5): OWNER has everything; MANAGER/STAFF are operational and additionally
// constrained by PropertyScope; financial/team powers are not granted to STAFF.

describe("can(role, permission)", () => {
  it("grants the OWNER every permission", () => {
    expect(can("OWNER", "team:manage")).toBe(true);
    expect(can("OWNER", "payments:refund")).toBe(true);
    expect(can("OWNER", "mcp:admin")).toBe(true);
  });

  it("lets MANAGER operate but not manage the team or MCP", () => {
    expect(can("MANAGER", "bookings:write")).toBe(true);
    expect(can("MANAGER", "payments:refund")).toBe(true);
    expect(can("MANAGER", "reports:read")).toBe(true);
    expect(can("MANAGER", "team:manage")).toBe(false);
    expect(can("MANAGER", "mcp:admin")).toBe(false);
  });

  it("limits STAFF to day-to-day operations (no money, no reports)", () => {
    expect(can("STAFF", "bookings:write")).toBe(true);
    expect(can("STAFF", "properties:read")).toBe(true);
    expect(can("STAFF", "payments:refund")).toBe(false);
    // Staff CAN cancel a booking they made / a counter cancellation (audit P1 #8).
    expect(can("STAFF", "bookings:cancel")).toBe(true);
    expect(can("STAFF", "reports:read")).toBe(false);
  });
});

describe("assertAccess", () => {
  it("passes for a permitted role", () => {
    expect(() => assertAccess({ role: "OWNER" }, "team:manage")).not.toThrow();
  });

  it("throws AccessError (code FORBIDDEN) when the role lacks the permission", () => {
    try {
      assertAccess({ role: "STAFF" }, "payments:refund");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AccessError);
      expect((e as AccessError).code).toBe("FORBIDDEN");
    }
  });

  it("ignores the property scope for the OWNER", () => {
    expect(() =>
      assertAccess({ role: "OWNER", propertyScopes: ["p-other"] }, "bookings:write", {
        propertyId: "p1",
      }),
    ).not.toThrow();
  });

  it("rejects a manager acting on a property outside their scope", () => {
    expect(() =>
      assertAccess({ role: "MANAGER", propertyScopes: ["p1"] }, "bookings:write", {
        propertyId: "p2",
      }),
    ).toThrow(AccessError);
  });

  it("allows a manager on a scoped property", () => {
    expect(() =>
      assertAccess({ role: "MANAGER", propertyScopes: ["p1"] }, "bookings:write", {
        propertyId: "p1",
      }),
    ).not.toThrow();
  });

  it("skips the scope check when no propertyScopes are supplied", () => {
    expect(() =>
      assertAccess({ role: "MANAGER" }, "bookings:write", { propertyId: "p1" }),
    ).not.toThrow();
  });
});

describe("permissionsForRole", () => {
  it("returns the full set for OWNER and a subset for STAFF", () => {
    expect(permissionsForRole("OWNER").length).toBeGreaterThan(permissionsForRole("STAFF").length);
    expect(permissionsForRole("STAFF")).not.toContain("payments:refund");
  });
});
