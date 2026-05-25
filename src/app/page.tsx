import Link from "next/link";
import { BrandGlyph } from "@/components/BrandGlyph";
import { LandingInteractivity } from "@/components/landing/LandingInteractivity";
import "./landing.css";

export const metadata = {
  title: "StayKit — Run your homestay, not a spreadsheet",
  description:
    "Open-source, self-hostable booking & reservation management for Indian homestay owners. Manage bookings, send Razorpay payment links, stay GST-ready — and run it all from Claude over MCP.",
};

const GH = "https://github.com/staykit/staykit";

/* ── tiny inline icons (match the design's stroke weights) ─────────── */
function ArrowRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function GitHubMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.29 9.42 7.86 10.96.58.11.79-.25.79-.55 0-.27-.01-1.16-.01-2.1-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.74.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.17 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.06.74.8 1.19 1.82 1.19 3.08 0 4.42-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14 0 1.55-.02 2.79-.02 3.17 0 .31.21.67.8.55C20.21 21.42 23.5 17.1 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

/* ── data ──────────────────────────────────────────────────────────── */
const FEATURES: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "Tape-chart calendar",
    body: "Every room, every booking, one screen. Colour-coded by payment status, multi-property tabs, week / 14-day / month views.",
    icon: (
      <>
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
  },
  {
    title: "Quick-add booking",
    body: "From “phone rang” to “booking saved” in under a minute — with a live price quote and availability check.",
    icon: <path d="M5 12h14M12 5v14" />,
  },
  {
    title: "Razorpay payment links",
    body: "Auto-generated, shared by SMS / WhatsApp / email, and reconciled by webhook. The booking turns green when they pay.",
    icon: (
      <>
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
      </>
    ),
  },
  {
    title: "Policy-based refunds",
    body: "Your cancellation policy calculates the refundable amount. Refunds run through Razorpay, with a confirmation step.",
    icon: (
      <>
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </>
    ),
  },
  {
    title: "Guest portal (OTP)",
    body: "Guests sign in with their mobile number — no passwords, no app. They view the stay, pay the balance, get the invoice.",
    icon: (
      <>
        <rect width="14" height="20" x="5" y="2" rx="2" />
        <path d="M12 18h.01" />
      </>
    ),
  },
  {
    title: "Rate plans",
    body: "Weekend, festival, peak and monsoon rates. Day-of-week masks, min / max stay rules, refundable or not.",
    icon: (
      <>
        <path d="M3 3v18h18" />
        <path d="m7 17 4-6 4 2 6-8" />
      </>
    ),
  },
  {
    title: "Maintenance blocks",
    body: "Renovating Cottage 3? Block it. The calendar and availability checks respect it everywhere.",
    icon: <path d="M14 4v10.5a4 4 0 1 1-4-4H20" />,
  },
  {
    title: "Multi-property",
    body: "One owner, many properties. Managers and staff are scoped to only the properties they're assigned.",
    icon: (
      <>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <path d="M9 22V12h6v10" />
      </>
    ),
  },
  {
    title: "Role-based access",
    body: "Owner, manager, and staff roles with sensible permissions. No more “everyone is admin.”",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 11h-6M19 8v6" />
      </>
    ),
  },
  {
    title: "Notifications, your way",
    body: "Templated email / SMS / WhatsApp with automation rules. Plug in your own MSG91, Gupshup or Resend account.",
    icon: (
      <>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </>
    ),
  },
  {
    title: "Reports for your CA",
    body: "Occupancy, ADR, RevPAR, channel source-mix and GST-ready figures — per property, any date range.",
    icon: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </>
    ),
  },
  {
    title: "Audit log",
    body: "Who did what, when — including every action the AI took, with arguments redacted and results recorded.",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </>
    ),
  },
];

const INDIA: {
  icon: string;
  warm?: boolean;
  h3: string;
  p: string;
  sample: string;
}[] = [
  {
    icon: "🧾",
    h3: "GST 5% / 18%, done right",
    p: "Auto-applies the correct slab from the per-night tariff (Notification 15/2025, effective Sep 2025). SAC 996311 default. CGST / SGST / IGST split by guest state.",
    sample: "CGST 9% · SGST 9% · ₹2,160",
  },
  {
    icon: "📋",
    warm: true,
    h3: "Form C reminders",
    p: "Foreign guest? StayKit flags the stay and reminds you to file with the FRRO — with the guest details ready to copy across.",
    sample: "FRRO · Form C · passport · due 6h",
  },
  {
    icon: "💳",
    h3: "Razorpay-native",
    p: "Payment links, UPI, instant refunds and webhook reconciliation. Not “international payments via Stripe.”",
    sample: "razorpay.com/l/staykit-r3k7z",
  },
  {
    icon: "📱",
    warm: true,
    h3: "DLT-ready SMS & WhatsApp",
    p: "Plug in your MSG91 / Gupshup / Resend account — StayKit stores the DLT template IDs and entity formatting and sends through it.",
    sample: "DLT-PE: 1701234567890 · MSG91",
  },
  {
    icon: "₹",
    h3: "₹ Indian formatting",
    p: "₹1,23,456 — not $1,234.56. DD/MM dates, IST by default, lakh–crore arithmetic throughout.",
    sample: "₹1,23,456.00 · 23/06/2026 · IST",
  },
  {
    icon: "🔐",
    warm: true,
    h3: "DPDP-ready by design",
    p: "Guest-consent tracking, encrypted ID storage and one-click data erasure — built to the DPDP Act 2023 and 2025 Rules.",
    sample: "consent ✓ · erase guest · audit-logged",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is StayKit really free if I self-host?",
    a: "Yes. AGPL-3.0, no open-core tricks, no feature flags. Every feature is in the open-source repo. If you can run Docker, you can run StayKit.",
  },
  {
    q: "Why is there no channel manager / OTA sync?",
    a: "Because it's a separate, much harder problem most homestay owners don't actually need. StayKit is built for direct bookings — phone, WhatsApp, Instagram, repeat guests. If 50%+ of your bookings come from OTAs, look at Djubo or Hostaway. You still tag each booking's channel manually so your source-mix reports stay accurate.",
  },
  {
    q: "How is the AI assistant different from a chatbot?",
    a: "A chatbot answers questions. StayKit exposes 36 tools over the Model Context Protocol, so Claude actually takes actions — creates bookings, sends payment links, processes refunds — with your permission, fully logged and reversible.",
  },
  {
    q: "Can the AI mess things up?",
    a: "Every AI action requires an OAuth scope you grant explicitly (15 of them). Destructive actions — refunds, cancellations, guest erasure — need a separate explicit confirmation. Every call lands in an immutable audit log, and you can revoke access in one click.",
  },
  {
    q: "What about my guest data — is it safe?",
    a: "Your data lives on your own servers (self-host) or, later, on Indian servers (cloud). Guest ID documents are encrypted at rest and we follow the DPDP Act 2023 and 2025 Rules — including consent tracking and one-click erasure.",
  },
  {
    q: "Do I need GST registration to use StayKit?",
    a: "No. If your turnover is under ₹20 lakh (₹10 lakh in HP, Uttarakhand and the North-East) you can use StayKit without a GSTIN. Your invoices stay ready for when you cross the threshold.",
  },
  {
    q: "Can I move over from a spreadsheet or another PMS?",
    a: "Yes — you can switch gradually: start logging new bookings in StayKit while you wind down the old tool. Because you self-host, your database is yours to import into and export from at any time.",
  },
  {
    q: "What if StayKit shuts down?",
    a: "It's open source and self-hostable — the code and your database are yours. You keep running it without us, indefinitely.",
  },
  {
    q: "Is there a hosted version I can just sign up for?",
    a: "Managed cloud hosting is on the way — join the waitlist below. Today, self-hosting is free and takes only a few minutes with Docker.",
  },
  {
    q: "What about the WhatsApp Business API?",
    a: "It's supported via providers like MSG91, Gupshup and Interakt. You bring an approved Meta Business account and pre-approved templates; StayKit sends through your provider.",
  },
];

