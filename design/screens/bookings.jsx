// Bookings list + Booking detail sheet + Quick-add modal.

function BookingsList({ onOpenBooking, onOpenAdd }) {
  const [filter, setFilter] = React.useState("all");
  const [q, setQ] = React.useState("");

  const filters = [
    { id: "all", label: "All", count: BOOKINGS.length },
    { id: "today", label: "Arriving today" },
    { id: "unpaid", label: "Unpaid" },
    { id: "tentative", label: "Tentative" },
    { id: "checkedin", label: "Checked in" },
    { id: "foreign", label: "Foreign guests" },
  ];

  const rows = BOOKINGS.filter(b => {
    if (b.status === "block") return false;
    const g = GuestById(b.guestId);
    if (q) {
      const hay = (g.name + " " + g.phone + " " + b.id).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    if (filter === "today") return b.arriving;
    if (filter === "unpaid") return b.paid < b.total && b.status !== "checkedout";
    if (filter === "tentative") return b.status === "tentative";
    if (filter === "checkedin") return b.status === "checkedin";
    if (filter === "foreign") return b.foreign;
    return true;
  });

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Bookings</h2>
          <div className="sub">{BOOKINGS.filter(b => b.status !== "block").length} bookings · live view</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn">
            <Icon name="external" className="icon-sm" />
            Export CSV
          </button>
          <button className="btn btn-primary" onClick={() => onOpenAdd()}>
            <Icon name="plus" className="icon-sm" />
            New booking
          </button>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", gap: 12, alignItems: "center" }}>
          <div className="search">
            <Icon name="search" className="icon" />
            <input
              placeholder="Search by guest, phone, or booking ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="chips" style={{ marginLeft: 4 }}>
            {filters.map(f => (
              <button
                key={f.id}
                className={"chip" + (filter === f.id ? " selected" : "")}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Dates</th>
                <th>Room</th>
                <th>Source</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(b => {
                const g = GuestById(b.guestId);
                const r = RoomById(b.roomId);
                const state = paymentState(b);
                return (
                  <tr key={b.id} onClick={() => onOpenBooking(b.id)}>
                    <td>
                      <div className="guest-cell">
                        <div className={"avatar " + avatarColor(g.id)} style={{ width: 32, height: 32, fontSize: 12 }}>{g.avatar}</div>
                        <div>
                          <div className="name">{g.name} {g.foreign && <Icon name="globe" className="icon-sm" style={{ color: "var(--muted)", marginLeft: 2 }} />}</div>
                          <div className="sub">{g.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 550, fontSize: 13 }}>{shortDate(b.startDate)} → {shortDate(b.endDate)}</div>
                      <div className="text-muted text-xs">{b.nights} night{b.nights > 1 ? "s" : ""} · {b.adults + b.children} guests</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 550, fontSize: 13 }}>{r.num}</div>
                      <div className="text-muted text-xs">{r.name}</div>
                    </td>
                    <td><ChannelChip source={b.source} /></td>
                    <td><StatusPill state={state} /></td>
                    <td style={{ textAlign: "right" }}>
                      <div className="money" style={{ fontWeight: 600 }}>{inr(b.total)}</div>
                      {b.paid < b.total && (
                        <div className="text-xs" style={{ color: "var(--st-unpaid)" }}>
                          {inr(b.total - b.paid)} due
                        </div>
                      )}
                    </td>
                    <td>
                      <button className="icon-btn" onClick={(e) => e.stopPropagation()}>
                        <Icon name="more" className="icon-sm" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                  No bookings match your filters.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Booking Detail Sheet ────────────────────────────────────────────────────
function BookingDetail({ bookingId, open, onClose }) {
  const [tab, setTab] = React.useState("stay");
  React.useEffect(() => { if (open) setTab("stay"); }, [open, bookingId]);

  const b = BOOKINGS.find(x => x.id === bookingId);
  if (!b) return null;
  const g = GuestById(b.guestId);
  const r = RoomById(b.roomId);
  const state = paymentState(b);
  const due = b.total - b.paid;
  const nightly = Math.round(b.total / b.nights / 1.05);
  const gst = b.total - nightly * b.nights;

  return (
    <>
      <div className={"scrim " + (open ? "open" : "")} onClick={onClose} />
      <aside className={"sheet " + (open ? "open" : "")} role="dialog" aria-label="Booking details">
        <div className="sheet-header">
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" className="icon-sm" />
          </button>
          <div style={{ flex: 1 }}>
            <h3>Booking</h3>
            <div className="sub">{b.id}</div>
          </div>
          <button className="icon-btn"><Icon name="edit" className="icon-sm" /></button>
          <button className="icon-btn"><Icon name="more" className="icon-sm" /></button>
        </div>

        <div className="sheet-body">
          {/* Hero */}
          <div className="bd-hero">
            <div className="ref">{r.num} · {r.name}</div>
            <h2>{g?.name || "Owner block"}</h2>
            <div className="where">
              {shortDate(b.startDate)} → {shortDate(b.endDate)} · {b.nights} night{b.nights > 1 ? "s" : ""} · {b.adults + b.children} guests
            </div>
            <div className="pills">
              <StatusPill state={state} />
              <ChannelChip source={b.source} />
              {g?.foreign && (
                <span className="pill pill-outline">
                  <Icon name="globe" className="icon-sm" />
                  Foreign national — Form C pending
                </span>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs">
            <button className={"tab " + (tab === "stay" ? "active" : "")} onClick={() => setTab("stay")}>Stay</button>
            <button className={"tab " + (tab === "guest" ? "active" : "")} onClick={() => setTab("guest")}>Guest</button>
            <button className={"tab " + (tab === "payments" ? "active" : "")} onClick={() => setTab("payments")}>Payments</button>
            <button className={"tab " + (tab === "comms" ? "active" : "")} onClick={() => setTab("comms")}>Messages</button>
            <button className={"tab " + (tab === "audit" ? "active" : "")} onClick={() => setTab("audit")}>Activity</button>
          </div>

          {tab === "stay" && (
            <>
              <div className="bd-section">
                <h4>Stay</h4>
                <div className="kv-grid">
                  <div className="kv"><div className="k">Check-in</div><div className="v">{shortDate(b.startDate)} · 2:00 PM</div></div>
                  <div className="kv"><div className="k">Check-out</div><div className="v">{shortDate(b.endDate)} · 11:00 AM</div></div>
                  <div className="kv"><div className="k">Room</div><div className="v">{r.num} — {r.name}</div></div>
                  <div className="kv"><div className="k">Guests</div><div className="v">{b.adults} adult{b.adults > 1 ? "s" : ""}{b.children ? ", " + b.children + " child" + (b.children > 1 ? "ren" : "") : ""}</div></div>
                  <div className="kv"><div className="k">Source</div><div className="v"><ChannelChip source={b.source} /></div></div>
                  <div className="kv"><div className="k">Booking ID</div><div className="v" style={{ fontVariantNumeric: "tabular-nums" }}>{b.id}</div></div>
                </div>
              </div>

              <div className="bd-section">
                <h4>Rate breakdown</h4>
                <div className="line-items">
                  <div className="li-row">
                    <div>
                      <div>Room charge — {r.name}</div>
                      <div className="sub">₹ {nightly.toLocaleString("en-IN")} × {b.nights} nights</div>
                    </div>
                    <div />
                    <div className="money">{inr(nightly * b.nights)}</div>
                  </div>
                  <div className="li-row">
                    <div>
                      <div>GST</div>
                      <div className="sub">5% (rate ≤ ₹ 7,500/night)</div>
                    </div>
                    <div />
                    <div className="money">{inr(gst)}</div>
                  </div>
                  <div className="li-row total">
                    <div>Total</div>
                    <div />
                    <div className="money">{inr(b.total)}</div>
                  </div>
                </div>
              </div>

              {b.note && (
                <div className="bd-section">
                  <h4>Notes</h4>
                  <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{b.note}</div>
                </div>
              )}
            </>
          )}

          {tab === "guest" && g && (
            <div className="bd-section">
              <h4>Primary guest</h4>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div className={"avatar lg " + avatarColor(g.id)}>{g.avatar}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{g.name}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>{g.city}</div>
                </div>
              </div>
              <div className="kv-grid" style={{ marginTop: 18 }}>
                <div className="kv"><div className="k">Mobile</div><div className="v">{g.phone}</div></div>
                <div className="kv"><div className="k">Email</div><div className="v">{g.email}</div></div>
                <div className="kv"><div className="k">Past stays</div><div className="v">{g.stays}</div></div>
                <div className="kv"><div className="k">ID document</div><div className="v">Aadhaar — •••• 8821</div></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn btn-sm"><Icon name="message-circle" className="icon-sm" />WhatsApp</button>
                <button className="btn btn-sm"><Icon name="phone" className="icon-sm" />Call</button>
                <button className="btn btn-sm"><Icon name="user" className="icon-sm" />Full profile</button>
              </div>
            </div>
          )}

          {tab === "payments" && (
            <div className="bd-section">
              <h4>Payment status</h4>
              <div className="kv-grid">
                <div className="kv"><div className="k">Total</div><div className="v money">{inr(b.total)}</div></div>
                <div className="kv"><div className="k">Paid</div><div className="v money" style={{ color: "var(--st-checkedin)" }}>{inr(b.paid)}</div></div>
                <div className="kv"><div className="k">Due</div><div className="v money" style={{ color: due > 0 ? "var(--st-unpaid)" : "var(--ink-2)" }}>{inr(due)}</div></div>
                <div className="kv"><div className="k">Payment link</div><div className="v">{b.paid > 0 ? "Sent · partially paid" : "Sent · awaiting"}</div></div>
              </div>

              <h4 style={{ marginTop: 24 }}>Timeline</h4>
              <div>
                <div className="timeline-row">
                  <div className="timeline-dot"><Icon name="send" className="icon-sm" /></div>
                  <div className="text">Payment link sent via SMS & WhatsApp<div className="sub">Yesterday at 4:21 PM</div></div>
                </div>
                {b.paid > 0 && (
                  <div className="timeline-row">
                    <div className="timeline-dot" style={{ background: "var(--st-checkedin)" }}><Icon name="check" className="icon-sm" /></div>
                    <div className="text">Razorpay received {inr(b.paid)}<div className="sub">UPI · payu/HDFC · Today at 9:50 AM</div></div>
                  </div>
                )}
                {due > 0 && (
                  <div className="timeline-row">
                    <div className="timeline-dot empty"><Icon name="clock" className="icon-sm" /></div>
                    <div className="text">{inr(due)} still to collect<div className="sub">Reminder scheduled for tomorrow</div></div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "comms" && (
            <div className="bd-section">
              <h4>Messages sent</h4>
              {[
                { ch: "whatsapp", t: "Yesterday 4:21 PM", title: "Booking confirmation", status: "Delivered, read" },
                { ch: "sms", t: "Yesterday 4:21 PM", title: "Payment link", status: "Delivered" },
                { ch: "email", t: "Today 7:00 AM", title: "Check-in instructions", status: "Delivered, opened" },
              ].map((m, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--line)"
                }}>
                  <div className={"activity-dot " + (m.ch === "whatsapp" ? "brand" : m.ch === "sms" ? "" : "accent")}>
                    <Icon name={m.ch === "whatsapp" ? "message-circle" : m.ch === "sms" ? "phone" : "mail"} className="icon-sm" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 550, fontSize: 13.5 }}>{m.title}</div>
                    <div className="text-xs text-muted">{m.t} · {m.status}</div>
                  </div>
                  <button className="btn btn-sm btn-ghost"><Icon name="external" className="icon-sm" /></button>
                </div>
              ))}
            </div>
          )}

          {tab === "audit" && (
            <div className="bd-section">
              <h4>Activity log</h4>
              {[
                { actor: "Priya", what: "created booking", when: "Yesterday 4:20 PM", bot: false },
                { actor: "Claude (AI)", what: "sent payment link", when: "Yesterday 4:21 PM", bot: true },
                { actor: "System", what: `received ${inr(b.paid)}`, when: "Today 9:50 AM", bot: false, hide: b.paid === 0 },
                { actor: "Rakesh", what: "viewed ID document", when: "Today 11:02 AM", bot: false },
              ].filter(x => !x.hide).map((a, i) => (
                <div key={i} className="timeline-row">
                  <div className="timeline-dot" style={{ background: a.bot ? "#7565B0" : "var(--brand)" }}>
                    <Icon name={a.bot ? "sparkles" : "user"} className="icon-sm" />
                  </div>
                  <div className="text">
                    <strong>{a.actor}</strong> {a.what}
                    <div className="sub">{a.when}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sticky footer with primary action */}
        <div className="sheet-footer">
          {state === "checkedin" ? (
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }}>
              <Icon name="log-out" className="icon-sm" /> Check out
            </button>
          ) : state === "tentative" ? (
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }}>
              <Icon name="check" className="icon-sm" /> Confirm booking
            </button>
          ) : state === "unpaid" || state === "partial" ? (
            <>
              <button className="btn btn-accent btn-lg" style={{ flex: 1 }}>
                <Icon name="send" className="icon-sm" /> Send payment link
              </button>
              <button className="btn btn-lg">
                <Icon name="key" className="icon-sm" /> Check in
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }}>
              <Icon name="key" className="icon-sm" /> Check in
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

// ── Quick-add Modal ─────────────────────────────────────────────────────────
function QuickAdd({ open, onClose, prefill }) {
  const [step, setStep] = React.useState(1);
  const [data, setData] = React.useState({
    phone: "",
    name: "",
    nights: 2,
    adults: 2,
    children: 0,
    source: "direct",
    payment: "link",
    notes: "",
  });

  React.useEffect(() => {
    if (open) { setStep(1); setData(d => ({ ...d, nights: 2, adults: 2, children: 0, source: "direct" })); }
  }, [open]);

  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  // Mock guest lookup
  React.useEffect(() => {
    if (data.phone.replace(/\D/g, "").length >= 5) {
      const match = GUESTS.find(g => g.phone.includes(data.phone.slice(-5)));
      if (match) set("name", match.name);
    }
  }, [data.phone]);

  const rate = 6300;
  const total = data.nights * rate;
  const gst = Math.round(total * 0.05);

  return (
    <>
      <div className={"scrim " + (open ? "open" : "")} onClick={onClose} />
      <div className={"modal " + (open ? "open" : "")} role="dialog" aria-label="New booking">
        <div className="modal-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3>{step === 1 ? "Add booking" : "Confirm details"}</h3>
              <div className="sub">{step === 1 ? "Quickly capture the essentials — you can edit later." : "Review before sending the payment link."}</div>
            </div>
            <button className="icon-btn" onClick={onClose}><Icon name="x" className="icon-sm" /></button>
          </div>
        </div>

        {step === 1 ? (
          <div className="modal-body">
            <div className="field-row">
              <div className="field">
                <label>Guest mobile</label>
                <input
                  placeholder="+91 98xxx xxxxx"
                  value={data.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  inputMode="tel"
                  autoFocus
                />
                <div className="hint">We'll check if this guest has stayed before.</div>
              </div>
              <div className="field">
                <label>Guest name</label>
                <input
                  placeholder="Full name"
                  value={data.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
            </div>

            <div className="field-row thirds">
              <div className="field">
                <label>Nights</label>
                <Stepper value={data.nights} min={1} max={30} onChange={(v) => set("nights", v)} />
              </div>
              <div className="field">
                <label>Adults</label>
                <Stepper value={data.adults} min={1} max={6} onChange={(v) => set("adults", v)} />
              </div>
              <div className="field">
                <label>Children</label>
                <Stepper value={data.children} min={0} max={4} onChange={(v) => set("children", v)} />
              </div>
            </div>

            <div className="field">
              <label>Room</label>
              <select defaultValue={prefill?.roomId || "r-103"}>
                {ROOMS.map(r => (
                  <option key={r.id} value={r.id}>{r.num} — {r.name} ({RoomTypeById(r.type).name})</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Source</label>
              <div className="chips">
                {["direct", "walkin", "phone", "instagram", "whatsapp", "airbnb", "booking", "mmt"].map(s => (
                  <button
                    key={s}
                    type="button"
                    className={"chip" + (data.source === s ? " selected" : "")}
                    onClick={() => set("source", s)}
                  >
                    {channelLabel(s)}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Payment</label>
              <div className="chips">
                {[
                  { id: "link", label: "Send payment link", icon: "send" },
                  { id: "paid", label: "Already paid", icon: "check" },
                  { id: "later", label: "Collect at check-in", icon: "clock" },
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={"chip" + (data.payment === p.id ? " selected" : "")}
                    onClick={() => set("payment", p.id)}
                  >
                    <Icon name={p.icon} className="icon-sm" />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Notes <span className="hint">(optional)</span></label>
              <textarea rows="2" placeholder="Any preferences or special requests?" />
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="card" style={{ background: "var(--surface-2)", padding: 16 }}>
              <div style={{ fontSize: 11.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 6 }}>
                Summary
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.015em" }}>
                {data.name || "New guest"} · {data.nights} nights
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                {data.adults} adults{data.children ? `, ${data.children} children` : ""} · {channelLabel(data.source)}
              </div>
            </div>

            <div className="line-items" style={{ marginTop: 0 }}>
              <div className="li-row">
                <div>
                  <div>Room charge</div>
                  <div className="sub">₹ {rate.toLocaleString("en-IN")} × {data.nights} nights</div>
                </div>
                <div />
                <div className="money">{inr(total - gst)}</div>
              </div>
              <div className="li-row">
                <div>GST (5%)</div>
                <div />
                <div className="money">{inr(gst)}</div>
              </div>
              <div className="li-row total">
                <div>Total</div>
                <div />
                <div className="money">{inr(total)}</div>
              </div>
            </div>

            {data.payment === "link" && (
              <div style={{
                background: "var(--brand-tint)", border: "1px solid var(--brand-soft)",
                padding: 12, borderRadius: 12, fontSize: 13, display: "flex", gap: 10, alignItems: "center"
              }}>
                <Icon name="send" className="icon-sm" style={{ color: "var(--brand)" }} />
                <div>
                  <div style={{ fontWeight: 550 }}>Payment link will be sent</div>
                  <div className="text-xs text-muted">SMS to {data.phone || "the guest's mobile"} + WhatsApp + email if available.</div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="modal-footer">
          {step === 2 && <button className="btn" onClick={() => setStep(1)}>Back</button>}
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Cancel</button>
          {step === 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(2)}>
              Review <Icon name="arrow-right" className="icon-sm" />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onClose}>
              <Icon name="check" className="icon-sm" /> Create booking
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function Stepper({ value, min = 0, max = 99, onChange }) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Decrease">−</button>
      <span className="val">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label="Increase">+</button>
    </div>
  );
}

Object.assign(window, { BookingsList, BookingDetail, QuickAdd });
