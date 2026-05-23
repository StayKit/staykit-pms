import { describe, it, expect, beforeEach, vi } from "vitest";
import { enqueueNotification, sendNow } from "./dispatch";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic();
});

async function template(channel: "SMS" | "EMAIL" | "WHATSAPP", triggerKey: string, body: string) {
  return prisma.notificationTemplate.create({
    data: { ownerId: fx.owner.id, channel, triggerKey, name: triggerKey, body },
  });
}

describe("enqueueNotification", () => {
  it("queues one NotificationLog per active template for the trigger", async () => {
    await template("SMS", "BOOKING_CONFIRMED", "Hi {{guest.name}}");
    await template("EMAIL", "BOOKING_CONFIRMED", "Dear {{guest.name}}");

    const logs = await enqueueNotification({
      ownerId: fx.owner.id,
      triggerKey: "BOOKING_CONFIRMED",
      to: "+919812300000",
      scope: { guest: { name: "Sameer" } },
    });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.status === "QUEUED")).toBe(true);
    const sms = logs.find((l) => l.channel === "SMS");
    expect(JSON.parse(sms!.payload!).body).toBe("Hi Sameer");
  });

  it("respects a channel override", async () => {
    await template("SMS", "PAYMENT_LINK_SENT", "pay");
    await template("WHATSAPP", "PAYMENT_LINK_SENT", "pay");
    const logs = await enqueueNotification({
      ownerId: fx.owner.id,
      triggerKey: "PAYMENT_LINK_SENT",
      to: "+91",
      scope: {},
      channelsOverride: ["WHATSAPP"],
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].channel).toBe("WHATSAPP");
  });

  it("applies an automation delay to scheduledFor", async () => {
    const t = await template("WHATSAPP", "PRE_ARRIVAL_24H", "see you");
    await prisma.notificationAutomation.create({
      data: {
        ownerId: fx.owner.id,
        triggerKey: "PRE_ARRIVAL_24H",
        templateId: t.id,
        delayMinutes: -1440,
      },
    });
    const [log] = await enqueueNotification({
      ownerId: fx.owner.id,
      triggerKey: "PRE_ARRIVAL_24H",
      to: "+91",
      scope: {},
    });
    // scheduled ~24h before now
    expect(log.scheduledFor.getTime()).toBeLessThan(Date.now() - 1000 * 60 * 1000);
  });
});

describe("sendNow", () => {
  it("renders and sends a template immediately, logging it as SENT", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const t = await template("SMS", "PAYMENT_RECEIVED", "Thanks {{guest.name}}");
    const { body } = await sendNow(t.id, "+919812300000", { guest: { name: "Sameer" } });
    expect(body).toBe("Thanks Sameer");
    const log = await prisma.notificationLog.findFirst({ where: { templateId: t.id } });
    expect(log?.status).toBe("SENT");
    expect(log?.providerMessageId).toMatch(/^console_/);
    spy.mockRestore();
  });

  it("throws when the template does not exist", async () => {
    await expect(sendNow("missing", "+91", {})).rejects.toThrow(/not found/);
  });
});