export default function LandingPage() {
  return (
    <div className="lp">
      <LandingInteractivity />

      {/* ───────── NAV ───────── */}
      <nav className="nav" id="lp-nav">
        <div className="container nav-inner">
          <Link href="#top" className="brand">
            <span className="mark">
              <BrandGlyph />
            </span>
            <span>StayKit</span>
            <span className="tag">homestays · india</span>
          </Link>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#ai">AI</a>
            <a href="#india">India</a>
            <a href="#compare">Compare</a>
            <a href="#pricing">Pricing</a>
            <a href="#oss">Open source</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="nav-cta">
            <Link href="/signin" className="btn btn-ghost btn-sm">
              Sign in
            </Link>
            <Link href="/dashboard" className="btn btn-primary btn-sm">
              Try the demo
            </Link>
          </div>
        </div>
      </nav>

      {/* ───────── HERO ───────── */}
      <section className="hero" id="top">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="dot" />
              New · AI-native homestay manager
            </span>
            <h1>
              Run your homestay,
              <br />
              not a <span className="accent">spreadsheet.</span>
            </h1>
            <p className="lede">
              StayKit is the open-source booking system built for Indian homestay owners. Manage
              bookings, send payment links, stay GST-ready — and{" "}
              <strong style={{ color: "var(--ink)" }}>run it all from Claude.</strong>
            </p>
            <div className="hero-ctas">
              <Link href="/dashboard" className="btn btn-accent btn-lg">
                See the live demo
                <ArrowRight />
              </Link>
              <a href="#oss" className="btn btn-lg">
                Self-host in minutes
              </a>
            </div>
            <a href="#demo" className="text-link" style={{ marginTop: 18, display: "inline-flex" }}>
              See it in action ↓
            </a>

            <div className="hero-trust">
              <span className="item">
                🇮🇳 <span className="em">Made for India</span>
              </span>
              <span className="item">
                ⚡ <span className="em">Self-host in minutes</span>
              </span>
              <span className="item">
                🔓 <span className="em">AGPL open source</span>
              </span>
              <span className="item">
                🤖 <span className="em">MCP / Claude-native</span>
              </span>
            </div>
          </div>

          {/* Hero animated stage */}
          <div className="hero-stage" aria-hidden="true">
            <div className="stage-top">
              <span className="dot a" />
              <span className="dot b" />
              <span className="dot c" />
              <span className="title">Riverbend Cottages · June 12 — June 18</span>
              <span className="badge">LIVE</span>
            </div>

            <div className="mini-tape">
              <div className="mini-days">
                <div />
                <div className="head">
                  Wed<span className="dnum">11</span>
                </div>
                <div className="head today">
                  Thu<span className="dnum">12</span>
                </div>
                <div className="head">
                  Fri<span className="dnum">13</span>
                </div>
                <div className="head">
                  Sat<span className="dnum">14</span>
                </div>
                <div className="head">
                  Sun<span className="dnum">15</span>
                </div>
                <div className="head">
                  Mon<span className="dnum">16</span>
                </div>
                <div className="head">
                  Tue<span className="dnum">17</span>
                </div>
              </div>

              <div className="mini-row">
                <div className="room-label">
                  <span className="swatch" />
                  Cottage 1
                </div>
                <div className="cell" />
                <div className="cell" />
                <div className="cell" />
                <div className="cell wkn" />
                <div className="cell wkn" />
                <div className="cell" />
                <div className="cell" />
                <div
                  className="booking bb-green"
                  style={{
                    left: "calc(84px + 6px)",
                    width: "calc((100% - 84px) / 7 * 1.95)",
                    top: 38,
                  }}
                >
                  Amit P.
                  <span
                    style={{
                      marginLeft: "auto",
                      opacity: 0.85,
                      fontWeight: 500,
                      fontSize: 11,
                    }}
                  >
                    2N
                  </span>
                </div>
              </div>

              <div className="mini-row">
                <div className="room-label">
                  <span className="swatch" style={{ background: "var(--accent-soft)" }} />
                  Cottage 2
                </div>
                <div className="cell" />
                <div className="cell" />
                <div className="cell" />
                <div className="cell wkn" />
                <div className="cell wkn" />
                <div className="cell" />
                <div className="cell" />
                <div
                  className="booking bb-teal"
                  style={{
                    left: "calc(84px + 6px + (100% - 84px) / 7 * 0.4)",
                    width: "calc((100% - 84px) / 7 * 2.55)",
                    top: 38,
                  }}
                >
                  Priya R.
                  <span
                    style={{
                      marginLeft: "auto",
                      opacity: 0.85,
                      fontWeight: 500,
                      fontSize: 11,
                    }}
                  >
                    3N
                  </span>
                </div>
              </div>

              <div className="mini-row" id="hero-anim-row">
                <div className="room-label">
                  <span className="swatch" style={{ background: "#FBE6DF" }} />
                  Cottage 3
                </div>
                <div className="cell" />
                <div className="cell" />
                <div className="cell" />
                <div className="cell wkn" />
                <div className="cell wkn" />
                <div className="cell" />
                <div className="cell" />
                <div
                  className="booking bb-coral animate"
                  id="hero-bar"
                  style={{
                    left: "calc(84px + 6px + (100% - 84px) / 7 * 1)",
                    width: "calc((100% - 84px) / 7 * 2)",
                    top: 38,
                    position: "absolute",
                  }}
                >
                  <span className="bb-tick">●</span>
                  Sameer K. · 12–14
                  <span
                    style={{
                      marginLeft: "auto",
                      opacity: 0.85,
                      fontWeight: 500,
                      fontSize: 11,
                    }}
                  >
                    2N
                  </span>
                </div>
              </div>

              <div className="mini-row">
                <div className="room-label">
                  <span className="swatch" style={{ background: "var(--cream-2)" }} />
                  Suite 1
                </div>
                <div className="cell" />
                <div className="cell" />
                <div className="cell" />
                <div className="cell wkn" />
                <div className="cell wkn" />
                <div className="cell" />
                <div className="cell" />
                <div
                  className="booking bb-amber"
                  style={{
                    left: "calc(84px + 6px + (100% - 84px) / 7 * 3)",
                    width: "calc((100% - 84px) / 7 * 1.85)",
                    top: 38,
                  }}
                >
                  Walk-in
                  <span
                    style={{
                      marginLeft: "auto",
                      opacity: 0.85,
                      fontWeight: 500,
                      fontSize: 11,
                    }}
                  >
                    hold
                  </span>
                </div>
              </div>
            </div>

            {/* Status flip pill */}
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                pointerEvents: "none",
              }}
            >
              <div style={{ position: "relative", width: 80, height: 22 }}>
                <span className="status-flip unpaid" style={{ left: 0, top: 0 }}>
                  <span className="swatch" />
                  Unpaid
                </span>
                <span className="status-flip paid" style={{ left: 0, top: 0 }}>
                  <span className="swatch" />
                  Paid
                </span>
              </div>
            </div>

            {/* Claude bubble overlay */}
            <div className="hero-overlay claude-bubble">
              <div className="head">
                <span className="avatar">C</span>
                <span>Claude</span>
                <span className="tag">via MCP</span>
              </div>
              <div className="quote">
                “Send Sameer his <em>payment link</em> and check-in instructions.”
              </div>
            </div>

            {/* WhatsApp message overlay */}
            <div className="hero-overlay wa-card">
              <div className="head">
                <span className="dot">W</span>
                <span>WhatsApp · to Sameer K.</span>
              </div>
              <div className="msg">
                Hi Sameer! Welcome to Riverbend Cottages. Your stay is confirmed for June 12–14.
              </div>
              <div className="link">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 9V5a3 3 0 0 0-6 0v4" />
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                </svg>
                Pay <span className="money">₹4,500</span> via Razorpay
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── 3-SECOND PROOF ───────── */}
      <section className="proof" id="demo">
        <div className="container">
          <div className="proof-caption">
            <div className="eyebrow dim">
              <span className="dot" />
              The 3-second proof
            </div>
            <h2 className="head" style={{ marginTop: 14 }}>
              One screen. Every booking. Every property.
            </h2>
            <p className="sub">
              <em>No tabs. No tickets. No dashboards within dashboards.</em>
            </p>
          </div>

          <div className="tape-mock">
            <div className="tape-toolbar">
              <div className="toolbar-title">
                Calendar <span className="sub">· June 2026 · 8 rooms</span>
              </div>
              <div className="seg">
                <button>Day</button>
                <button className="active">Week</button>
                <button>Month</button>
              </div>
              <div className="toolbar-right">
                <span className="eyebrow dim" style={{ fontSize: 10.5 }}>
                  82% occupancy
                </span>
                <a className="btn btn-sm" href="#top">
                  + Booking
                </a>
              </div>
            </div>

            <div className="tape-grid-mock">
              <div className="corner">Room</div>
              <div className="col-head">
                Mon<span className="dnum">8</span>
              </div>
              <div className="col-head">
                Tue<span className="dnum">9</span>
              </div>
              <div className="col-head">
                Wed<span className="dnum">10</span>
              </div>
              <div className="col-head">
                Thu<span className="dnum">11</span>
              </div>
              <div className="col-head today">
                Fri<span className="dnum">12</span>
              </div>
              <div className="col-head wkn">
                Sat<span className="dnum">13</span>
              </div>
              <div className="col-head wkn">
                Sun<span className="dnum">14</span>
              </div>
              <div className="col-head">
                Mon<span className="dnum">15</span>
              </div>
              <div className="col-head">
                Tue<span className="dnum">16</span>
              </div>
              <div className="col-head">
                Wed<span className="dnum">17</span>
              </div>

              <div className="row">
                <div className="room">
                  <span className="num">101</span>
                  <span className="type">Cottage</span>
                  <span className="clean" />
                </div>
                <div className="cell" />
                <div className="cell">
                  <div
                    className="bar"
                    style={{
                      left: "50%",
                      right: "-205%",
                      background: "linear-gradient(180deg,#4D6E96,#3D5A80)",
                    }}
                  >
                    <span className="badge">✓</span>Sameer K. · 2A
                    <span
                      style={{
                        marginLeft: "auto",
                        opacity: 0.85,
                        fontWeight: 500,
                        fontSize: 11,
                      }}
                    >
                      ₹4,500
                    </span>
                  </div>
                </div>
                <div className="cell" />
                <div className="cell" />
                <div className="cell today-col" />
                <div className="cell wkn" />
                <div className="cell wkn">
                  <div
                    className="bar"
                    style={{
                      left: "50%",
                      right: "-205%",
                      background: "linear-gradient(180deg,#6BA288,#4F8F73)",
                    }}
                  >
                    <span className="badge">✓</span>Mehta family · 4A
                    <span
                      style={{
                        marginLeft: "auto",
                        opacity: 0.85,
                        fontWeight: 500,
                        fontSize: 11,
                      }}
                    >
                      ₹13,200
                    </span>
                  </div>
                </div>
                <div className="cell" />
                <div className="cell" />
                <div className="cell" />
              </div>

              <div className="row">
                <div className="room">
                  <span className="num">102</span>
                  <span className="type">Cottage</span>
                  <span className="clean dirty" />
                </div>
                <div className="cell">
                  <div
                    className="bar"
                    style={{
                      left: "30%",
                      right: "-310%",
                      background: "linear-gradient(180deg,#E4B768,#D8A33D)",
                      color: "#3D2B05",
                    }}
                  >
                    <span className="badge" style={{ background: "rgba(0,0,0,.12)" }}>
                      ⏳
                    </span>
                    Rohit M. (Tentative)
                    <span
                      style={{
                        marginLeft: "auto",
                        opacity: 0.7,
                        fontWeight: 500,
                        fontSize: 11,
                      }}
                    >
                      hold to 5pm
                    </span>
                  </div>
                </div>
                <div className="cell" />
                <div className="cell" />
                <div className="cell" />
                <div className="cell today-col" />
                <div className="cell wkn" />
                <div className="cell wkn" />
                <div className="cell">
                  <div
                    className="bar"
                    style={{
                      left: "30%",
                      right: "-110%",
                      background: "linear-gradient(180deg,#D86A52,#C8553D)",
                    }}
                  >
                    <span className="badge">!</span>Anita J. · 2A
                    <span
                      style={{
                        marginLeft: "auto",
                        opacity: 0.85,
                        fontWeight: 500,
                        fontSize: 11,
                      }}
                    >
                      unpaid
                    </span>
                  </div>
                </div>
                <div className="cell" />
                <div className="cell" />
              </div>

              <div className="row">
                <div className="room">
                  <span className="num">103</span>
                  <span className="type">Cottage</span>
                  <span className="clean" />
                </div>
                <div className="cell" />
                <div className="cell" />
                <div className="cell">
                  <div
                    className="bar"
                    style={{
                      left: "50%",
                      right: "-410%",
                      background:
                        "repeating-linear-gradient(135deg,#C9C6D2 0 6px,#B7B3C2 6px 12px)",
                      color: "#3F3A4F",
                      boxShadow: "none",
                    }}
                  >
                    Maintenance · paint
                  </div>
                </div>
                <div className="cell" />
                <div className="cell" />
                <div className="cell today-col" />
                <div className="cell wkn" />
                <div className="cell wkn" />
                <div className="cell">
                  <div
                    className="bar"
                    style={{
                      left: "30%",
                      right: "-110%",
                      background: "linear-gradient(180deg,#6BA288,#4F8F73)",
                    }}
                  >
                    <span className="badge">✓</span>K. Iyer · 2A
                    <span
                      style={{
                        marginLeft: "auto",
                        opacity: 0.85,
                        fontWeight: 500,
                        fontSize: 11,
                      }}
                    >
                      ₹7,800
                    </span>
                  </div>
                </div>
                <div className="cell" />
              </div>

              <div className="row">
                <div className="room">
                  <span className="num">201</span>
                  <span className="type">Suite</span>
                  <span className="clean" />
                </div>
                <div className="cell">
                  <div
                    className="bar"
                    style={{
                      left: "30%",
                      right: "-510%",
                      background: "linear-gradient(180deg,#4D6E96,#3D5A80)",
                    }}
                  >
                    <span className="badge">✓</span>Banerjee · 4A · 2C
                    <span
                      style={{
                        marginLeft: "auto",
                        opacity: 0.85,
                        fontWeight: 500,
                        fontSize: 11,
                      }}
                    >
                      ₹22,400
                    </span>
                  </div>
                </div>
                <div className="cell" />
                <div className="cell" />
                <div className="cell" />
                <div className="cell" />
                <div className="cell today-col" />
                <div className="cell wkn" />
                <div className="cell wkn" />
                <div className="cell" />
                <div className="cell">
                  <div
                    className="bar"
                    style={{
                      left: "30%",
                      right: "-110%",
                      background: "linear-gradient(180deg,#8A7BB4,#6B5D8A)",
                    }}
                  >
                    <span className="badge">★</span>Owner block
                    <span
                      style={{
                        marginLeft: "auto",
                        opacity: 0.85,
                        fontWeight: 500,
                        fontSize: 11,
                      }}
                    >
                      family
                    </span>
                  </div>
                </div>
              </div>

              <div className="row">
                <div className="room">
                  <span className="num">202</span>
                  <span className="type">Suite</span>
                  <span className="clean" />
                </div>
                <div className="cell" />
                <div className="cell" />
                <div className="cell">
                  <div
                    className="bar"
                    style={{
                      left: "50%",
                      right: "-205%",
                      background: "linear-gradient(180deg,#E4B768,#D8A33D)",
                      color: "#3D2B05",
                    }}
                  >
                    <span className="badge" style={{ background: "rgba(0,0,0,.12)" }}>
                      ½
                    </span>
                    S. Reddy
                    <span
                      style={{
                        marginLeft: "auto",
                        opacity: 0.75,
                        fontWeight: 500,
                        fontSize: 11,
                      }}
                    >
                      50% paid
                    </span>
                  </div>
                </div>
                <div className="cell" />
                <div className="cell today-col" />
                <div className="cell wkn" />
                <div className="cell wkn">
                  <div
                    className="bar"
                    style={{
                      left: "50%",
                      right: "-310%",
                      background: "linear-gradient(180deg,#4D6E96,#3D5A80)",
                    }}
                  >
                    <span className="badge">✓</span>Khanna · 2A
                    <span
                      style={{
                        marginLeft: "auto",
                        opacity: 0.85,
                        fontWeight: 500,
                        fontSize: 11,
                      }}
                    >
                      ₹16,200
                    </span>
                  </div>
                </div>
                <div className="cell" />
                <div className="cell" />
                <div className="cell" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── PROBLEM ───────── */}
      <section className="section">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow warm">
              <span className="dot" />
              If this sounds familiar…
            </div>
            <h2 className="h2" style={{ marginTop: 14 }}>
              Running a homestay shouldn&apos;t feel like running 4 jobs.
            </h2>
          </div>

          <div className="problem-grid">
            <article className="problem-card">
              <div className="icon-wrap">💬</div>
              <p className="quote">Wait, did Mr. Sharma book the 12th or the 13th?</p>
              <p className="imp">
                You&apos;re searching three different WhatsApp chats to confirm one booking.
              </p>
            </article>
            <article className="problem-card">
              <div className="icon-wrap">📞</div>
              <p className="quote">Sorry sir, that room is actually taken.</p>
              <p className="imp">The most expensive sentence in hospitality.</p>
            </article>
            <article className="problem-card">
              <div className="icon-wrap">🧾</div>
              <p className="quote">My CA needs all the March invoices by Tuesday.</p>
              <p className="imp">You&apos;re at the property. The register is at home.</p>
            </article>
          </div>

          <p className="problem-closer">
            Most homestay software was built for hotel chains.{" "}
            <span className="em">StayKit was built for you.</span>
          </p>
        </div>
      </section>

      {/* ───────── SOLUTION ───────── */}
      <section className="section bg-cream">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow">
              <span className="dot" />
              The 90-second walkthrough
            </div>
            <h2 className="h2" style={{ marginTop: 14 }}>
              Four things StayKit does, before anything else.
            </h2>
          </div>

          <div className="steps-grid">
            <article className="step-card">
              <div className="step-visual">
                <div className="step-vis-tape">
                  <div />
                  <div className="h">Mo</div>
                  <div className="h">Tu</div>
                  <div className="h">We</div>
                  <div className="h">Th</div>
                  <div className="h">Fr</div>
                  <div className="h">Sa</div>
                  <div className="lbl">101</div>
                  <div className="c" />
                  <div className="b" style={{ gridColumn: "span 2" }}>
                    Sameer · 2N
                  </div>
                  <div className="c" />
                  <div className="c" />
                  <div className="c" />
                  <div className="lbl">102</div>
                  <div className="c" />
                  <div className="c" />
                  <div className="b green" style={{ gridColumn: "span 3" }}>
                    Mehta family · 3N
                  </div>
                  <div className="c" />
                  <div className="lbl">103</div>
                  <div className="b amber" style={{ gridColumn: "span 2" }}>
                    Tentative
                  </div>
                  <div className="c" />
                  <div className="c" />
                  <div className="b coral" style={{ gridColumn: "span 2" }}>
                    Anita · unpaid
                  </div>
                </div>
              </div>
              <div className="step-body">
                <span className="step-num">1</span>
                <h3>See everything at once.</h3>
                <p className="desc">
                  A clean tape chart showing all your rooms and bookings in one calendar. Click an
                  empty cell to book; open a booking to manage it.
                </p>
              </div>
            </article>

            <article className="step-card">
              <div className="step-visual">
                <div className="step-vis-pay">
                  <div className="pay-phone">
                    <div className="head">
                      <span className="dot">W</span> WhatsApp · to Anita J.
                    </div>
                    <div className="bubble">
                      Hi Anita! Pay ₹2,200 for your stay at Riverbend (June 14–15). Tap to pay 👇
                    </div>
                    <div className="link">💳 Pay ₹2,200 via Razorpay</div>
                    <div className="paid-badge">● Paid · 2 mins ago</div>
                  </div>
                </div>
              </div>
              <div className="step-body">
                <span className="step-num">2</span>
                <h3>Get paid without chasing.</h3>
                <p className="desc">
                  One tap creates a Razorpay payment link and shares it by SMS, WhatsApp or email.
                  When they pay, the webhook turns the booking green automatically.
                </p>
              </div>
            </article>

            <article className="step-card">
              <div className="step-visual">
                <div className="step-vis-msg">
                  <div className="msg-line">
                    <span className="when">T-7 days</span>
                    <span className="pill">WhatsApp</span>
                    <span className="body">Confirmation + directions</span>
                    <span className="check">✓</span>
                  </div>
                  <div className="msg-line">
                    <span className="when">T-1 day</span>
                    <span className="pill sms">SMS · DLT</span>
                    <span className="body">Reminder</span>
                    <span className="check">✓</span>
                  </div>
                  <div className="msg-line">
                    <span className="when">Check-in</span>
                    <span className="pill">WhatsApp</span>
                    <span className="body">Wifi + house rules</span>
                    <span className="check">✓</span>
                  </div>
                  <div className="msg-line">
                    <span className="when">T+1 day</span>
                    <span className="pill email">Email</span>
                    <span className="body">Thank-you + review link</span>
                    <span className="check">✓</span>
                  </div>
                </div>
              </div>
              <div className="step-body">
                <span className="step-num">3</span>
                <h3>Send the right message at the right time.</h3>
                <p className="desc">
                  Confirmation, day-before reminder, check-in instructions, thank-you note. Build
                  the templates and automation once — StayKit fires them through your provider.
                </p>
              </div>
            </article>

            <article className="step-card">
              <div className="step-visual">
                <div className="step-vis-claude">
                  <div className="cmsg user">
                    Show me this weekend&apos;s arrivals and remind the unpaid ones.
                  </div>
                  <div className="cmsg">
                    <div className="row" style={{ marginBottom: 4 }}>
                      <span className="check">✓</span> Done. 5 arrivals this weekend.
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: 11 }}>
                      Reminded 2 unpaid (Anita, Rohit) via their payment links.
                    </div>
                  </div>
                </div>
              </div>
              <div className="step-body">
                <span className="step-num">4</span>
                <h3>Ask Claude to do the rest.</h3>
                <p className="desc">
                  “Show me this weekend&apos;s arrivals and remind the unpaid ones.” Done — in plain
                  English, in the AI assistant of your choice.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ───────── AI MOAT ───────── */}
      <section className="ai-section" id="ai">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow warm">
              <span className="dot" />
              The wedge
            </div>
            <h2 className="h2" style={{ marginTop: 14 }}>
              The first homestay manager built{" "}
              <em
                style={{
                  fontStyle: "italic",
                  color: "var(--accent)",
                  fontWeight: 500,
                }}
              >
                for AI.
              </em>
            </h2>
            <p className="lede">
              StayKit ships a Model Context Protocol server — 36 tools across 15 OAuth scopes.
              Connect it to Claude (or any MCP-compatible assistant) and it doesn&apos;t just chat —
              it takes action, with your permission.
            </p>
          </div>

          <div className="laptop-mockup">
            <div className="laptop-screen">
              <div className="laptop-bar">
                <span className="dot a" />
                <span className="dot b" />
                <span className="dot c" />
                <span className="url">claude.ai/chat/staykit-riverbend</span>
              </div>

              <div className="claude-app">
                <aside className="claude-side">
                  <a href="#ai" className="brand">
                    <span className="mark">C</span>
                    <span>Claude</span>
                  </a>
                  <div className="sect">Conversations</div>
                  <div className="item active">💬 Today&apos;s arrivals</div>
                  <div className="item">Weekly revenue review</div>
                  <div className="item">Unpaid this weekend</div>
                  <div className="item">Refund — Mr. Verma</div>
                  <div className="sect">Connectors</div>
                  <div className="claude-mcp">
                    <div className="lbl">
                      <span className="pulse" />
                      MCP connected
                    </div>
                    <div className="name">StayKit · Riverbend</div>
                    <div className="desc">36 tools · 15 scopes · read, payments, compliance</div>
                  </div>
                </aside>

                <main className="claude-main">
                  <div className="claude-msg user">
                    Anyone arriving today who hasn&apos;t paid yet?
                  </div>

                  <div className="claude-msg bot">
                    <div className="head">
                      <span className="a">C</span>
                      <span>Claude</span>
                      <span className="badge">staykit · list_bookings</span>
                    </div>
                    <div>Two arrivals today have outstanding balances:</div>
                    <ul>
                      <li>
                        <span>
                          <span className="name">Rohit Mehta</span> · Cottage 2
                        </span>
                        <span className="due">₹4,500 due</span>
                      </li>
                      <li>
                        <span>
                          <span className="name">Anita Joshi</span> · Suite 1
                        </span>
                        <span className="due">₹2,200 due</span>
                      </li>
                    </ul>
                    <div className="ask">Should I send them both payment links?</div>
                  </div>

                  <div className="claude-msg user">Yes, and remind them about check-in time.</div>

                  <div className="claude-msg bot">
                    <div className="head">
                      <span className="a">C</span>
                      <span>Claude</span>
                      <span className="badge">
                        staykit · create_payment_link · send_notification
                      </span>
                    </div>
                    <div>
                      Done. Payment links sent to both, with the 2 PM check-in note. I&apos;ll let
                      you know when they pay.
                    </div>
                    <div className="tool">● 4 actions logged · audit trail saved</div>
                  </div>

                  <div className="claude-input">
                    <span style={{ flex: 1 }}>Reply to Claude…</span>
                    <span className="send">↑</span>
                  </div>
                </main>
              </div>
            </div>
            <div className="laptop-base" />
          </div>

          <div className="ai-pills">
            <div className="ai-pill">
              <h4>
                <span className="em">🔐</span>You stay in control
              </h4>
              <p>
                Every AI action is scope-limited and lands in an immutable audit log. Revoke the
                connection in one click.
              </p>
            </div>
            <div className="ai-pill">
              <h4>
                <span className="em">🎯</span>Built on the open MCP standard
              </h4>
              <p>
                Works with Claude today — and any MCP-compatible assistant tomorrow. Not a closed,
                bolted-on chatbot.
              </p>
            </div>
            <div className="ai-pill">
              <h4>
                <span className="em">🛡️</span>Destructive actions need consent
              </h4>
              <p>
                Refunds, cancellations and guest erasure require a separate, explicit confirmation
                before they run.
              </p>
            </div>
          </div>

          <p className="mcp-footer">
            Built on the <a href="https://modelcontextprotocol.io">Model Context Protocol</a> — the
            open standard introduced by Anthropic.
          </p>
        </div>
      </section>

      {/* ───────── INDIA ───────── */}
      <section className="section" id="india">
        <div className="container india-head">
          <div className="head-flex">
            <div style={{ maxWidth: 600 }}>
              <div className="eyebrow">
                <span className="dot" />
                Made here, made for here
              </div>
              <h2 className="h2" style={{ marginTop: 14 }}>
                Not “available in India.”
                <br />
                <em
                  style={{
                    fontStyle: "normal",
                    color: "var(--brand)",
                  }}
                >
                  Built in India, for India.
                </em>
              </h2>
            </div>
            <p className="lede" style={{ maxWidth: 380 }}>
              GST, Form C, Razorpay, DLT, DPDP — out of the box. No plugins, no “international
              version,” no workarounds.
            </p>
          </div>

          <div className="india-grid">
            {INDIA.map((c) => (
              <article key={c.h3} className={c.warm ? "india-card warm" : "india-card"}>
                <div className="icon">{c.icon}</div>
                <h3>{c.h3}</h3>
                <p>{c.p}</p>
                <span className="sample">{c.sample}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── FEATURES ───────── */}
      <section className="section bg-cream" id="features">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow dim">
              <span className="dot" />
              The toolkit
            </div>
            <h2 className="h2" style={{ marginTop: 14 }}>
              Everything you need. Nothing you don&apos;t.
            </h2>
            <p className="lede">
              Twelve features that cover what a homestay owner actually does in a day.
            </p>
          </div>

          <div className="feature-grid">
            {FEATURES.map((f) => (
              <article className="feat-card" key={f.title}>
                <div className="icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {f.icon}
                  </svg>
                </div>
                <h4>{f.title}</h4>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── COMPARISON ───────── */}
      <section className="section" id="compare">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow">
              <span className="dot" />
              Honest comparison
            </div>
            <h2 className="h2" style={{ marginTop: 14 }}>
              How StayKit stacks up.
            </h2>
            <p className="lede" style={{ fontStyle: "italic", color: "var(--muted)" }}>
              We list where the competition wins, too.
            </p>
          </div>

          <div className="compare-wrap">
            <table className="compare">
              <thead>
                <tr>
                  <th className="label-col" />
                  <th className="us">
                    <span className="tagline">Us</span>
                    StayKit
                  </th>
                  <th>
                    <span className="competitor">Djubo</span>
                    <span className="small">India · PMS</span>
                  </th>
                  <th>
                    <span className="competitor">Qloapps</span>
                    <span className="small">OSS · generic</span>
                  </th>
                  <th>
                    <span className="competitor">Hostaway</span>
                    <span className="small">US · vacation rentals</span>
                  </th>
                  <th>
                    <span className="competitor">WhatsApp + Sheets</span>
                    <span className="small">DIY</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="label">Starting price (India)</td>
                  <td className="us">
                    <span className="cmp-em">₹0 self-host</span>
                  </td>
                  <td>~₹5,000/mo</td>
                  <td>Free</td>
                  <td>
                    ~$45/mo
                    <br />
                    <span style={{ color: "var(--muted)", fontSize: 11.5 }}>(₹3,800)</span>
                  </td>
                  <td>Free</td>
                </tr>
                <tr>
                  <td className="label">Open source</td>
                  <td className="us">
                    <span className="cmp-yes"> AGPL</span>
                  </td>
                  <td>
                    <span className="cmp-no" />
                  </td>
                  <td>
                    <span className="cmp-yes" />
                  </td>
                  <td>
                    <span className="cmp-no" />
                  </td>
                  <td>—</td>
                </tr>
                <tr>
                  <td className="label">Self-hostable</td>
                  <td className="us">
                    <span className="cmp-yes" />
                  </td>
                  <td>
                    <span className="cmp-no" />
                  </td>
                  <td>
                    <span className="cmp-yes" />
                  </td>
                  <td>
                    <span className="cmp-no" />
                  </td>
                  <td>—</td>
                </tr>
                <tr>
                  <td className="label">AI assistant (MCP)</td>
                  <td className="us">
                    <span className="cmp-yes"> Native</span>
                  </td>
                  <td>
                    <span className="cmp-no">
                      <span className="qual">Chatbot only</span>
                    </span>
                  </td>
                  <td>
                    <span className="cmp-no" />
                  </td>
                  <td>
                    <span className="cmp-no">
                      <span className="qual">Chatbot only</span>
                    </span>
                  </td>
                  <td>
                    <span className="cmp-no" />
                  </td>
                </tr>
                <tr>
                  <td className="label">AI-action audit log</td>
                  <td className="us">
                    <span className="cmp-yes"> Native</span>
                  </td>
                  <td>
                    <span className="cmp-no" />
                  </td>
                  <td>
                    <span className="cmp-no" />
                  </td>
                  <td>
                    <span className="cmp-no" />
                  </td>
                  <td>
                    <span className="cmp-no" />
                  </td>
                </tr>
                <tr>
                  <td className="label">India-tuned (GST, Form C, DLT)</td>
                  <td className="us">
                    <span className="cmp-yes"> Native</span>
                  </td>
                  <td>
                    <span className="cmp-yes" />
                  </td>
                  <td>
                    <span className="cmp-no">
                      <span className="qual">Generic</span>
                    </span>
                  </td>
                  <td>
                    <span className="cmp-no">
                      <span className="qual">Generic</span>
                    </span>
                  </td>
                  <td>
                    <span className="cmp-no">
                      <span className="qual">Manual</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="label">Razorpay-native</td>
                  <td className="us">
                    <span className="cmp-yes" />
                  </td>
                  <td>
                    <span className="cmp-yes" />
                  </td>
                  <td>
                    <span className="cmp-warn">
                      <span className="qual">Plugin</span>
                    </span>
                  </td>
                  <td>
                    <span className="cmp-warn" />
                  </td>
                  <td>
                    <span className="cmp-warn">
                      <span className="qual">Manual</span>
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="label">Channel manager (OTA sync)</td>
                  <td className="us">
                    <span className="cmp-no" style={{ color: "var(--muted)" }}>
                      <span className="qual" style={{ fontStyle: "italic" }}>
                        by design
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="cmp-yes" />
                  </td>
                  <td>
                    <span className="cmp-warn">
                      <span className="qual">Plugin</span>
                    </span>
                  </td>
                  <td>
                    <span className="cmp-yes" />
                  </td>
                  <td>
                    <span className="cmp-no" />
                  </td>
                </tr>
                <tr>
                  <td className="label">Setup time</td>
                  <td className="us">
                    <span className="cmp-em">Minutes</span>
                  </td>
                  <td>1–3 weeks</td>
                  <td>Days</td>
                  <td>1 week</td>
                  <td>0 min</td>
                </tr>
                <tr>
                  <td className="label">For non-tech owners</td>
                  <td className="us">
                    <span className="cmp-yes" />
                  </td>
                  <td>
                    <span className="cmp-warn">
                      <span className="qual">Steep</span>
                    </span>
                  </td>
                  <td>
                    <span className="cmp-no">
                      <span className="qual">Cluttered</span>
                    </span>
                  </td>
                  <td>
                    <span className="cmp-warn">
                      <span className="qual">Complex</span>
                    </span>
                  </td>
                  <td>
                    <span className="cmp-yes" />
                  </td>
                </tr>
                <tr>
                  <td className="label">Your data stays yours</td>
                  <td className="us">
                    <span className="cmp-yes"> Self-host</span>
                  </td>
                  <td>
                    <span className="cmp-warn" />
                  </td>
                  <td>
                    <span className="cmp-yes" />
                  </td>
                  <td>
                    <span className="cmp-warn" />
                  </td>
                  <td>
                    <span className="cmp-yes" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="compare-caption">
            <strong>Where competitors win:</strong> Djubo and Hostaway have channel managers that
            auto-sync your inventory to Airbnb, Booking.com and MakeMyTrip. If 50%+ of your bookings
            come through OTAs, they&apos;re the better choice.{" "}
            <strong>StayKit is built for owners who take bookings directly</strong> — by phone,
            WhatsApp, Instagram, or from repeat guests.
          </div>
        </div>
      </section>

      {/* ───────── OPEN SOURCE ───────── */}
      <section className="section bg-cream" id="oss">
        <div className="container oss-grid">
          <div>
            <div className="eyebrow">
              <span className="dot" />
              For the technical owner
            </div>
            <h2 className="h2" style={{ marginTop: 14 }}>
              Or run it yourself.
              <br />
              We don&apos;t mind.
            </h2>
            <p className="lede" style={{ marginTop: 18 }}>
              StayKit is fully open source under AGPL-3.0. Self-host it on your own server, a
              ₹400/month VPS, or a home Mac mini — we don&apos;t care, and we don&apos;t charge.
            </p>

            <ul className="oss-list">
              <li>
                <span className="check">✓</span>
                <span>
                  <strong style={{ color: "var(--ink)", fontWeight: 600 }}>
                    All features included
                  </strong>{" "}
                  — no “Pro” lockout
                </span>
              </li>
              <li>
                <span className="check">✓</span>
                <span>
                  <strong style={{ color: "var(--ink)", fontWeight: 600 }}>
                    Your data on your hardware
                  </strong>
                </span>
              </li>
              <li>
                <span className="check">✓</span>
                <span>
                  Built-in{" "}
                  <strong style={{ color: "var(--ink)", fontWeight: 600 }}>MCP server</strong> for
                  integrations
                </span>
              </li>
              <li>
                <span className="check">✓</span>
                <span>
                  Docker image, Next.js 15,{" "}
                  <strong style={{ color: "var(--ink)", fontWeight: 600 }}>
                    SQLite + optional Litestream
                  </strong>
                </span>
              </li>
              <li>
                <span className="check">✓</span>
                <span>
                  Open development on{" "}
                  <strong style={{ color: "var(--ink)", fontWeight: 600 }}>GitHub</strong>
                </span>
              </li>
            </ul>

            <p className="oss-foot">
              We&apos;ll only ever make money when you choose our hosting. That&apos;s the deal.
            </p>

            <div className="oss-ctas">
              <a href={GH} className="btn btn-primary" target="_blank" rel="noreferrer">
                <GitHubMark /> GitHub →
              </a>
              <a
                href={`${GH}/blob/main/docs/self-hosting.md`}
                className="btn"
                target="_blank"
                rel="noreferrer"
              >
                Self-hosting guide →
              </a>
              <a
                href={`${GH}/blob/main/docs/mcp.md`}
                className="btn"
                target="_blank"
                rel="noreferrer"
              >
                MCP guide →
              </a>
            </div>
          </div>

          <div className="terminal">
            <div className="term-bar">
              <span className="dot a" />
              <span className="dot b" />
              <span className="dot c" />
              <span className="name">staykit-self-host · zsh</span>
            </div>
            <pre
              className="term-body"
              style={{ margin: 0, whiteSpace: "pre", fontFamily: "inherit" }}
            >
              <span className="prompt">$</span> <span className="cmd">git clone {GH}</span>
              {"\n"}
              <span className="info">Cloning into &apos;staykit&apos;... </span>
              <span className="ok" style={{ display: "inline" }}>
                done
              </span>
              {"\n\n"}
              <span className="prompt">$</span>{" "}
              <span className="cmd">cd staykit &amp;&amp; cp .env.example .env</span>
              {"\n\n"}
              <span className="prompt">$</span> <span className="cmd">docker compose up -d</span>
              {"\n"}
              <span className="ok">Database ready (SQLite)</span>
              {"\n"}
              <span className="ok">Migrations applied</span>
              {"\n"}
              <span className="ok">Razorpay webhook registered</span>
              {"\n"}
              <span className="ok">
                Server running at <span className="url">http://localhost:3000</span>
              </span>
              {"\n\n"}
              <span className="info"># In Claude.ai → Connectors, add https://your-host/mcp</span>
              {"\n"}
              <span className="info">
                # Then just ask: &quot;what bookings do I have today?&quot;
              </span>
              {"\n\n"}
              <span className="prompt">$</span>
              <span className="term-cursor" />
            </pre>
          </div>
        </div>
      </section>

      {/* ───────── PRICING ───────── */}
      <section className="section" id="pricing">
        <div className="container">
          <div className="section-head">
            <div className="eyebrow">
              <span className="dot" />
              Honest pricing
            </div>
            <h2 className="h2" style={{ marginTop: 14 }}>
              Free and open source. Cloud is coming.
            </h2>
            <p className="lede">
              Self-host every feature for free, forever. A managed cloud is in development —
              here&apos;s the at-cost pricing we&apos;re planning, so there are no surprises.
            </p>
          </div>

          <div className="pricing-grid">
            <article className="tier">
              <div className="name">Self-host</div>
              <div className="price free">
                <span className="amt">₹0</span>
                <span className="per">/ forever</span>
              </div>
              <div className="annual">&nbsp;</div>
              <div className="tag">Free today. Truly.</div>
              <ul>
                <li>All features, all updates</li>
                <li>Your servers, your rules</li>
                <li>Built-in MCP server</li>
                <li>Community support on GitHub</li>
              </ul>
              <a href={GH} className="btn btn-primary" target="_blank" rel="noreferrer">
                Get the code →
              </a>
              <div className="trial-note">AGPL-3.0 · no strings</div>
            </article>

            <article className="tier">
              <div className="name">Starter Cloud</div>
              <div className="price">
                <span className="amt">₹149</span>
                <span className="per">/month</span>
              </div>
              <div className="annual">planned · at cost</div>
              <div className="tag">Best for one small homestay.</div>
              <ul>
                <li>
                  <strong style={{ fontWeight: 600 }}>1 property</strong>, up to 8 rooms
                </li>
                <li>Indian servers (Hetzner / AWS Mumbai)</li>
                <li>Daily backups · 7-day retention</li>
                <li>yourname.staykit.in subdomain</li>
                <li>Email support</li>
                <li className="muted">Pass-through SMS / WhatsApp cost</li>
              </ul>
              <a href={GH} className="btn" target="_blank" rel="noreferrer">
                Join the waitlist →
              </a>
              <div className="trial-note">coming soon</div>
            </article>

            <article className="tier">
              <div className="name">Standard Cloud</div>
              <div className="price">
                <span className="amt">₹349</span>
                <span className="per">/month</span>
              </div>
              <div className="annual">planned · at cost</div>
              <div className="tag">For most growing owners.</div>
              <ul>
                <li>
                  <strong style={{ fontWeight: 600 }}>Up to 3 properties</strong>, unlimited rooms
                </li>
                <li>Everything in Starter</li>
                <li>30-day backup retention</li>
                <li>Priority email + WhatsApp support</li>
                <li>Bring-your-own-domain</li>
                <li className="muted">Pass-through SMS / WhatsApp cost</li>
              </ul>
              <a href={GH} className="btn" target="_blank" rel="noreferrer">
                Join the waitlist →
              </a>
              <div className="trial-note">coming soon</div>
            </article>

            <article className="tier">
              <div className="name">Dedicated</div>
              <div className="price">
                <span className="amt">₹799</span>
                <span className="per">/month</span>
              </div>
              <div className="annual">planned · at cost</div>
              <div className="tag">For chains and busy properties.</div>
              <ul>
                <li>
                  <strong style={{ fontWeight: 600 }}>Unlimited properties</strong>
                </li>
                <li>Dedicated container · your CPU</li>
                <li>90-day backup retention</li>
                <li>Phone + WhatsApp support</li>
                <li>Custom domain · onboarding call</li>
              </ul>
              <a href={GH} className="btn" target="_blank" rel="noreferrer">
                Join the waitlist →
              </a>
              <div className="trial-note">coming soon</div>
            </article>
          </div>

          <div className="fineprint">
            <p style={{ margin: 0 }}>
              <strong>StayKit is free and open source (AGPL-3.0).</strong> Self-host it today —
              every feature included, no “Pro” tier, no lockout.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Managed cloud hosting is in development.</strong> The prices above are our
              planned, at-cost pricing — join the waitlist and we&apos;ll tell you the moment
              it&apos;s live.
            </p>
            <p style={{ margin: 0 }}>
              <strong>We never take a cut of your bookings.</strong> Razorpay&apos;s fees go to
              Razorpay; SMS, WhatsApp and email are billed by your provider at their cost.
            </p>
          </div>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section className="section bg-cream" id="faq">
        <div className="container-narrow">
          <div className="section-head">
            <div className="eyebrow dim">
              <span className="dot" />
              Questions, answered
            </div>
            <h2 className="h2" style={{ marginTop: 14 }}>
              Frequently asked.
            </h2>
          </div>

          <div className="faq-list">
            {FAQ.map((item, i) => (
              <details className="faq-item" key={item.q} open={i === 0}>
                <summary className="faq-q">
                  {item.q}
                  <span className="ic">+</span>
                </summary>
                <div className="faq-a">
                  <p>{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── FINAL CTA ───────── */}
      <section className="final-cta">
        <div className="container">
          <h2>
            Built by people who use it.
            <br />
            Run by people who <span className="accent">answer the phone.</span>
          </h2>
          <p>
            Try the live demo, or download it and run it yourself. Either way — no card, no
            commitment.
          </p>
          <div className="cta-row">
            <Link href="/dashboard" className="btn btn-accent btn-lg">
              See the live demo
              <ArrowRight />
            </Link>
            <a href={GH} className="btn btn-outline-dark btn-lg" target="_blank" rel="noreferrer">
              <GitHubMark size={16} />
              View on GitHub
            </a>
          </div>
          <p className="meta">Free &amp; open source · self-host in minutes · no credit card</p>
        </div>
      </section>

      {/* ───────── FOOTER ───────── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <a className="brand" href="#top">
                <span className="mark">
                  <BrandGlyph />
                </span>
                <span>StayKit</span>
              </a>
              <p>The open homestay manager, built in India. Powered by you — and your AI.</p>
            </div>

            <div>
              <h5>Product</h5>
              <ul>
                <li>
                  <a href="#features">Features</a>
                </li>
                <li>
                  <a href="#pricing">Pricing</a>
                </li>
                <li>
                  <a href="#ai">AI / MCP</a>
                </li>
                <li>
                  <a href="#compare">Compare</a>
                </li>
                <li>
                  <Link href="/dashboard">Live demo</Link>
                </li>
              </ul>
            </div>
            <div>
              <h5>Use cases</h5>
              <ul>
                <li>
                  <a href="#features">Single homestay</a>
                </li>
                <li>
                  <a href="#features">Multi-property</a>
                </li>
                <li>
                  <a href="#features">Boutique chains</a>
                </li>
                <li>
                  <a href="#features">Vacation rentals</a>
                </li>
              </ul>
            </div>
            <div>
              <h5>Resources</h5>
              <ul>
                <li>
                  <a href={`${GH}/tree/main/docs`} target="_blank" rel="noreferrer">
                    Docs
                  </a>
                </li>
                <li>
                  <a href={`${GH}/blob/main/docs/self-hosting.md`} target="_blank" rel="noreferrer">
                    Self-hosting guide
                  </a>
                </li>
                <li>
                  <a href={`${GH}/blob/main/docs/mcp.md`} target="_blank" rel="noreferrer">
                    MCP guide
                  </a>
                </li>
                <li>
                  <a href="#india">GST &amp; compliance</a>
                </li>
                <li>
                  <a href="#faq">FAQ</a>
                </li>
              </ul>
            </div>
            <div>
              <h5>Open source</h5>
              <ul>
                <li>
                  <a href={GH} target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                </li>
                <li>
                  <a href={`${GH}/discussions`} target="_blank" rel="noreferrer">
                    Discussions
                  </a>
                </li>
                <li>
                  <a href={`${GH}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer">
                    Contributing
                  </a>
                </li>
                <li>
                  <a href={`${GH}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                    License (AGPL-3.0)
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <div>© 2026 StayKit · Made for India 🇮🇳</div>
            <div className="stack">
              Built on
              <span className="chip">Next.js</span>
              <span className="chip">Prisma</span>
              <span className="chip">MCP</span>
              <span className="chip">SQLite + Litestream</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
