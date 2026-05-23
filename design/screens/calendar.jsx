// Calendar / Tape Chart screen.
// Layout: each "room row" is a flex row with a sticky label + an absolutely-positioned
// strip of bars overlaid on a tiled day-cell background. Much simpler than fighting CSS grid.

const CELL_W = 76;            // px per day column
const ROW_H = 56;             // px per room row
const LABEL_W = 220;          // px width of the sticky room-label column
const GROUP_H = 34;           // px height of room-type group headers
const HEADER_H = 56;          // px height of the date header row

function TapeChart({ onOpenBooking, onOpenAdd }) {
  const [view, setView] = React.useState("14");
  const [propIdx, setPropIdx] = React.useState(0);
  const startOffset = -2;

  const days = view === "week" ? 7 : view === "month" ? 30 : 14;
  const dates = React.useMemo(() => {
    const out = [];
    for (let i = 0; i < days; i++) out.push(addDays(_today, startOffset + i));
    return out;
  }, [days, startOffset]);

  const groups = ROOM_TYPES.map(t => ({
    type: t,
    rooms: ROOMS.filter(r => r.type === t.id),
  })).filter(g => g.rooms.length > 0);

  const stripWidthPx = days * CELL_W;
  const startMs = dates[0].getTime();

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Calendar</h2>
          <div className="sub">Tap a cell to book. Click a bar to open the booking.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn">
            <Icon name="filter" className="icon-sm" />
            Filters
          </button>
          <button className="btn">
            <Icon name="lock" className="icon-sm" />
            Block dates
          </button>
          <button className="btn btn-primary" onClick={() => onOpenAdd()}>
            <Icon name="plus" className="icon-sm" />
            New booking
          </button>
        </div>
      </div>

      <div className="tape-wrap">
        {/* Toolbar */}
        <div className="tape-toolbar">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {PROPERTIES.map((p, i) => (
              <button
                key={p.id}
                className={"chip" + (i === propIdx ? " selected" : "")}
                onClick={() => setPropIdx(i)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button className="icon-btn" title="Previous"><Icon name="chevron-left" className="icon-sm" /></button>
            <div style={{ fontSize: 13.5, fontWeight: 550, padding: "0 8px", minWidth: 180, textAlign: "center" }}>
              {dates[0].toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – {dates[dates.length - 1].toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </div>
            <button className="icon-btn" title="Next"><Icon name="chevron-right" className="icon-sm" /></button>
            <div style={{ width: 8 }} />
            <div className="seg">
              <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Week</button>
              <button className={view === "14" ? "active" : ""} onClick={() => setView("14")}>14 days</button>
              <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>Month</button>
            </div>
            <button className="btn btn-sm">Today</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="tape-scroll">
          <div style={{ minWidth: LABEL_W + stripWidthPx }}>
            {/* Header row */}
            <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 6, background: "var(--surface)" }}>
              <div
                className="tape-corner"
                style={{ width: LABEL_W, flex: `0 0 ${LABEL_W}px`, height: HEADER_H }}
              >
                Room
              </div>
              <div style={{ display: "flex" }}>
                {dates.map((d, i) => {
                  const dow = d.getDay();
                  const weekend = dow === 0 || dow === 6;
                  const isToday = d.getTime() === _today.getTime();
                  return (
                    <div
                      key={i}
                      className={"tape-header-cell " + (weekend ? "weekend " : "") + (isToday ? "today" : "")}
                      style={{ width: CELL_W, flex: `0 0 ${CELL_W}px`, height: HEADER_H }}
                    >
                      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        {d.toLocaleDateString("en-IN", { weekday: "short" })}
                      </div>
                      <div className="day">{d.getDate()}</div>
                      <div style={{ fontSize: 10, marginTop: 1, opacity: 0.7 }}>
                        {d.toLocaleDateString("en-IN", { month: "short" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Body — one block per room-type group */}
            {groups.map(group => (
              <div key={group.type.id}>
                {/* Group header */}
                <div
                  className="tape-room-type-row"
                  style={{ height: GROUP_H, position: "sticky", left: 0, zIndex: 3 }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: group.type.color }} />
                  {group.type.name}
                  <span style={{
                    marginLeft: 6, color: "var(--muted-2)", textTransform: "none",
                    letterSpacing: 0, fontWeight: 500, fontSize: 11
                  }}>
                    {group.rooms.length} rooms
                  </span>
                </div>

                {/* Each room row */}
                {group.rooms.map(room => {
                  const roomBookings = BOOKINGS.filter(b => b.roomId === room.id);
                  return (
                    <div key={room.id} style={{ display: "flex", position: "relative", height: ROW_H }}>
                      {/* Label */}
                      <div
                        className="tape-room-label"
                        style={{ width: LABEL_W, flex: `0 0 ${LABEL_W}px`, height: ROW_H, position: "sticky", left: 0, zIndex: 2 }}
                      >
                        <div>
                          <div className="num">{room.num}</div>
                          <div className="type">{room.name}</div>
                        </div>
                        <div className={"clean " + (room.clean !== "clean" ? room.clean : "")} title={"Cleaning: " + room.clean} />
                      </div>

                      {/* Day cell strip + bars */}
                      <div style={{ position: "relative", display: "flex", height: ROW_H }}>
                        {dates.map((d, i) => {
                          const dow = d.getDay();
                          const weekend = dow === 0 || dow === 6;
                          const isToday = d.getTime() === _today.getTime();
                          return (
                            <div
                              key={i}
                              className={"tape-cell " + (weekend ? "weekend " : "") + (isToday ? "today-col" : "")}
                              style={{ width: CELL_W, flex: `0 0 ${CELL_W}px`, height: ROW_H }}
                              onClick={() => onOpenAdd({ roomId: room.id, date: d })}
                            />
                          );
                        })}

                        {/* Bars overlaid */}
                        {roomBookings.map(b => {
                          const visStartMs = Math.max(b.startDate.getTime(), startMs);
                          const visEndMs = Math.min(b.endDate.getTime(), startMs + days * 86400000);
                          if (visEndMs <= visStartMs) return null;
                          const startCol = Math.round((visStartMs - startMs) / 86400000);
                          const endCol = Math.round((visEndMs - startMs) / 86400000);
                          const spanDays = endCol - startCol;
                          if (spanDays <= 0) return null;

                          const state = paymentState(b);
                          const g = b.guestId ? GuestById(b.guestId) : null;

                          // Half-day offset so bars look like "noon to noon"
                          const leftPx = startCol * CELL_W + CELL_W * 0.35;
                          const widthPx = spanDays * CELL_W - CELL_W * 0.70;

                          return (
                            <div
                              key={b.id}
                              className={bbClass(state)}
                              style={{ left: leftPx, width: widthPx }}
                              onClick={(e) => { e.stopPropagation(); onOpenBooking(b.id); }}
                              title={g ? `${g.name} · ${shortDate(b.startDate)} → ${shortDate(b.endDate)} · ${inr(b.total)}` : "Owner block"}
                            >
                              {state === "block" ? (
                                <>
                                  <Icon name="lock" className="icon-sm" />
                                  <span className="name">Blocked</span>
                                  <span className="meta">{b.note}</span>
                                </>
                              ) : (
                                <>
                                  <span className="name">{g.name}</span>
                                  <span className="meta">{b.nights}n · {inr(b.total)}</span>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="tape-legend">
          <Legend swatchClass="bb-tentative" label="Tentative" />
          <Legend swatchClass="bb-unpaid" label="Confirmed — unpaid" />
          <Legend swatchClass="bb-partial" label="Part-paid" />
          <Legend swatchClass="bb-paid" label="Paid" />
          <Legend swatchClass="bb-checkedin" label="Checked in" />
          <Legend swatchClass="bb-checkedout" label="Checked out" />
          <Legend swatchClass="bb-block" label="Block / maintenance" />
        </div>
      </div>

      {/* Tip */}
      <div style={{ marginTop: 16, fontSize: 12.5, color: "var(--muted)", display: "flex", gap: 6, alignItems: "center" }}>
        <Icon name="info" className="icon-sm" />
        Tip: drag a bar to move the booking. Drag its edges to extend or shorten the stay.
      </div>
    </div>
  );
}

function Legend({ swatchClass, label }) {
  return (
    <div className="legend-item">
      <span className={"legend-swatch " + swatchClass} />
      <span>{label}</span>
    </div>
  );
}

Object.assign(window, { TapeChart });
