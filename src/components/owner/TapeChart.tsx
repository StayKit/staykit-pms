"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

const CELL_W = 76;
const ROW_H = 56;
const LABEL_W = 220;
const GROUP_H = 34;
const HEADER_H = 56;
const DAY_MS = 86_400_000;

export interface TapeRoom {
  id: string;
  number: string;
  name: string;
  cleanliness: string;
}
export interface TapeGroup {
  typeId: string;
  typeName: string;
  color: string;
  rooms: TapeRoom[];
}
export interface TapeBooking {
  id: string;
  roomId: string;
  label: string;
  checkIn: string; // ISO date
  checkOut: string; // ISO date
  state: string;
  meta: string;
  isBlock: boolean;
}

const cleanClass: Record<string, string> = {
  CLEAN: "",
  DIRTY: "dirty",
  IN_PROGRESS: "progress",
  OUT_OF_ORDER: "dirty",
};

export function TapeChart({
  anchorIso,
  groups,
  bookings,
  properties,
  activePropertyId,
}: {
  anchorIso: string;
  groups: TapeGroup[];
  bookings: TapeBooking[];
  properties: { id: string; name: string }[];
  activePropertyId: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<"week" | "14" | "month">("14");
  const [offset, setOffset] = useState(0); // weeks of paging
  const days = view === "week" ? 7 : view === "month" ? 30 : 14;
  const startOffset = -2 + offset * days;

  const anchor = useMemo(() => new Date(anchorIso + "T00:00:00.000Z"), [anchorIso]);
  const todayMs = anchor.getTime();
  const dates = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(anchor);
      d.setUTCDate(d.getUTCDate() + startOffset + i);
      out.push(d);
    }
    return out;
  }, [anchor, days, startOffset]);

  const startMs = dates[0].getTime();
  const stripWidth = days * CELL_W;

  function openBooking(id: string) {
    router.push(`/bookings/${id}`);
  }
  function quickAdd(roomId: string, iso: string) {
    router.push(`?new=1&room=${roomId}&date=${iso}`);
  }

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Calendar</h2>
          <div className="sub">Tap a cell to book. Click a bar to open the booking.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn"><Icon name="filter" className="icon-sm" /> Filters</button>
          <button className="btn"><Icon name="lock" className="icon-sm" /> Block dates</button>
        </div>
      </div>

      <div className="tape-wrap">
        <div className="tape-toolbar">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {properties.map((p) => (
              <button
                key={p.id}
                className={"chip" + (p.id === activePropertyId ? " selected" : "")}
                onClick={() => router.push(`/calendar?property=${p.id}`)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <button className="icon-btn" title="Previous" onClick={() => setOffset((o) => o - 1)}>
              <Icon name="chevron-left" className="icon-sm" />
            </button>
            <div style={{ fontSize: 13.5, fontWeight: 550, padding: "0 8px", minWidth: 180, textAlign: "center" }}>
              {fmt(dates[0])} – {fmt(dates[dates.length - 1], true)}
            </div>
            <button className="icon-btn" title="Next" onClick={() => setOffset((o) => o + 1)}>
              <Icon name="chevron-right" className="icon-sm" />
            </button>
            <div style={{ width: 8 }} />
            <div className="seg">
              <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Week</button>
              <button className={view === "14" ? "active" : ""} onClick={() => setView("14")}>14 days</button>
              <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>Month</button>
            </div>
            <button className="btn btn-sm" onClick={() => setOffset(0)}>Today</button>
          </div>
        </div>

        <div className="tape-scroll">
          <div style={{ minWidth: LABEL_W + stripWidth }}>
            {/* Header row */}
            <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 6, background: "var(--surface)" }}>
              <div className="tape-corner" style={{ width: LABEL_W, flex: `0 0 ${LABEL_W}px`, height: HEADER_H }}>
                Room
              </div>
              <div style={{ display: "flex" }}>
                {dates.map((d, i) => {
                  const wknd = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                  const isToday = d.getTime() === todayMs;
                  return (
                    <div
                      key={i}
                      className={"tape-header-cell " + (wknd ? "weekend " : "") + (isToday ? "today" : "")}
                      style={{ width: CELL_W, flex: `0 0 ${CELL_W}px`, height: HEADER_H }}
                    >
                      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        {d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })}
                      </div>
                      <div className="day">{d.getUTCDate()}</div>
                      <div style={{ fontSize: 10, marginTop: 1, opacity: 0.7 }}>
                        {d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {groups.map((group) => (
              <div key={group.typeId}>
                <div className="tape-room-type-row" style={{ height: GROUP_H, position: "sticky", left: 0, zIndex: 3 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: group.color }} />
                  {group.typeName}
                  <span style={{ marginLeft: 6, color: "var(--muted-2)", textTransform: "none", letterSpacing: 0, fontWeight: 500, fontSize: 11 }}>
                    {group.rooms.length} rooms
                  </span>
                </div>

                {group.rooms.map((room) => {
                  const roomBookings = bookings.filter((b) => b.roomId === room.id);
                  return (
                    <div key={room.id} style={{ display: "flex", position: "relative", height: ROW_H }}>
                      <div
                        className="tape-room-label"
                        style={{ width: LABEL_W, flex: `0 0 ${LABEL_W}px`, height: ROW_H, position: "sticky", left: 0, zIndex: 2 }}
                      >
                        <div>
                          <div className="num">{room.number}</div>
                          <div className="type">{room.name}</div>
                        </div>
                        <div className={"clean " + cleanClass[room.cleanliness]} title={"Cleaning: " + room.cleanliness} />
                      </div>

                      <div style={{ position: "relative", display: "flex", height: ROW_H }}>
                        {dates.map((d, i) => {
                          const wknd = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                          const isToday = d.getTime() === todayMs;
                          const iso = d.toISOString().slice(0, 10);
                          return (
                            <div
                              key={i}
                              className={"tape-cell " + (wknd ? "weekend " : "") + (isToday ? "today-col" : "")}
                              style={{ width: CELL_W, flex: `0 0 ${CELL_W}px`, height: ROW_H }}
                              onClick={() => quickAdd(room.id, iso)}
                            />
                          );
                        })}

                        {roomBookings.map((b) => {
                          const ci = new Date(b.checkIn + "T00:00:00.000Z").getTime();
                          const co = new Date(b.checkOut + "T00:00:00.000Z").getTime();
                          const visStart = Math.max(ci, startMs);
                          const visEnd = Math.min(co, startMs + days * DAY_MS);
                          if (visEnd <= visStart) return null;
                          const startCol = Math.round((visStart - startMs) / DAY_MS);
                          const endCol = Math.round((visEnd - startMs) / DAY_MS);
                          const span = endCol - startCol;
                          /* v8 ignore next -- defensive: day-aligned bars always span ≥1 column */
                          if (span <= 0) return null;
                          const leftPx = startCol * CELL_W + CELL_W * 0.35;
                          const widthPx = span * CELL_W - CELL_W * 0.7;
                          return (
                            <div
                              key={b.id}
                              className={"booking-bar bb-" + b.state}
                              style={{ left: leftPx, width: widthPx }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!b.isBlock) openBooking(b.id);
                              }}
                              title={`${b.label} · ${b.meta}`}
                            >
                              {b.isBlock ? (
                                <>
                                  <Icon name="lock" className="icon-sm" />
                                  <span className="name">Blocked</span>
                                  <span className="meta">{b.meta}</span>
                                </>
                              ) : (
                                <>
                                  <span className="name">{b.label}</span>
                                  <span className="meta">{b.meta}</span>
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

        <div className="tape-legend">
          {[
            ["bb-tentative", "Tentative"],
            ["bb-unpaid", "Confirmed — unpaid"],
            ["bb-partial", "Part-paid"],
            ["bb-paid", "Paid"],
            ["bb-checkedin", "Checked in"],
            ["bb-checkedout", "Checked out"],
            ["bb-block", "Block / maintenance"],
          ].map(([cls, label]) => (
            <div className="legend-item" key={cls}>
              <span className={"legend-swatch " + cls} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 12.5, color: "var(--muted)", display: "flex", gap: 6, alignItems: "center" }}>
        <Icon name="info" className="icon-sm" />
        Tip: click an empty cell to start a booking for that room and date.
      </div>
    </div>
  );
}

function fmt(d: Date, withYear = false): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });
}
