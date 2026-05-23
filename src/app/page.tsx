import Link from "next/link";
import { Icon } from "@/components/Icon";

export const metadata = {
  title: "StayKit — Run your homestay, not a spreadsheet",
  description:
    "Open-source, self-hostable booking & reservation management for Indian homestay owners. Manage bookings, send payment links, GST-ready — and let Claude do most of it for you.",
};

const FEATURES = [
  {
    icon: "calendar",
    title: "Tape-chart calendar",
    body: "The PMS view owners actually use — drag-free, colour-coded by payment status, multi-property tabs, double-booking impossible by design.",
  },
  {
    icon: "credit-card",
    title: "Razorpay payment links",
    body: "Collect remotely. One tap sends an SMS + WhatsApp + email link. Webhooks reconcile payments and fire receipts automatically.",
  },
  {
    icon: "sparkles",
    title: "MCP server for Claude.ai",
    body: "Connect StayKit as a custom connector and run your property in natural language. Every AI action is scoped, logged and reversible.",
  },
  {
    icon: "shield-check",
    title: "GST & compliance baked in",
    body: "5% / 18% GST by per-night value (SAC 996311), Form C reminders for foreign guests, and DPDP-ready consent & erasure.",
  },
  {
    icon: "phone",
    title: "OTP guest portal",
    body: "No passwords, no app. Guests enter their mobile, get a code, pay the balance and download their invoice.",
  },
  {
    icon: "globe",
    title: "Self-hostable & open-source",
    body: "Next.js + SQLite + Litestream on a ₹400/month VPS. AGPL-3.0. Migrate to Postgres with a one-line switch when you grow.",
  },
];

export default function LandingPage() {
  return (
    <>
      <nav className="mk-nav">
        <div className="mk-nav-inner">
          <Link href="/" className="brand">
            <span className="mark">S</span>
            <span>StayKit</span>
          </Link>
          <div className="links">
            <a href="#features">Features</a>
            <a href="#india">Built for India</a>
            <a href="#mcp">Claude / MCP</a>
            <a href="#opensource">Open source</a>
          </div>
          <div className="actions">
            <Link className="btn btn-sm" href="/signin">
              Sign in
            </Link>
            <Link className="btn btn-primary btn-sm" href="/dashboard">
              Try the demo
            </Link>
          </div>
        </div>
      </nav>

      <header className="mk">
        <div className="mk-hero">
          <span className="mk-eyebrow">
            <Icon name="sparkles" className="icon-sm" /> AI-native homestay manager
          </span>
          <h1>
            Run your homestay,
            <br />
            not a <span className="accent">spreadsheet.</span>
          </h1>
          <p className="lead">
            StayKit is the open-source booking system built for Indian homestay owners. Manage
            bookings, send payment links, stay GST-ready — and let Claude do most of it for you.
          </p>
          <div className="cta">
            <Link className="btn btn-accent btn-lg" href="/dashboard">
              See it in action <Icon name="arrow-right" className="icon-sm" />
            </Link>
            <Link className="btn btn-lg" href="/my">
              View the guest portal
            </Link>
          </div>
          <div className="trust">
            <span>
              🇮🇳 <b>Made for India</b> — GST, DLT SMS, Form C
            </span>
            <span>
              ⚡ <b>5-minute</b> self-host
            </span>
            <span>
              🤖 <b>MCP</b> for Claude.ai
            </span>
          </div>
        </div>
      </header>

      <section className="mk" id="features">
        <div className="mk-section">
          <h2>Everything a small property needs. Nothing it doesn&apos;t.</h2>
          <p className="sub">
            One screen showing who&apos;s arriving today and who hasn&apos;t paid yet. Manual
            channel attribution instead of brittle OTA sync. Calm, fast, and yours to host.
          </p>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <div className="feature" key={f.title}>
                <div className="ic">
                  <Icon name={f.icon} className="icon" />
                </div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mk" id="mcp">
        <div
          className="mk-section"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "center" }}
        >
          <div>
            <span className="mk-eyebrow">
              <Icon name="sparkles" className="icon-sm" /> The differentiator
            </span>
            <h2 style={{ marginTop: 16 }}>Manage your property from inside Claude.ai</h2>
            <p className="sub">
              &quot;Show me last week&apos;s RevPAR for both properties and draft a WhatsApp blast
              for guests who stayed in March.&quot; Claude calls your StayKit tools over a secure,
              OAuth-scoped MCP connection — and every action lands in an immutable audit log.
            </p>
            <div style={{ marginTop: 20 }}>
              <Link className="btn btn-primary" href="/assistant">
                <Icon name="external" className="icon-sm" /> See the MCP tools
              </Link>
            </div>
          </div>
          <div
            className="card card-padded"
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, lineHeight: 1.7 }}
          >
            <div style={{ color: "var(--muted)" }}># In Claude.ai → Connectors</div>
            <div>
              add connector <span style={{ color: "var(--brand)" }}>https://your-host/mcp</span>
            </div>
            <div style={{ marginTop: 10, color: "var(--muted)" }}># Then just ask:</div>
            <div>→ list_bookings(status: confirmed)</div>
            <div>→ get_kpis(range: 7d)</div>
            <div>→ create_payment_link(SK-CO2405)</div>
          </div>
        </div>
      </section>

      <section className="mk" id="opensource">
        <div className="mk-section">
          <h2>Open source, on your terms</h2>
          <p className="sub">
            AGPL-3.0 licensed. Run it on Coolify, Fly.io (region <code>bom</code>), Railway or plain
            Docker. SQLite + Litestream keeps it cheap and durable; switch to Postgres when you
            cross ~25 properties.
          </p>
          <div className="cta">
            <a
              className="btn btn-lg"
              href="https://github.com/staykit/staykit"
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="external" className="icon-sm" /> Star on GitHub
            </a>
            <Link className="btn btn-primary btn-lg" href="/dashboard">
              Open the demo workspace
            </Link>
          </div>
        </div>
      </section>

      <footer className="mk-footer">
        <div className="mk-footer-inner">
          <span style={{ fontWeight: 600, color: "var(--ink)" }}>StayKit</span>
          <span>· Open-source homestay PMS</span>
          <span style={{ marginLeft: "auto" }}>AGPL-3.0 · Made for India 🇮🇳</span>
        </div>
      </footer>
    </>
  );
}
