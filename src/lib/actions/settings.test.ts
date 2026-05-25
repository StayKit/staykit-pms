import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireContext: vi.fn() }));

import { requireContext } from "@/lib/auth/context";
import { updateAccountAction } from "./settings";
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

describe("updateAccountAction", () => {
  it("updates the owner profile and writes an audit row", async () => {
    const res = await updateAccountAction({
      name: "New Name",
      email: "new@stay.in",
      phone: "+919800012345",
    });
    expect(res.ok).toBe(true);
    const owner = await prisma.owner.findUnique({ where: { id: fx.owner.id } });
    expect(owner?.name).toBe("New Name");
    expect(owner?.email).toBe("new@stay.in");
    expect(owner?.phone).toBe("+919800012345");
    const audit = await prisma.auditLog.findFirst({ where: { action: "ACCOUNT_UPDATED" } });
    expect(audit).toBeTruthy();
  });

  it("clears the email when left blank", async () => {
    const res = await updateAccountAction({ name: "Solo", email: "", phone: "+919800054321" });
    expect(res.ok).toBe(true);
    const owner = await prisma.owner.findUnique({ where: { id: fx.owner.id } });
    expect(owner?.email).toBeNull();
  });

  it("rejects an empty name and a malformed email", async () => {
    expect((await updateAccountAction({ name: "", phone: "+91980001" })).ok).toBe(false);
    expect((await updateAccountAction({ name: "X", email: "nope", phone: "+91980001" })).ok).toBe(
      false,
    );
  });

  it("blocks a non-owner", async () => {
    mockCtx.mockResolvedValue({
      ownerId: fx.owner.id,
      userId: fx.user.id,
      role: "MANAGER",
      name: "Mgr",
      propertyScopes: [],
      demo: false,
    });
    const res = await updateAccountAction({ name: "X", phone: "+919800099999" });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("owner");
  });

  it("rejects a phone already used by another workspace", async () => {
    const other = await prisma.owner.create({
      data: { name: "Other", phone: "+919811112222", email: "other@stay.in" },
    });
    const byPhone = await updateAccountAction({ name: "Clash", phone: other.phone });
    expect(byPhone.ok).toBe(false);
    expect(byPhone.message).toContain("mobile number");

    const byEmail = await updateAccountAction({
      name: "Clash",
      email: "other@stay.in",
      phone: "+919800033333",
    });
    expect(byEmail.ok).toBe(false);
    expect(byEmail.message).toContain("email");
  });
});
