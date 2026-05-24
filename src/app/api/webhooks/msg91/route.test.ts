import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic } from "../../../../../test/factories";

beforeEach(async () => {
  await resetDb();
  await seedBasic({ gstin: null });
});

async function log(providerMessageId: string) {
  return prisma.notificationLog.create({
    data: {
      channel: "SMS",
      to: "+919812300000",
      triggerKey: "PAYMENT_LINK_SENT",
      status: "SENT",
      scheduledFor: new Date(),
      providerMessageId,
    },
  });
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost:3000/api/webhooks/msg91", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/webhooks/msg91", () => {
  it("marks a log DELIVERED on a delivery receipt", async () => {
    const l = await log("msg_1");
    const res = await post({ requestId: "msg_1", status: "delivered" });
    expect(res.status).toBe(200);
    const after = await prisma.notificationLog.findUnique({ where: { id: l.id } });
    expect(after?.status).toBe("DELIVERED");
    expect(after?.deliveredAt).toBeTruthy();
  });

  it("marks a log FAILED on a failure receipt", async () => {
    const l = await log("msg_2");
    await post({ message_id: "msg_2", status: "failed", error: "DND" });
    const after = await prisma.notificationLog.findUnique({ where: { id: l.id } });
    expect(after?.status).toBe("FAILED");
    expect(after?.lastError).toBe("DND");
  });

  it("ignores unmappable statuses and bad json without erroring", async () => {
    expect((await post({ requestId: "x", status: "weird" })).status).toBe(200);
    const bad = await POST(
      new Request("http://localhost:3000/api/webhooks/msg91", { method: "POST", body: "{bad" }),
    );
    expect(bad.status).toBe(400);
  });
});
