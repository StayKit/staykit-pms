// Main app shell — sidebar nav, top bar, screen routing, and modal/sheet state.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#E07A5F",
  "density": "regular",
  "showAiNudges": true,
  "darkSidebar": false
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState("dashboard");
  const [bookingId, setBookingId] = React.useState(null);
  const [addOpen, setAddOpen] = React.useState(false);

  const openBooking = (id) => setBookingId(id);
  const closeBooking = () => setBookingId(null);
  const openAdd = () => setAddOpen(true);
  const closeAdd = () => setAddOpen(false);

  // Apply accent override via CSS variable
  React.useEffect(() => {
    document.documentElement.style.setProperty("--accent", t.accent);
  }, [t.accent]);

  React.useEffect(() => {
    const map = { compact: 13, regular: 14, comfy: 15 };
    document.documentElement.style.fontSize = (map[t.density] || 14) + "px";
  }, [t.density]);

  const nav = [
    { id: "dashboard",     label: "Dashboard",     icon: "home" },
    { id: "calendar",      label: "Calendar",      icon: "calendar" },
    { id: "bookings",      label: "Bookings",      icon: "book",   badge: 12 },
    { id: "guests",        label: "Guests",        icon: "users" },
    { id: "notifications", label: "Notifications", icon: "bell" },
    { id: "reports",       label: "Reports",       icon: "bar-chart" },
    { id: "portal",        label: "Guest portal",  icon: "phone" },
    { id: "mcp",           label: "MCP for Claude",icon: "sparkles" },
    { id: "settings",      label: "Settings",      icon: "settings" },
  ];

  const titles = {
    dashboard:     { h: "Dashboard", s: "Coorg Coffee Cottage" },
    calendar:      { h: "Calendar",  s: "All properties" },
    bookings:      { h: "Bookings",  s: "Filterable list" },
    guests:        { h: "Guests",    s: "Address book" },
    notifications: { h: "Notifications", s: "Templates & automations" },
    reports:       { h: "Reports",   s: "Occupancy, revenue & GST" },
    portal:        { h: "Guest portal", s: "What your guests see" },
    mcp:           { h: "MCP for Claude.ai", s: "AI assistant settings" },
    settings:      { h: "Settings",  s: "Workspace, billing & integrations" },
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar" style={t.darkSidebar ? {
        background: "#15201E", color: "#D8E1DE", borderRight: "1px solid #1F2D2A"
      } : {}}>
        <div className="sidebar-brand">
          <div className="mark">S</div>
          <div>
            <div className="name" style={t.darkSidebar ? { color: "#fff" } : {}}>StayKit</div>
            <div className="sub">Open-source PMS</div>
          </div>
        </div>

        <div className="property-switch" style={t.darkSidebar ? {
          background: "#1B2A27", borderColor: "#2A3B37"
        } : {}}>
          <div>
            <div className="label">PROPERTY</div>
            <div className="val" style={t.darkSidebar ? { color: "#fff" } : {}}>Coorg Coffee Cottage</div>
          </div>
          <Icon name="chevron-down" className="icon-sm" />
        </div>

        <div className="nav-section" style={t.darkSidebar ? { color: "#7E8B87" } : {}}>Workspace</div>
        {nav.slice(0, 6).map(n => (
          <NavItem
            key={n.id}
            n={n}
            active={screen === n.id}
            onClick={() => setScreen(n.id)}
            dark={t.darkSidebar}
          />
        ))}

        <div className="nav-section" style={t.darkSidebar ? { color: "#7E8B87" } : {}}>Advanced</div>
        {nav.slice(6).map(n => (
          <NavItem
            key={n.id}
            n={n}
            active={screen === n.id}
            onClick={() => setScreen(n.id)}
            dark={t.darkSidebar}
          />
        ))}

        <div className="sidebar-user" style={t.darkSidebar ? { borderTopColor: "#1F2D2A" } : {}}>
          <div className="avatar">PR</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 550, color: t.darkSidebar ? "#fff" : undefined }}>Priya R.</div>
            <div style={{ fontSize: 11.5, color: t.darkSidebar ? "#7E8B87" : "var(--muted)" }}>Owner</div>
          </div>
          <button className="icon-btn" style={t.darkSidebar ? { background: "transparent", borderColor: "#2A3B37", color: "#D8E1DE" } : {}}>
            <Icon name="more" className="icon-sm" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <header className="topbar">
          <div>
            <h1>{titles[screen].h}</h1>
            <div className="sub">{titles[screen].s}</div>
          </div>
          <div className="topbar-actions">
            <div className="search" style={{ width: 280 }}>
              <Icon name="search" className="icon" />
              <input placeholder="Search bookings, guests…" />
            </div>
            <button className="icon-btn" title="Notifications"><Icon name="bell" className="icon-sm" /></button>
            <button className="btn btn-primary" onClick={openAdd}>
              <Icon name="plus" className="icon-sm" />
              New booking
            </button>
          </div>
        </header>

        {screen === "dashboard" && <Dashboard onOpenBooking={openBooking} onOpenAdd={openAdd} onNavigate={setScreen} />}
        {screen === "calendar" && <TapeChart onOpenBooking={openBooking} onOpenAdd={openAdd} />}
        {screen === "bookings" && <BookingsList onOpenBooking={openBooking} onOpenAdd={openAdd} />}
        {screen === "guests" && <GuestsScreen onOpenBooking={openBooking} />}
        {screen === "notifications" && <NotificationsScreen />}
        {screen === "reports" && <ReportsScreen />}
        {screen === "portal" && <GuestPortalScreen />}
        {screen === "mcp" && <McpScreen />}
        {screen === "settings" && <SettingsScreen />}
      </main>

      {/* Sheet & Modal */}
      <BookingDetail bookingId={bookingId} open={!!bookingId} onClose={closeBooking} />
      <QuickAdd open={addOpen} onClose={closeAdd} />

      {/* Tweaks panel */}
      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakColor
          label="Accent colour"
          value={t.accent}
          options={["#E07A5F", "#D58936", "#7565B0", "#3D6F7A"]}
          onChange={(v) => setTweak("accent", v)}
        />
        <TweakRadio
          label="Density"
          value={t.density}
          options={["compact", "regular", "comfy"]}
          onChange={(v) => setTweak("density", v)}
        />
        <TweakToggle
          label="Dark sidebar"
          value={t.darkSidebar}
          onChange={(v) => setTweak("darkSidebar", v)}
        />
        <TweakSection label="Features" />
        <TweakToggle
          label="Show AI nudges"
          value={t.showAiNudges}
          onChange={(v) => setTweak("showAiNudges", v)}
        />
        <TweakSection label="Quick test" />
        <TweakButton
          label="Open booking BK-2403"
          onClick={() => openBooking("BK-2403")}
        />
        <TweakButton
          label="Open quick-add"
          onClick={openAdd}
        />
      </TweaksPanel>
    </div>
  );
}

