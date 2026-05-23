import { describe, it, expect } from "vitest";
import { can, permissionsForRole } from "./policy";

describe("unknown roles are denied safely", () => {
  it("can() returns false for a role with no mapping", () => {
    expect(can("GHOST" as never, "bookings:read")).toBe(false);
  });
  it("permissionsForRole() returns an empty list for an unknown role", () => {
    expect(permissionsForRole("GHOST" as never)).toEqual([]);
  });
});
