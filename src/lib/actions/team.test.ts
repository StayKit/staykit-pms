import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireContext: vi.fn() }));

import { requireContext } from "@/lib/auth/context";
import {
  createTeamMemberAction,
  updateTeamMemberAction,
  toggleTeamMemberActiveAction,
} from "./team";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

const mockCtx = requireContext as unknown as Mock;
let fx: Fixture;

beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
  mockCtx.mockResolvedValue({
    ownerId: fx.owner.id,
    userId: fx.user.id,
    role: "OWNER",
    name: "Priya",
    propertyScopes: [],
    demo: true,
  });
});

describe("createTeamMemberAction", () => {
  it("creates a manager with property scopes", async () => {
    const res = await createTeamMemberAction({
      name: "Rakesh",
      phone: "+919800099001",
      role: "MANAGER",
      propertyIds: [fx.property.id],
    });
    expect(res.ok).toBe(true);
    const id = (res.data as { id: string }).id;
    const scopes = await prisma.propertyScope.findMany({ where: { userId: id } });
    expect(scopes).toHaveLength(1);
    expect(scopes[0].permissions).toContain("payments:refund");
  });

  it("rejects a duplicate phone", async () => {
    const dupe = await createTeamMemberAction({
      name: "Clone",
      phone: fx.user.phone,
      role: "STAFF",
      propertyIds: [],
    });
    expect(dupe.ok).toBe(false);
  });
});

describe("updateTeamMemberAction", () => {
  it("changes role and re-syncs scopes", async () => {
    const created = await createTeamMemberAction({
      name: "Anjali",
      phone: "+919800099002",
      role: "STAFF",
      propertyIds: [fx.property.id],
    });
    const id = (created.data as { id: string }).id;
    await updateTeamMemberAction(id, { role: "MANAGER", propertyIds: [] });
    const user = await prisma.user.findUnique({ where: { id } });
    expect(user?.role).toBe("MANAGER");
    expect(await prisma.propertyScope.count({ where: { userId: id } })).toBe(0);
  });
});

describe("toggleTeamMemberActiveAction", () => {
  it("disables another member but not yourself", async () => {
    const created = await createTeamMemberAction({
      name: "Other",
      phone: "+919800099003",
      role: "STAFF",
      propertyIds: [],
    });
    const id = (created.data as { id: string }).id;
    expect((await toggleTeamMemberActiveAction(id)).ok).toBe(true);
    expect((await prisma.user.findUnique({ where: { id } }))?.active).toBe(false);
    // Cannot disable self.
    expect((await toggleTeamMemberActiveAction(fx.user.id)).ok).toBe(false);
  });
});