function NavItem({ n, active, onClick, dark }) {
  const style = dark && !active ? {
    color: "#B7C2BE"
  } : (dark && active ? {
    background: "#1B5E5A",
    color: "#fff"
  } : {});
  return (
    <button className={"nav-item " + (active ? "active" : "")} onClick={onClick} style={style}>
      <Icon name={n.icon} className="icon" />
      <span>{n.label}</span>
      {n.badge && <span className="badge">{n.badge}</span>}
    </button>
  );
}

// ── Reports & Settings placeholders ───────────────────────────────────────
function ReportsScreen() {
  const rev = [
    { label: "Today",      n: 18900, occ: 78 },
    { label: "This week",  n: 124300, occ: 71 },
    { label: "This month", n: 412500, occ: 66 },
    { label: "Q1 FY26",    n: 1248000, occ: 62 },
  ];

  // Build a tiny bar-chart of occupancy by day-of-week
  const occByDay = [62, 58, 64, 70, 78, 92, 86]; // Mon..Sun

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Reports</h2>
          <div className="sub">Performance and tax-ready summaries</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn"><Icon name="calendar" className="icon-sm" />This month</button>
          <button className="btn"><Icon name="external" className="icon-sm" />Export</button>
        </div>
      </div>

      <div className="kpi-grid">
        {rev.map((r, i) => (
          <div key={i} className="kpi">
            <div className="label"><span className="dot" />{r.label}</div>
            <div className="value">
              <span style={{ fontSize: 20, color: "var(--muted)", marginRight: 2, fontWeight: 500 }}>₹</span>
              <span className="tabular">{r.n.toLocaleString("en-IN")}</span>
            </div>
            <div className="delta">Occupancy {r.occ}%</div>
            <div className="accent-bar" />
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginTop: 24 }}>
        <div className="card card-padded">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Occupancy by day-of-week</h3>
          <div className="sub text-muted text-sm" style={{ marginTop: 2 }}>Past 30 days</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 220, marginTop: 28, padding: "0 8px" }}>
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => (
              <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>{occByDay[i]}%</div>
                <div style={{
                  width: "100%",
                  background: i >= 5 ? "var(--accent)" : "var(--brand)",
                  height: occByDay[i] * 1.8,
                  borderRadius: "8px 8px 2px 2px",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,.2)"
                }} />
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{d}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Source mix</h3></div>
          <div style={{ padding: "8px 20px 20px" }}>
            {[
              { name: "Direct", pct: 38, color: "#1B5E5A" },
              { name: "Airbnb", pct: 22, color: "#E07A5F" },
              { name: "Booking.com", pct: 18, color: "#3D5A80" },
              { name: "MakeMyTrip", pct: 10, color: "#D6A23B" },
              { name: "Phone / WhatsApp", pct: 8, color: "#7565B0" },
              { name: "Walk-in", pct: 4, color: "#8A8F8C" },
            ].map(s => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                <div style={{ flex: 1, fontSize: 13.5 }}>{s.name}</div>
                <div style={{ flex: "0 0 120px", background: "var(--surface-2)", height: 6, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ background: s.color, width: `${s.pct * 2.5}%`, height: "100%" }} />
                </div>
                <div className="tabular" style={{ fontSize: 13, fontWeight: 550, width: 40, textAlign: "right" }}>{s.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="checklist-card" style={{ marginTop: 24 }}>
        <div className="icon-wrap"><Icon name="shield-check" className="icon" /></div>
        <div className="text">
          <div className="title">GST report for September is ready</div>
          <div className="sub">5% GST on rooms ≤ ₹ 7,500/night · 18% above. Email a copy to your CA.</div>
        </div>
        <button className="btn btn-primary">Email to CA</button>
      </div>
    </div>
  );
}

function SettingsScreen() {
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
          {["Property", "Integrations", "Team & roles", "Notifications", "Legal & DPDP", "Account"].map((s, i) => (
            <button
              key={s}
              className={"nav-item " + (i === 1 ? "active" : "")}
              style={{ width: "100%" }}
            >
              <Icon name={["map-pin","sparkles","users","bell","shield","user"][i]} className="icon" />
              {s}
            </button>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Integrations</h3>
            <div className="sub" style={{ marginLeft: "auto" }}>4 connected · 1 needs setup</div>
          </div>
          <div>
            {[
              { name: "Razorpay", desc: "Payment links, refunds & webhooks", status: "connected", icon: "credit-card" },
              { name: "MSG91 (SMS)", desc: "Transactional SMS with DLT IDs", status: "connected", icon: "phone" },
              { name: "WhatsApp Business", desc: "Send confirmations & reminders", status: "connected", icon: "message-circle" },
              { name: "Resend (Email)", desc: "Transactional email", status: "connected", icon: "mail" },
              { name: "Litestream", desc: "Automated SQLite backups to S3", status: "setup", icon: "shield" },
            ].map(i => (
              <div key={i.name} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: 16, borderBottom: "1px solid var(--line)"
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10, background: "var(--surface-2)",
                  display: "grid", placeItems: "center", color: "var(--ink-2)", flex: "0 0 38px"
                }}>
                  <Icon name={i.icon} className="icon" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{i.name}</div>
                  <div className="text-sm text-muted" style={{ marginTop: 2 }}>{i.desc}</div>
                </div>
                {i.status === "connected"
                  ? <span className="pill pill-checkedin"><Icon name="check" className="icon-sm" />Connected</span>
                  : <span className="pill pill-tentative"><Icon name="alert" className="icon-sm" />Needs setup</span>}
                <button className="btn btn-sm">Manage</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { App, ReportsScreen, SettingsScreen });

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
