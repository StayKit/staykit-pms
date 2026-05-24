import { describe, it, expect, beforeEach, vi } from "vitest";
import { drainNotifications, notifyBackoffMs, MAX_NOTIFY_ATTEMPTS } from "./dispatch";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic();
});

async function queued(
  opts: Partial<Parameters<typeof prisma.notificationLog.create>[0]["data"]> = {},
) {
  return prisma.notificationLog.create({
    data: {
      channel: "SMS",
      to: "+919812300000",
      triggerKey: "PAYMENT_RECEIVED",
      status: "QUEUED",
      scheduledFor: new Date(Date.now() - 1000),
      payload: JSON.stringify({ body: "Hi Sameer" }),
      ...opts,
    },
  });
}

describe("notifyBackoffMs", () => {
  it("is exponential and capped at one hour", () => {
    expect(notifyBackoffMs(1)).toBe(2000);
    expect(notifyBackoffMs(3)).toBe(8000);
    expect(notifyBackoffMs(40)).toBe(60 * 60 * 1000);
  });
});

describe("drainNotifications", () => {
  it("sends due QUEUED rows and marks them SENT", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = await queued();
    const res = await drainNotifications();
    expect(res).toEqual({ sent: 1, failed: 0 });
    const after = await prisma.notificationLog.findUnique({ where: { id: log.id } });
    expect(after?.status).toBe("SENT");
    expect(after?.attempts).toBe(1);
    expect(after?.providerMessageId).toMatch(/^console_/);
    spy.mockRestore();
  });

  it("leaves rows scheduled for the future untouched", async () => {
    const log = await queued({ scheduledFor: new Date(Date.now() + 60_000) });
    const res = await drainNotifications();
    expect(res.sent).toBe(0);
    const after = await prisma.notificationLog.findUnique({ where: { id: log.id } });
    expect(after?.status).toBe("QUEUED");
  });

  it("retries with backoff on failure and re-queues", async () => {
    // An unparseable payload makes the send throw — exercising the retry path.
    const log = await queued({ payload: "not-json" });
    const res = await drainNotifications();
    expect(res).toEqual({ sent: 0, failed: 1 });
    const after = await prisma.notificationLog.findUnique({ where: { id: log.id } });
    expect(after?.status).toBe("QUEUED");
    expect(after?.attempts).toBe(1);
    expect(after?.lastError).toBeTruthy();
    expect(after!.scheduledFor.getTime()).toBeGreaterThan(Date.now());
  });

  it("moves a row to the DLQ once attempts are exhausted", async () => {
    const log = await queued({ payload: "not-json", attempts: MAX_NOTIFY_ATTEMPTS - 1 });
    await drainNotifications();
    const after = await prisma.notificationLog.findUnique({ where: { id: log.id } });
    expect(after?.status).toBe("DLQ");
    expect(after?.attempts).toBe(MAX_NOTIFY_ATTEMPTS);
  });

  it("respects the limit and oldest-first ordering", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await queued({ scheduledFor: new Date(Date.now() - 3000) });
    await queued({ scheduledFor: new Date(Date.now() - 2000) });
    await queued({ scheduledFor: new Date(Date.now() - 1000) });
    const res = await drainNotifications(2);
    expect(res.sent).toBe(2);
    expect(await prisma.notificationLog.count({ where: { status: "QUEUED" } })).toBe(1);
    spy.mockRestore();
  });

  it("uses the template's subject/dlt fields when present", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const tpl = await prisma.notificationTemplate.create({
      data: {
        ownerId: fx.owner.id,
        channel: "SMS",
        triggerKey: "PAYMENT_RECEIVED",
        name: "pr",
        body: "x",
        dltTemplateId: "DLT123",
      },
    });
    const log = await queued({ templateId: tpl.id });
    const res = await drainNotifications();
    expect(res.sent).toBe(1);
    expect((await prisma.notificationLog.findUnique({ where: { id: log.id } }))?.status).toBe(
      "SENT",
    );
    spy.mockRestore();
  });
});
