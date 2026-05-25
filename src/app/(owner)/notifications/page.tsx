import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { Icon } from "@/components/Icon";
import {
  NotificationTemplatesManager,
  type TemplateRow,
} from "@/components/owner/NotificationTemplatesManager";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const ctx = (await getAppContext())!;

  const templates = await prisma.notificationTemplate.findMany({
    where: { ownerId: ctx.ownerId },
    orderBy: [{ triggerKey: "asc" }, { channel: "asc" }],
  });

  const rows: TemplateRow[] = templates.map((t) => ({
    id: t.id,
    channel: t.channel,
    triggerKey: t.triggerKey,
    name: t.name,
    subject: t.subject,
    body: t.body,
    dltTemplateId: t.dltTemplateId,
    whatsappTemplateName: t.whatsappTemplateName,
    active: t.active,
  }));

  const activeCount = rows.filter((t) => t.active).length;
  const sent30 = await prisma.notificationLog.count({
    where: {
      createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
      OR: [
        { booking: { property: { ownerId: ctx.ownerId } } },
        { templateId: { in: rows.map((t) => t.id) } },
      ],
    },
  });

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Notifications</h2>
          <div className="sub">
            {activeCount} active ·{" "}
            <Link href="/notifications/log" style={{ color: "var(--brand-ink)" }}>
              {sent30} sent (30d)
            </Link>
          </div>
        </div>
        <Link className="btn" href="/notifications/log">
          <Icon name="bar-chart" className="icon-sm" /> Delivery log
        </Link>
      </div>

      <NotificationTemplatesManager templates={rows} />

      <div className="card card-padded" style={{ marginTop: 24 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>How templates are used</h3>
        <p className="text-sm text-muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
          Active templates send automatically on their trigger — booking confirmed, payment
          received, cancellation and after check-out. SMS/WhatsApp go to the guest&apos;s mobile,
          email to their email. You can also send any template to a specific guest from a
          booking&apos;s Messages tab.
        </p>
      </div>

      <div className="card card-padded" style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>India SMS compliance (DLT)</h3>
        <p className="text-sm text-muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
          Transactional SMS in India must use a DLT-approved content template. We store each
          template&apos;s
          <code> dltTemplateId</code> and pass it to MSG91 at send-time. Approval typically takes
          3–7 days. From 6 May 2025, TSPs auto-append a header type suffix (-P/-S/-T/-G) during
          scrubbing.
        </p>
      </div>
    </div>
  );
}
