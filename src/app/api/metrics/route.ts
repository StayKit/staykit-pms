/**
 * Prometheus metrics (§B.17). Plain-text exposition format. Cheap aggregate counts;
 * no auth in v1 (scrape from a private network / behind the reverse proxy).
 */
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [bookings, notifByStatus, jobsQueued, jobsDlq, webhooks, refundsProcessed] =
    await Promise.all([
      prisma.booking.count(),
      prisma.notificationLog.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.job.count({ where: { status: "QUEUED" } }),
      prisma.job.count({ where: { status: "DLQ" } }),
      prisma.webhookEvent.count(),
      prisma.refund.count({ where: { status: "PROCESSED" } }),
    ]);

  const lines: string[] = [];
  const metric = (name: string, help: string, value: number, labels = "") => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name}${labels} ${value}`);
  };

  metric("staykit_bookings_total", "Total bookings.", bookings);
  metric("staykit_jobs_queued", "Background jobs waiting to run.", jobsQueued);
  metric("staykit_jobs_dlq", "Background jobs in the dead-letter queue.", jobsDlq);
  metric("staykit_webhook_events_total", "Razorpay webhook events received.", webhooks);
  metric("staykit_refunds_processed_total", "Refunds processed.", refundsProcessed);

  lines.push("# HELP staykit_notifications_total Notifications by status.");
  lines.push("# TYPE staykit_notifications_total gauge");
  for (const row of notifByStatus) {
    lines.push(`staykit_notifications_total{status="${row.status}"} ${row._count._all}`);
  }

  return new Response(lines.join("\n") + "\n", {
    status: 200,
    headers: { "content-type": "text/plain; version=0.0.4" },
  });
}
