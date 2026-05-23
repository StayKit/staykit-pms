/**
 * Notification dispatch. enqueue() resolves the owner's active templates+automations
 * for a trigger and writes NotificationLog rows (one per channel) with a scheduledFor.
 * The in-process worker (lib/jobs/worker) drains QUEUED rows; here we expose a
 * synchronous sendNow() used by tests and the "Send test" button.
 */
import { prisma } from "../db";
import { renderTemplate } from "./template";
import { providerFor } from "./providers";
import type { NotificationChannel } from "@prisma/client";

export type TriggerKey =
  | "BOOKING_CONFIRMED"
  | "BOOKING_TENTATIVE"
  | "PAYMENT_LINK_SENT"
  | "PAYMENT_RECEIVED"
  | "PRE_ARRIVAL_24H"
  | "CHECK_IN_INSTRUCTIONS"
  | "POST_CHECKOUT_THANKS"
  | "REFUND_PROCESSED"
  | "NO_SHOW"
  | "CANCELLED"
  | "OWNER_NEW_BOOKING";

export interface EnqueueInput {
  ownerId: string;
  triggerKey: TriggerKey;
  to: string;
  bookingId?: string;
  scope: Record<string, unknown>;
  channelsOverride?: NotificationChannel[];
}

export async function enqueueNotification(input: EnqueueInput) {
  const templates = await prisma.notificationTemplate.findMany({
    where: { ownerId: input.ownerId, triggerKey: input.triggerKey, active: true },
  });

  const automations = await prisma.notificationAutomation.findMany({
    where: { ownerId: input.ownerId, triggerKey: input.triggerKey, active: true },
  });
  const delayByTemplate = new Map(automations.map((a) => [a.templateId, a.delayMinutes]));

  const logs = [];
  for (const t of templates) {
    if (input.channelsOverride && !input.channelsOverride.includes(t.channel)) continue;
    const delay = delayByTemplate.get(t.id) ?? 0;
    const log = await prisma.notificationLog.create({
      data: {
        bookingId: input.bookingId,
        channel: t.channel,
        to: input.to,
        templateId: t.id,
        triggerKey: input.triggerKey,
        status: "QUEUED",
        scheduledFor: new Date(Date.now() + delay * 60_000),
        payload: JSON.stringify({ body: renderTemplate(t.body, input.scope) }),
      },
    });
    logs.push(log);
  }
  return logs;
}

/** Render + send one template immediately (used by tests and the test-send button). */
export async function sendNow(templateId: string, to: string, scope: Record<string, unknown>) {
  const t = await prisma.notificationTemplate.findUnique({ where: { id: templateId } });
  if (!t) throw new Error("Template not found");
  const body = renderTemplate(t.body, scope);
  const provider = providerFor(t.channel);
  const result = await provider.send({
    channel: t.channel,
    to,
    body,
    subject: t.subject ?? undefined,
    dltTemplateId: t.dltTemplateId ?? undefined,
    whatsappTemplateName: t.whatsappTemplateName ?? undefined,
  });
  await prisma.notificationLog.create({
    data: {
      channel: t.channel,
      to,
      templateId: t.id,
      triggerKey: t.triggerKey,
      status: "SENT",
      providerMessageId: result.providerMessageId,
      scheduledFor: new Date(),
      sentAt: new Date(),
      payload: JSON.stringify({ body }),
    },
  });
  return { body, result };
}
