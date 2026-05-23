// Dashboard screen — the "open the app once a day" view.

function Dashboard({ onOpenBooking, onOpenAdd, onNavigate }) {
  const arrivingToday = BOOKINGS.filter(b => b.arriving);
  const departingToday = BOOKINGS.filter(b => DEPARTURES_TODAY_IDS.includes(b.id));
  const pending = BOOKINGS
    .filter(b => b.status !== "block" && b.status !== "checkedout" && b.paid < b.total);
  const pendingTotal = pending.reduce((s, b) => s + (b.total - b.paid), 0);
  const occRooms = BOOKINGS.filter(b =>
    b.status !== "block" &&
    b.startDate <= _today && b.endDate > _today &&
    b.status !== "checkedout"
  ).length;
  const totalRooms = ROOMS.length;
  const occPct = Math.round((occRooms / totalRooms) * 100);

  return (
    <div className="page">
      {/* Greeting */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13.5, color: "var(--muted)" }}>
          {longDate(_today)}
        </div>
        <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em" }}>
          Good morning, Priya
        </h1>
        <div style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 6 }}>
          You have <b>{arrivingToday.length} arrivals</b> and <b>{pending.length} payments still to collect</b> today.
        </div>
      </div>

      {/* KPI grid */}
      <div className="kpi-grid">
        <KpiTile
          label="Arriving today"
          value={arrivingToday.length}
          unit=""
          delta={null}
          footerLabel="See list"
          onClick={() => document.getElementById("arrivals-card")?.scrollIntoView({ block: "center" })}
          color="brand"
        />
        <KpiTile
          label="Departing today"
          value={departingToday.length}
          unit=""
          delta={null}
          footerLabel="See list"
          color="brand"
        />
        <KpiTile
          label="Tonight's occupancy"
          value={occPct}
          unit="%"
          delta={`${occRooms} of ${totalRooms} rooms`}
          footerLabel="View calendar"
          onClick={() => onNavigate("calendar")}
          color="brand"
        />
        <KpiTile
          label="Pending payments"
          value={inr(pendingTotal, false)}
          unit=""
          prefix="₹"
          delta={`${pending.length} payment ${pending.length === 1 ? "link" : "links"}`}
          footerLabel="Send reminders"
          color="accent"
          accentWarm
        />
      </div>

      {/* 7-day strip */}
      <div className="section-head">
        <div>
          <h2>Next 7 days</h2>
          <div className="sub">Tap a day to open the calendar.</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate("calendar")}>
          Full calendar
          <Icon name="arrow-right" className="icon-sm" />
        </button>
      </div>
      <div className="strip">
        {OCC_STRIP.map((c, i) => {
          const date = addDays(_today, c.d);
          const isToday = c.d === 0;
          return (
            <div key={i} className={"strip-cell " + (isToday ? "today" : "")} onClick={() => onNavigate("calendar")}>
              <div className="dow">{isToday ? "Today" : date.toLocaleDateString("en-IN", { weekday: "short" })}</div>
              <div className="date">{date.getDate()}</div>
              <div className="occ">
                <div className="bar"><div className="fill" style={{ width: `${c.occ * 100}%` }} /></div>
                <span className="tabular">{Math.round(c.occ * 100)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Two-column: arrivals + activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginTop: 28 }}>
        {/* Arrivals card */}
        <div className="card" id="arrivals-card">
          <div className="card-header">
            <div>
              <h3>Today's arrivals</h3>
              <div className="sub" style={{ marginTop: 2 }}>{arrivingToday.length} guests expected</div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <button className="btn btn-primary btn-sm" onClick={onOpenAdd}>
                <Icon name="plus" className="icon-sm" />
                Add booking
              </button>
            </div>
          </div>
          <div className="card-body">
            {arrivingToday.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>
                Nothing on the books for today.
              </div>
            ) : arrivingToday.map(b => {
              const g = GuestById(b.guestId);
              const r = RoomById(b.roomId);
              const state = paymentState(b);
              return (
                <div key={b.id} className="arrivals-row" onClick={() => onOpenBooking(b.id)}>
                  <div className={"avatar " + avatarColor(g.id)}>{g.avatar}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {g.name}
                      {g.foreign && <span className="pill pill-outline" style={{ fontSize: 10.5, padding: "1px 6px" }}><Icon name="globe" className="icon-sm" />Foreign national</span>}
                    </div>
                    <div className="sub">
                      <span>{b.nights} night{b.nights > 1 ? "s" : ""}</span>
                      <span>·</span>
                      <ChannelChip source={b.source} />
                    </div>
                  </div>
                  <div className="room">{r.num} · {r.name}</div>
                  <div className="actions">
                    {state === "unpaid" || state === "partial" ? (
                      <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); }}>
                        <Icon name="send" className="icon-sm" />
                        Send link
                      </button>
                    ) : (
                      <StatusPill state="paid">Paid</StatusPill>
                    )}
                    <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); }}>
                      <Icon name="key" className="icon-sm" />
                      Check in
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity feed */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3>Recent activity</h3>
              <div className="sub" style={{ marginTop: 2 }}>What's happened today</div>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {ACTIVITY.map((a, i) => (
              <div key={i} className="activity-row">
                <div className={"activity-dot " + (a.tone || "")}>
                  <Icon name={a.icon === "broom" ? "sparkles" : a.icon} className="icon-sm" />
                </div>
                <div className="text">
                  <strong>{a.actor}</strong>{a.bot && <span className="bot-tag"><Icon name="sparkles" className="icon-sm" />AI</span>}{" "}
                  {a.text} <strong>{a.subject}</strong>
                  {a.amount && <> {" — "}<span className="money">{inr(a.amount)}</span></>}
                  {a.room && <> {" "}<span className="text-muted text-xs">· {a.room}</span></>}
                </div>
                <div className="when">{a.when}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI assistant nudge */}
      <div className="checklist-card" style={{ marginTop: 28 }}>
        <div className="icon-wrap">
          <Icon name="sparkles" className="icon" />
        </div>
        <div className="text">
          <div className="title">Run your homestay from Claude.ai</div>
          <div className="sub">Connect StayKit to Claude as a custom connector. Ask things like "Send a payment reminder to everyone arriving tomorrow" — every action is logged and reversible.</div>
        </div>
        <button className="btn">
          <Icon name="external" className="icon-sm" />
          Set up MCP
        </button>
      </div>
    </div>
  );
}

function KpiTile({ label, value, unit, prefix, delta, footerLabel, onClick, color, accentWarm }) {
  return (
    <div className={"kpi " + (accentWarm ? "accent-warm" : "")} onClick={onClick}>
      <div className="label"><span className={"dot " + (accentWarm ? "accent" : "")} />{label}</div>
      <div className="value">
        {prefix && <span style={{ fontSize: 20, color: "var(--muted)", marginRight: 2, fontWeight: 500 }}>{prefix}</span>}
        <span className="tabular">{value}</span>
        {unit && <span className="unit">{unit}</span>}
      </div>
      {delta && <div className="delta">{delta}</div>}
      {footerLabel && (
        <div className="footer-link" style={{ color: accentWarm ? "var(--accent)" : "var(--brand)" }}>
          {footerLabel} <Icon name="arrow-right" className="icon-sm" />
        </div>
      )}
      <div className="accent-bar" />
    </div>
  );
}

function avatarColor(id) {
  const palettes = ["", "teal", "purple", "sky"];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return palettes[Math.abs(h) % palettes.length];
}

Object.assign(window, { Dashboard, avatarColor });
