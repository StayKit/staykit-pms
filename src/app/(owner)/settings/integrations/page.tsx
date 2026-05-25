import Link from "next/link";
import { isConfigured as razorpayConfigured } from "@/lib/payments/razorpay/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

interface Integration {
  name: string;
  desc: string;
  connected: boolean;
  icon: string;
  /** Env vars the operator sets to enable it (names only — values never shown). */
  env: string[];
  /** One-line setup note. */
  note: string;
  docs?: string;
}

export default function SettingsIntegrationsPage() {
  const razorpayMode = (process.env.RAZORPAY_MODE || "test") as "test" | "live";

  const integrations: Integration[] = [
    {
      name: "Razorpay",
      desc: "Payment links, refunds & webhooks",
      connected: razorpayConfigured(),
      icon: "credit-card",
      env:
        razorpayMode === "live"
          ? [
              "RAZORPAY_MODE=live",
              "RAZORPAY_KEY_ID_LIVE",
              "RAZORPAY_KEY_SECRET_LIVE",
              "RAZORPAY_WEBHOOK_SECRET_LIVE",
            ]
          : [
              "RAZORPAY_MODE=test",
              "RAZORPAY_KEY_ID_TEST",
              "RAZORPAY_KEY_SECRET_TEST",
              "RAZORPAY_WEBHOOK_SECRET_TEST",
            ],
      note: "Optional. StayKit is cash-first — online links switch on only after the keys verify against Razorpay. Until then every booking is collected manually.",
      docs: "https://razorpay.com/docs/payments/payment-links/",
    },
    {
      name: "MSG91 (SMS)",
      desc: "Transactional SMS with DLT IDs",
      connected: !!process.env.MSG91_AUTH_KEY,
      icon: "phone",
      env: ["MSG91_AUTH_KEY", "MSG91_SENDER_ID"],
      note: "Each SMS template also needs a DLT-approved dltTemplateId (set per template under Notifications).",
      docs: "https://msg91.com/help",
    },
    {
      name: "WhatsApp Business",
      desc: "Send confirmations & reminders",
      connected: !!process.env.MSG91_AUTH_KEY,
      icon: "message-circle",
      env: ["MSG91_AUTH_KEY"],
      note: "Delivered through MSG91. Each WhatsApp template needs an approved whatsappTemplateName.",
      docs: "https://msg91.com/whatsapp",
    },
    {
      name: "Resend (Email)",
      desc: "Transactional email",
      connected: !!process.env.RESEND_API_KEY,
      icon: "mail",
      env: ["RESEND_API_KEY", "EMAIL_FROM"],
      note: "Used for booking confirmations and GST invoices when an email is on file.",
      docs: "https://resend.com/docs",
    },
    {
      name: "Litestream",
      desc: "Automated SQLite backups to S3",
      connected: !!process.env.LITESTREAM_BUCKET,
      icon: "shield",
      env: [
        "LITESTREAM_ENDPOINT",
        "LITESTREAM_BUCKET",
        "LITESTREAM_ACCESS_KEY",
        "LITESTREAM_SECRET",
      ],
      note: "Streams the database to object storage so you can restore after a disk failure.",
      docs: "https://litestream.io/getting-started/",
    },
  ];

  const connected = integrations.filter((i) => i.connected).length;

  return (
    <>
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Integrations</h3>
        <div className="sub">
          StayKit reads provider credentials from the environment, so secrets never touch the
          database or the browser. Set the variables below, then restart.
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Connected services</h3>
          <div className="sub" style={{ marginLeft: "auto" }}>
            {connected} connected · {integrations.length - connected} need setup
          </div>
        </div>
        <div>
          {integrations.map((i) => (
            <details key={i.name} className="integration">
              <summary>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: "var(--surface-2)",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--ink-2)",
                    flex: "0 0 38px",
                  }}
                >
                  <Icon name={i.icon} className="icon" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{i.name}</div>
                  <div className="text-sm text-muted" style={{ marginTop: 2 }}>
                    {i.desc}
                  </div>
                </div>
                {i.connected ? (
                  <span className="pill pill-checkedin">
                    <Icon name="check" className="icon-sm" /> Connected
                  </span>
                ) : (
                  <span className="pill pill-tentative">
                    <Icon name="alert" className="icon-sm" /> Needs setup
                  </span>
                )}
                <span className="btn btn-sm integration-toggle">Manage</span>
              </summary>

              <div className="integration-body">
                <div style={{ color: "var(--ink-2)", lineHeight: 1.6 }}>{i.note}</div>
                <div style={{ marginTop: 10, fontWeight: 600, fontSize: 12 }}>
                  Environment variables
                </div>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {i.env.map((e) => (
                    <li
                      key={e}
                      style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, marginTop: 2 }}
                    >
                      {e}
                    </li>
                  ))}
                </ul>
                {i.docs && (
                  <a
                    href={i.docs}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm"
                    style={{ marginTop: 12 }}
                  >
                    <Icon name="external" className="icon-sm" /> Provider docs
                  </a>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="card card-padded">
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>Running without keys</h3>
        <p className="text-sm text-muted" style={{ margin: 0, lineHeight: 1.6 }}>
          Every integration is optional. With none configured, StayKit runs in mock mode: payments
          are collected manually (cash / UPI / bank), and SMS, WhatsApp and email are written to the
          server log instead of sent. Set the payment instructions guests see under{" "}
          <Link href="/settings/property">Property &amp; GST</Link>.
        </p>
      </div>
    </>
  );
}
