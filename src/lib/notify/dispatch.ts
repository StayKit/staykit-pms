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

/** Max delivery attempts before a NotificationLog row is moved to the DLQ. */
export const MAX_NOTIFY_ATTEMPTS = 8;

/** Exponential backoff (ms) for a failed delivery: 2^attempts seconds, capped at 1h. */
export function notifyBackoffMs(attempts: number): number {
  return Math.min(2 ** attempts * 1000, 60 * 60 * 1000);
}

/**
 * Drain due notifications: the in-process worker (lib/jobs/worker) calls this every
 * few seconds. Claims QUEUED rows whose scheduledFor has passed, sends them, and on
 * failure retries with exponential backoff up to MAX_NOTIFY_ATTEMPTS, then DLQ.
 * Returns counts so the worker can log throughput.
 */
export async function drainNotifications(limit = 10): Promise<{ sent: number; failed: number }> {
  const due = await prisma.notificationLog.findMany({
    where: { status: "QUEUED", scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  for (const log of due) {
    // Claim the row so a second worker tick can't double-send it.
    const claim = await prisma.notificationLog.updateMany({
      where: { id: log.id, status: "QUEUED" },
      data: { status: "SENDING" },
    });
    if (claim.count === 0) continue;

    try {
      const body = log.payload ? (JSON.parse(log.payload).body ?? "") : "";
      const tpl = log.templateId
        ? await prisma.notificationTemplate.findUnique({ where: { id: log.templateId } })
        : null;
      const result = await providerFor(log.channel).send({
        channel: log.channel,
        to: log.to,
        body,
        subject: tpl?.subject ?? undefined,
        dltTemplateId: tpl?.dltTemplateId ?? undefined,
        whatsappTemplateName: tpl?.whatsappTemplateName ?? undefined,
      });
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          attempts: { increment: 1 },
          providerMessageId: result.providerMessageId,
          lastError: null,
        },
      });
      sent += 1;
    } catch (e) {
      const attempts = log.attempts + 1;
      const dead = attempts >= MAX_NOTIFY_ATTEMPTS;
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: dead ? "DLQ" : "QUEUED",
          attempts,
          lastError: e instanceof Error ? e.message : String(e),
          scheduledFor: dead ? log.scheduledFor : new Date(Date.now() + notifyBackoffMs(attempts)),
        },
      });
      failed += 1;
    }
  }
  return { sent, failed };
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
