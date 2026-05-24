/**
 * MSG91 delivery-receipt webhook (§B.4). Maps a provider message id + status onto the
 * matching NotificationLog row so the messages timeline shows delivery state. MSG91's
 * DLR shapes vary by product, so we accept the common fields defensively.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, "DELIVERED" | "FAILED" | "SENT"> = {
  delivered: "DELIVERED",
  delivery: "DELIVERED",
  read: "DELIVERED",
  sent: "SENT",
  failed: "FAILED",
  undelivered: "FAILED",
  rejected: "FAILED",
};

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const providerMessageId = String(
    body.requestId ?? body.message_id ?? body.messageId ?? body.providerMessageId ?? "",
  );
  const rawStatus = String(body.status ?? body.report ?? "").toLowerCase();
  const mapped = STATUS_MAP[rawStatus];

  if (!providerMessageId || !mapped) {
    // Acknowledge so MSG91 doesn't retry, but record nothing we can't map.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const log = await prisma.notificationLog.findFirst({ where: { providerMessageId } });
  if (log) {
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: mapped,
        deliveredAt: mapped === "DELIVERED" ? new Date() : log.deliveredAt,
        lastError: mapped === "FAILED" ? String(body.error ?? "delivery failed") : log.lastError,
      },
    });
  }
  return NextResponse.json({ ok: true });
}
