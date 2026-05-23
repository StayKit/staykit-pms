// Secondary screens: Guests, Notifications, Settings (MCP), Guest portal preview.

function GuestsScreen({ onOpenBooking }) {
  const [q, setQ] = React.useState("");
  const rows = GUESTS.filter(g => !q || g.name.toLowerCase().includes(q.toLowerCase()) || g.phone.includes(q));

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Guests</h2>
          <div className="sub">{GUESTS.length} guests in your address book</div>
        </div>
        <button className="btn btn-primary"><Icon name="user-plus" className="icon-sm" />Add guest</button>
      </div>

      <div className="card">
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <div className="search">
            <Icon name="search" className="icon" />
            <input placeholder="Search guests by name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Phone</th>
              <th>City</th>
              <th>Stays</th>
              <th>Marketing consent</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(g => (
              <tr key={g.id}>
                <td>
                  <div className="guest-cell">
                    <div className={"avatar " + avatarColor(g.id)} style={{ width: 32, height: 32, fontSize: 12 }}>{g.avatar}</div>
                    <div>
                      <div className="name" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {g.name}
                        {g.foreign && <Icon name="globe" className="icon-sm" style={{ color: "var(--muted)" }} />}
                      </div>
                      <div className="sub">{g.email}</div>
                    </div>
                  </div>
                </td>
                <td><span className="tabular text-sm">{g.phone}</span></td>
                <td className="text-sm">{g.city}</td>
                <td><span className="pill pill-neutral">{g.stays} stays</span></td>
                <td>
                  <span className="pill pill-brand">
                    <Icon name="check" className="icon-sm" />
                    Opted in
                  </span>
                </td>
                <td><button className="icon-btn"><Icon name="more" className="icon-sm" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Notifications & templates ────────────────────────────────────────────────
function NotificationsScreen() {
  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Notifications</h2>
          <div className="sub">Templates and automations for SMS, email & WhatsApp</div>
        </div>
        <button className="btn btn-primary"><Icon name="plus" className="icon-sm" />New template</button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Templates</h3>
          <div className="sub" style={{ marginLeft: "auto" }}>6 active · 3 channels</div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Template</th>
              <th>Channels</th>
              <th>Trigger</th>
              <th>Sent (30d)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {TEMPLATES.map(t => (
              <tr key={t.id}>
                <td>
                  <div className="name" style={{ fontWeight: 550 }}>{t.name}</div>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    {t.channels.includes("sms") && <Tag name="SMS" tone="" />}
                    {t.channels.includes("email") && <Tag name="Email" tone="brand" />}
                    {t.channels.includes("whatsapp") && <Tag name="WhatsApp" tone="green" />}
                  </div>
                </td>
                <td className="text-sm text-muted">{t.trigger}</td>
                <td className="tabular text-sm">{42 + Math.round(Math.random() * 200)}</td>
                <td>
                  <button className="btn btn-sm btn-ghost"><Icon name="edit" className="icon-sm" />Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Send blast card */}
      <div className="checklist-card" style={{ marginTop: 24 }}>
        <div className="icon-wrap"><Icon name="send" className="icon" /></div>
        <div className="text">
          <div className="title">Send a custom message</div>
          <div className="sub">Filter guests by stay date or property, then send a WhatsApp or email.</div>
        </div>
        <button className="btn">Compose</button>
      </div>
    </div>
  );
}

function Tag({ name, tone = "" }) {
  return (
    <span className={"channel-chip " + (tone === "brand" ? "direct" : tone === "green" ? "whatsapp" : "")}>
      {name}
    </span>
  );
}

// ── MCP / Settings screen ──────────────────────────────────────────────────
function McpScreen() {
  const tools = [
    { name: "list_bookings",         scope: "bookings:read",    state: "on" },
    { name: "get_booking",           scope: "bookings:read",    state: "on" },
    { name: "create_booking",        scope: "bookings:write",   state: "on" },
    { name: "modify_booking",        scope: "bookings:write",   state: "on" },
    { name: "cancel_booking",        scope: "bookings:write",   state: "on" },
    { name: "send_notification",     scope: "notifications:send", state: "on" },
    { name: "get_payment_status",    scope: "payments:read",    state: "on" },
    { name: "refund_payment",        scope: "payments:refund",  state: "approval" },
    { name: "list_guests",           scope: "guests:read",      state: "on" },
    { name: "get_kpis",              scope: "analytics:read",   state: "on" },
  ];

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22, display: "flex", alignItems: "center", gap: 10 }}>
            MCP for Claude.ai
            <span className="pill pill-checkedin"><Icon name="shield-check" className="icon-sm" />Connected</span>
          </h2>
          <div className="sub">Let an AI assistant run your homestay from inside Claude.ai — securely.</div>
        </div>
        <button className="btn"><Icon name="external" className="icon-sm" />Open Claude.ai</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20 }}>
        {/* Left: connection card + tool table */}
        <div className="card">
          <div className="card-header">
            <h3>Server endpoint</h3>
          </div>
          <div style={{ padding: "0 20px 16px" }}>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Streamable HTTP URL</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input readOnly value="https://coorgcoffee.staykit.app/mcp" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line-strong)", background: "var(--surface-2)" }} />
                <button className="btn btn-sm"><Icon name="external" className="icon-sm" />Copy</button>
              </div>
              <div className="hint">In Claude.ai → Customize → Connectors → Add custom connector, paste this URL.</div>
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>Issued tokens</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "var(--surface-2)", borderRadius: 12 }}>
                <div className="avatar purple" style={{ width: 32, height: 32, fontSize: 12 }}>C</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 550, fontSize: 13.5 }}>Claude — Priya's workspace</div>
                  <div className="text-xs text-muted">Issued 12 Jan 2026 · last used 4 minutes ago · 8 scopes</div>
                </div>
                <button className="btn btn-sm btn-ghost" style={{ color: "var(--st-unpaid)" }}>Revoke</button>
              </div>
            </div>
          </div>

          <div className="card-header" style={{ borderTop: "1px solid var(--line)" }}>
            <h3>Available tools</h3>
            <div className="sub" style={{ marginLeft: "auto" }}>{tools.length} tools · RBAC-enforced</div>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>Tool</th><th>OAuth scope</th><th>Behaviour</th></tr>
            </thead>
            <tbody>
              {tools.map(t => (
                <tr key={t.name} style={{ cursor: "default" }}>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>{t.name}</td>
                  <td><span className="channel-chip">{t.scope}</span></td>
                  <td>
                    {t.state === "approval" ? (
                      <span className="pill pill-tentative">
                        <Icon name="shield" className="icon-sm" />Requires approval
                      </span>
                    ) : (
                      <span className="pill pill-checkedin">
                        <Icon name="check" className="icon-sm" />Auto-allowed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: AI audit slice */}
        <div className="card">
          <div className="card-header">
            <h3>Recent AI actions</h3>
            <div className="sub" style={{ marginLeft: "auto" }}>Last 24 hours</div>
          </div>
          <div style={{ padding: 8 }}>
            {[
              { tool: "send_notification",    args: "to: Daniel Müller · template: payment_link", when: "11:08 AM", result: "ok" },
              { tool: "list_bookings",        args: "from: today, status: confirmed",              when: "10:54 AM", result: "ok" },
              { tool: "get_kpis",             args: "range: 7d, properties: 2",                    when: "10:54 AM", result: "ok" },
              { tool: "modify_booking",       args: "BK-2411 · extend 1 night",                    when: "Yesterday 6:12 PM", result: "ok" },
              { tool: "refund_payment",       args: "BK-2400 · ₹ 4,500",                           when: "Yesterday 3:01 PM", result: "approval" },
            ].map((a, i) => (
              <div key={i} style={{ padding: "12px 12px", borderBottom: i === 4 ? "none" : "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 7,
                    background: "#EEEAF7", color: "#5A4A85",
                    display: "grid", placeItems: "center", flex: "0 0 26px"
                  }}>
                    <Icon name="sparkles" className="icon-sm" />
                  </div>
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 550 }}>{a.tool}</div>
                  <div style={{ marginLeft: "auto" }}>
                    {a.result === "ok"
                      ? <span className="pill pill-checkedin"><Icon name="check" className="icon-sm" />OK</span>
                      : <span className="pill pill-tentative"><Icon name="clock" className="icon-sm" />Awaiting you</span>}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginLeft: 36, marginTop: 4 }}>
                  {a.args}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginLeft: 36, marginTop: 2 }}>{a.when}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Guest portal preview ──────────────────────────────────────────────────
function GuestPortalScreen() {
  const [step, setStep] = React.useState("otp");

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Guest portal</h2>
          <div className="sub">No password, no app — guests sign in with the phone number on their booking.</div>
        </div>
        <div className="seg">
          <button className={step === "otp" ? "active" : ""} onClick={() => setStep("otp")}>OTP screen</button>
          <button className={step === "bookings" ? "active" : ""} onClick={() => setStep("bookings")}>My bookings</button>
          <button className={step === "detail" ? "active" : ""} onClick={() => setStep("detail")}>Booking detail</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", marginTop: 16 }}>
        <div className="phone-frame">
          <div className="phone-screen">
            {step === "otp" && <PhoneOtp />}
            {step === "bookings" && <PhoneBookings />}
            {step === "detail" && <PhoneBookingDetail />}
          </div>
        </div>

        <div style={{ flex: 1, maxWidth: 480 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>
            How it works
          </h3>
          <ol style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>
            <li>Guest receives an SMS + WhatsApp link after you create the booking.</li>
            <li>They tap the link, see their phone pre-filled, and request a 6-digit code.</li>
            <li>Inside, they can pay the balance, download their GST invoice, or request a cancellation.</li>
          </ol>

          <div className="card" style={{ padding: 16, marginTop: 18, background: "var(--brand-tint)", borderColor: "var(--brand-soft)" }}>
            <div style={{ display: "flex", gap: 10 }}>
              <Icon name="shield" className="icon" style={{ color: "var(--brand)", marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>DPDP-compliant by default</div>
                <div className="text-sm text-muted" style={{ marginTop: 4 }}>
                  Marketing consent is opt-in. Guests can request erasure from this same screen — your tax records are retained per the GST and Income Tax Acts.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhoneOtp() {
  return (
    <>
      <div className="gp-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "var(--brand)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11 }}>S</div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Coorg Coffee Cottage</div>
        </div>
      </div>
      <div className="gp-content">
        <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
          Enter the 6-digit code
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
          We've sent it to <b>+91 98xxx 14782</b>.
        </div>
        <div className="otp-cells" style={{ marginTop: 22 }}>
          <div className="otp-cell filled">4</div>
          <div className="otp-cell filled">8</div>
          <div className="otp-cell filled">2</div>
          <div className="otp-cell active">1</div>
          <div className="otp-cell"></div>
          <div className="otp-cell"></div>
        </div>
        <button className="btn btn-primary btn-lg" style={{ width: "100%", justifyContent: "center", marginTop: 22 }}>
          Continue
        </button>
        <div style={{ fontSize: 12.5, color: "var(--muted)", textAlign: "center", marginTop: 14 }}>
          Didn't get it? <a href="#" style={{ color: "var(--brand)", fontWeight: 550 }}>Resend in 23s</a>
        </div>
      </div>
    </>
  );
}

function PhoneBookings() {
  return (
    <>
      <div className="gp-header">
        <div style={{ fontWeight: 600, fontSize: 13 }}>Your bookings</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>+91 98xxx 14782</div>
      </div>
      <div className="gp-content" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <PhoneBookingCard
          title="Coorg Coffee Cottage"
          where="Hibiscus · Room 103"
          dates="23 May – 26 May 2026"
          state="partial"
          due={9450}
        />
        <PhoneBookingCard
          title="Backwaters Verandah"
          where="Houseboat 2"
          dates="14 Aug – 17 Aug 2026"
          state="paid"
        />
      </div>
    </>
  );
}

function PhoneBookingCard({ title, where, dates, state, due }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--line)",
      borderRadius: 14, padding: 14, boxShadow: "var(--shadow-1)"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{where}</div>
      <div style={{ fontSize: 12.5, marginTop: 8 }}>{dates}</div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 10, gap: 6 }}>
        <StatusPill state={state} />
      </div>
      {due && (
        <button className="btn btn-accent" style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>
          Pay {inr(due)}
        </button>
      )}
    </div>
  );
}

