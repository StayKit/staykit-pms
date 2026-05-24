import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireContext: vi.fn() }));

import { requireContext } from "@/lib/auth/context";
import {
  seedDefaultTemplatesAction,
  toggleTemplateAction,
  updateTemplateAction,
  sendTestAction,
} from "./notifications";
import { DEFAULT_TEMPLATES } from "../notify/defaults";
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

describe("seedDefaultTemplatesAction", () => {
  it("creates the default template set, idempotently", async () => {
    const first = await seedDefaultTemplatesAction();
    expect(first.ok).toBe(true);
    expect((first.data as { created: number }).created).toBe(DEFAULT_TEMPLATES.length);
    const second = await seedDefaultTemplatesAction();
    expect((second.data as { created: number }).created).toBe(0);
    expect(await prisma.notificationTemplate.count()).toBe(DEFAULT_TEMPLATES.length);
  });
});

describe("template editing", () => {
  it("toggles and updates a template", async () => {
    await seedDefaultTemplatesAction();
    const t = await prisma.notificationTemplate.findFirst({ where: { ownerId: fx.owner.id } });
    await toggleTemplateAction(t!.id);
    expect((await prisma.notificationTemplate.findUnique({ where: { id: t!.id } }))?.active).toBe(
      false,
    );
    const upd = await updateTemplateAction(t!.id, { body: "New body {{guest.name}}" });
    expect(upd.ok).toBe(true);
    const empty = await updateTemplateAction(t!.id, { body: "  " });
    expect(empty.ok).toBe(false);
  });
});

describe("sendTestAction", () => {
  it("sends a test message and logs it", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await seedDefaultTemplatesAction();
    const t = await prisma.notificationTemplate.findFirst({ where: { channel: "SMS" } });
    const res = await sendTestAction(t!.id, "+919812300000");
    expect(res.ok).toBe(true);
    const log = await prisma.notificationLog.findFirst({ where: { templateId: t!.id } });
    expect(log?.status).toBe("SENT");
    spy.mockRestore();
  });

  it("rejects an empty recipient", async () => {
    await seedDefaultTemplatesAction();
    const t = await prisma.notificationTemplate.findFirst();
    expect((await sendTestAction(t!.id, "")).ok).toBe(false);
  });
});
