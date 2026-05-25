import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { Icon } from "@/components/Icon";
import {
  NotificationToggles,
  type ToggleRow,
} from "@/components/owner/settings/NotificationToggles";

export const dynamic = "force-dynamic";

export default async function SettingsNotificationsPage() {
  const ctx = (await getAppContext())!;

  const [templates, sent30] = await Promise.all([
    prisma.notificationTemplate.findMany({
      where: { ownerId: ctx.ownerId },
      orderBy: [{ triggerKey: "asc" }, { channel: "asc" }],
    }),
    prisma.notificationLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    }),
  ]);

  const rows: ToggleRow[] = templates.map((t) => ({
    id: t.id,
    channel: t.channel,
    triggerKey: t.triggerKey,
    name: t.name,
    active: t.active,
  }));

  const channels = [
    {
      name: "SMS",
      desc: "MSG91 with DLT template IDs",
      icon: "phone",
      connected: !!process.env.MSG91_AUTH_KEY,
    },
    {
      name: "WhatsApp",
      desc: "MSG91 approved templates",
      icon: "message-circle",
      connected: !!process.env.MSG91_AUTH_KEY,
    },
    {
      name: "Email",
      desc: "Resend transactional email",
      icon: "mail",
      connected: !!process.env.RESEND_API_KEY,
    },
  ];

  return (
    <>
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Notifications</h3>
        <div className="sub">
          Turn automated messages on or off per channel. Edit the wording, DLT and WhatsApp template
          IDs under <Link href="/notifications">Notifications</Link>.
        </div>
      </div>

      <div className="card card-padded">
        <h4 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 600 }}>Channels</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {channels.map((c) => (
            <div
              key={c.name}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 14,
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: "var(--surface-2)",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--ink-2)",
                  flex: "0 0 34px",
                }}
              >
                <Icon name={c.icon} className="icon-sm" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                  {c.desc}
                </div>
                <div style={{ marginTop: 8 }}>
                  {c.connected ? (
                    <span className="pill pill-checkedin">
                      <Icon name="check" className="icon-sm" /> Live
                    </span>
                  ) : (
                    <span className="pill pill-neutral">Console only</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="hint" style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
          {sent30} messages sent in the last 30 days. Channels showing &ldquo;Console only&rdquo;
          log to the server instead of sending until their keys are set under{" "}
          <Link href="/settings/integrations">Integrations</Link>.
        </div>
      </div>

      <div>
        <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600 }}>Automated messages</h4>
        <NotificationToggles rows={rows} />
      </div>
    </>
  );
}
