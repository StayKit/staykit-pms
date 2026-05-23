import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { isConfigured as razorpayConfigured } from "@/lib/payments/razorpay/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = (await getAppContext())!;
  const property = await prisma.property.findFirst({
    where: { ownerId: ctx.ownerId, active: true },
    orderBy: { createdAt: "asc" },
  });

  const integrations = [
    { name: "Razorpay", desc: "Payment links, refunds & webhooks", connected: razorpayConfigured(), icon: "credit-card" },
    { name: "MSG91 (SMS)", desc: "Transactional SMS with DLT IDs", connected: !!process.env.MSG91_AUTH_KEY, icon: "phone" },
    { name: "WhatsApp Business", desc: "Send confirmations & reminders", connected: !!process.env.MSG91_AUTH_KEY, icon: "message-circle" },
    { name: "Resend (Email)", desc: "Transactional email", connected: !!process.env.RESEND_API_KEY, icon: "mail" },
    { name: "Litestream", desc: "Automated SQLite backups to S3", connected: !!process.env.LITESTREAM_BUCKET, icon: "shield" },
  ];

  const subnav = [
    { label: "Property", icon: "map-pin" },
    { label: "Integrations", icon: "sparkles", active: true },
    { label: "Team & roles", icon: "users" },
    { label: "Notifications", icon: "bell" },
    { label: "Legal & DPDP", icon: "shield" },
    { label: "Account", icon: "user" },
  ];

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Settings</h2>
          <div className="sub">Workspace, integrations and team</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24 }}>
        <div>
          {subnav.map((s) => (
            <button key={s.label} className={"nav-item " + (s.active ? "active" : "")} style={{ width: "100%" }}>
              <Icon name={s.icon} className="icon" />
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <h3>Integrations</h3>
              <div className="sub" style={{ marginLeft: "auto" }}>
                {integrations.filter((i) => i.connected).length} connected ·{" "}
                {integrations.filter((i) => !i.connected).length} need setup
              </div>
            </div>
            <div>
              {integrations.map((i) => (
                <div key={i.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, borderBottom: "1px solid var(--line)" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--surface-2)", display: "grid", placeItems: "center", color: "var(--ink-2)", flex: "0 0 38px" }}>
                    <Icon name={i.icon} className="icon" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{i.name}</div>
                    <div className="text-sm text-muted" style={{ marginTop: 2 }}>{i.desc}</div>
                  </div>
                  {i.connected ? (
                    <span className="pill pill-checkedin"><Icon name="check" className="icon-sm" /> Connected</span>
                  ) : (
                    <span className="pill pill-tentative"><Icon name="alert" className="icon-sm" /> Needs setup</span>
                  )}
                  <button className="btn btn-sm">Manage</button>
                </div>
              ))}
            </div>
          </div>

          {property && (
            <div className="card card-padded">
              <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>Property &amp; GST</h3>
              <div className="kv-grid">
                <div className="kv"><div className="k">Name</div><div className="v">{property.name}</div></div>
                <div className="kv"><div className="k">Location</div><div className="v">{property.city}, {property.state}</div></div>
                <div className="kv"><div className="k">GSTIN</div><div className="v">{property.gstin ?? "Not registered"}</div></div>
                <div className="kv"><div className="k">SAC code</div><div className="v">{property.sacCode}</div></div>
                <div className="kv"><div className="k">Check-in / out</div><div className="v">{property.checkInTime} / {property.checkOutTime}</div></div>
                <div className="kv"><div className="k">Invoice prefix</div><div className="v">{property.invoicePrefix}</div></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