function PhoneBookingDetail() {
  return (
    <>
      <div className="gp-header">
        <div style={{ fontSize: 11, color: "var(--muted)" }}>BK-2403</div>
        <div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>Hibiscus · Room 103</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>23 May → 26 May · 3 nights</div>
      </div>
      <div className="gp-content">
        <div style={{ background: "var(--accent-soft)", borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="indian-rupee" className="icon" style={{ color: "var(--accent)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>₹ 9,450 still to pay</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Secure payment via Razorpay</div>
          </div>
          <Icon name="chevron-right" className="icon-sm" style={{ color: "var(--accent)" }} />
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
          Your stay
        </div>
        <div style={{ marginTop: 8, padding: 12, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--line)", fontSize: 12.5, lineHeight: 1.6 }}>
          <div><b>Check-in</b> · 23 May, 2:00 PM</div>
          <div><b>Check-out</b> · 26 May, 11:00 AM</div>
          <div><b>Guests</b> · 2 adults</div>
        </div>

        <button className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>
          <Icon name="map-pin" className="icon-sm" />
          How to reach us
        </button>
        <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 6, color: "var(--st-unpaid)" }}>
          Request to cancel
        </button>
      </div>
    </>
  );
}

Object.assign(window, { GuestsScreen, NotificationsScreen, McpScreen, GuestPortalScreen });
