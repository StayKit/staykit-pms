import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const CHANNEL_TAG: Record<"SMS" | "EMAIL" | "WHATSAPP", string> = { SMS: "", EMAIL: "direct", WHATSAPP: "whatsapp" };

export default async function NotificationsPage() {
  const ctx = (await getAppContext())!;

  const templates = await prisma.notificationTemplate.findMany({
    where: { ownerId: ctx.ownerId },
    orderBy: { triggerKey: "asc" },
  });

  // Group per logical trigger so each row shows all channels.
  type Chan = "SMS" | "EMAIL" | "WHATSAPP";
  const byTrigger = new Map<string, { name: string; trigger: string; channels: Chan[] }>();
  for (const t of templates) {
    const prev = byTrigger.get(t.triggerKey) ?? { name: t.name, trigger: t.triggerKey, channels: [] };
    prev.channels.push(t.channel);
    byTrigger.set(t.triggerKey, prev);
  }
  const rows = [...byTrigger.values()];

  const sent30 = await prisma.notificationLog.count({
    where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
  });

  const triggerLabel: Record<string, string> = {
    BOOKING_CONFIRMED: "On booking",
    PAYMENT_LINK_SENT: "Manual or after booking",
    PAYMENT_RECEIVED: "On payment",
    PRE_ARRIVAL_24H: "1 day before arrival",
    POST_CHECKOUT_THANKS: "1 day after checkout",
    CANCELLED: "On cancel",
  };

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Notifications</h2>
          <div className="sub">Templates and automations for SMS, email & WhatsApp</div>
        </div>
        <button className="btn btn-primary"><Icon name="plus" className="icon-sm" /> New template</button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Templates</h3>
          <div className="sub" style={{ marginLeft: "auto" }}>{rows.length} active · 3 channels · {sent30} sent (30d)</div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Template</th>
              <th>Channels</th>
              <th>Trigger</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.trigger} style={{ cursor: "default" }}>
                <td><div className="name" style={{ fontWeight: 550 }}>{t.name}</div></td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    {t.channels.map((c) => (
                      <span key={c} className={"channel-chip " + CHANNEL_TAG[c]}>
                        {c === "WHATSAPP" ? "WhatsApp" : c === "EMAIL" ? "Email" : "SMS"}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="text-sm text-muted">{triggerLabel[t.trigger] ?? t.trigger}</td>
                <td><button className="btn btn-sm btn-ghost"><Icon name="edit" className="icon-sm" /> Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="checklist-card" style={{ marginTop: 24 }}>
        <div className="icon-wrap"><Icon name="send" className="icon" /></div>
        <div className="text">
          <div className="title">Send a custom message</div>
          <div className="sub">Filter guests by stay date or property, then send a WhatsApp or email.</div>
        </div>
        <button className="btn">Compose</button>
      </div>

      <div className="card card-padded" style={{ marginTop: 24 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>India SMS compliance (DLT)</h3>
        <p className="text-sm text-muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
          Transactional SMS in India must use a DLT-approved content template. We store each template&apos;s
          <code> dltTemplateId</code> and pass it to MSG91 at send-time. Approval typically takes 3–7 days.
          From 6 May 2025, TSPs auto-append a header type suffix (-P/-S/-T/-G) during scrubbing.
        </p>
      </div>
    </div>
  );
}
