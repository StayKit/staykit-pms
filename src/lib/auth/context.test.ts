import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from "vitest";

vi.mock("./session", () => ({ getStaffSession: vi.fn() }));

import { getStaffSession } from "./session";
import { getAppContext, requireContext } from "./context";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

const mockGetStaffSession = getStaffSession as unknown as Mock;

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic();
  mockGetStaffSession.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("getAppContext", () => {
  it("returns the real session context when signed in (not demo)", async () => {
    mockGetStaffSession.mockResolvedValue({
      scope: "staff",
      userId: fx.user.id,
      ownerId: fx.owner.id,
      role: "MANAGER",
      name: "Rakesh",
      propertyScopes: [fx.property.id],
    });
    const ctx = await getAppContext();
    expect(ctx).toMatchObject({ userId: fx.user.id, role: "MANAGER", name: "Rakesh", demo: false });
  });

  it("falls back to the first OWNER (demo mode) when there is no session", async () => {
    mockGetStaffSession.mockResolvedValue(null);
    const ctx = await getAppContext();
    expect(ctx).toMatchObject({ ownerId: fx.owner.id, role: "OWNER", demo: true });
    expect(ctx?.propertyScopes).toEqual([]);
  });

  it("returns null when REQUIRE_LOGIN=1 and there is no session", async () => {
    vi.stubEnv("REQUIRE_LOGIN", "1");
    mockGetStaffSession.mockResolvedValue(null);
    expect(await getAppContext()).toBeNull();
  });

  it("returns null when no owner exists to fall back to", async () => {
    await resetDb(); // remove the seeded owner
    mockGetStaffSession.mockResolvedValue(null);
    expect(await getAppContext()).toBeNull();
  });
});

describe("requireContext", () => {
  it("returns the context when present", async () => {
    mockGetStaffSession.mockResolvedValue(null); // demo fallback applies
    await expect(requireContext()).resolves.toMatchObject({ ownerId: fx.owner.id });
  });

  it("throws when unauthenticated", async () => {
    vi.stubEnv("REQUIRE_LOGIN", "1");
    mockGetStaffSession.mockResolvedValue(null);
    await expect(requireContext()).rejects.toThrow(/Not authenticated/);
  });
});
