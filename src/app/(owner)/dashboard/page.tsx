import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { today, addDays, longDate, weekday } from "@/lib/dates";
import { inr } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { Avatar, ChannelChip, StatusPill, deriveState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = (await getAppContext())!;
  const property = (await prisma.property.findFirst({
    where: { ownerId: ctx.ownerId, active: true },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { rooms: true } } },
  }))!;

  const t0 = today();
  const t1 = addDays(t0, 1);
  const t7 = addDays(t0, 7);

  const [arrivals, departures, occupiedTonight, pending, strip, activity] = await Promise.all([
    prisma.booking.findMany({
      where: {
        propertyId: property.id,
        checkIn: { gte: t0, lt: t1 },
        status: { in: ["CONFIRMED", "TENTATIVE", "CHECKED_IN"] },
      },
      include: { guests: { where: { isPrimary: true }, include: { guest: true } }, rooms: { include: { room: true } }, channel: true },
    }),
    prisma.booking.count({ where: { propertyId: property.id, checkOut: { gte: t0, lt: t1 } } }),
    prisma.bookingRoom.findMany({
      where: {
        date: { gte: t0, lt: t1 },
        room: { propertyId: property.id },
        booking: { status: { in: ["CONFIRMED", "CHECKED_IN"] } },
      },
      select: { roomId: true },
    }),
    prisma.booking.findMany({
      where: {
        propertyId: property.id,
        status: { in: ["CONFIRMED", "TENTATIVE", "CHECKED_IN"] },
      },
      select: { totalAmount: true, amountPaid: true },
    }),
    prisma.bookingRoom.groupBy({
      by: ["date"],
      where: { date: { gte: t0, lt: t7 }, room: { propertyId: property.id } },
      _count: { _all: true },
    }),
    prisma.auditLog.findMany({ where: { ownerId: ctx.ownerId }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const totalRooms = property._count.rooms;
  const occRooms = new Set(occupiedTonight.map((o) => o.roomId)).size;
  const occPct = totalRooms ? Math.round((occRooms / totalRooms) * 100) : 0;
  const pendingRows = pending.filter((b) => b.amountPaid < b.totalAmount);
  const pendingTotal = pendingRows.reduce((s, b) => s + (b.totalAmount - b.amountPaid), 0);

  const stripByDate = new Map(strip.map((s) => [s.date.toISOString().slice(0, 10), s._count._all]));

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13.5, color: "var(--muted)" }}>{longDate(t0)}</div>
        <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em" }}>
          Good day, {ctx.name.split(" ")[0]}
        </h1>
        <div style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 6 }}>
          You have <b>{arrivals.length} arrivals</b> and <b>{pendingRows.length} payments still to collect</b> today.
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi label="Arriving today" value={String(arrivals.length)} footer="See list" href="#arrivals" />
        <Kpi label="Departing today" value={String(departures)} footer="See list" href="/bookings" />
        <Kpi label="Tonight's occupancy" value={`${occPct}`} unit="%" delta={`${occRooms} of ${totalRooms} rooms`} footer="View calendar" href="/calendar" />
        <Kpi label="Pending payments" prefix="₹" value={inr(pendingTotal, false)} delta={`${pendingRows.length} payment link${pendingRows.length === 1 ? "" : "s"}`} footer="Send reminders" href="/bookings?filter=unpaid" warm />
      </div>

      <div className="section-head">
        <div>
          <h2>Next 7 days</h2>
          <div className="sub">Tap a day to open the calendar.</div>
        </div>
        <Link className="btn btn-ghost btn-sm" href="/calendar">
          Full calendar <Icon name="arrow-right" className="icon-sm" />
        </Link>
      </div>
      <div className="strip">
        {Array.from({ length: 7 }).map((_, i) => {
          const d = addDays(t0, i);
          const key = d.toISOString().slice(0, 10);
          const sold = stripByDate.get(key) ?? 0;
          const occ = totalRooms ? sold / totalRooms : 0;
          return (
            <Link key={i} href="/calendar" className={"strip-cell " + (i === 0 ? "today" : "")}>
              <div className="dow">{i === 0 ? "Today" : weekday(d)}</div>
              <div className="date">{d.getUTCDate()}</div>
              <div className="occ">
                <div className="bar">
                  <div className="fill" style={{ width: `${Math.round(occ * 100)}%` }} />
                </div>
                <span className="tabular">{Math.round(occ * 100)}%</span>
              </div>
            </Link>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginTop: 28 }}>
        <div className="card" id="arrivals">
          <div className="card-header">
            <div>
              <h3>Today&apos;s arrivals</h3>
              <div className="sub" style={{ marginTop: 2 }}>{arrivals.length} guests expected</div>
            </div>
            <Link className="btn btn-primary btn-sm" href="?new=1" style={{ marginLeft: "auto" }}>
              <Icon name="plus" className="icon-sm" /> Add booking
            </Link>
          </div>
          <div className="card-body">
            {arrivals.length === 0 ? (
              <div className="empty">Nothing on the books for today.</div>
            ) : (
              arrivals.map((b) => {
                const g = b.guests[0]?.guest;
                const room = b.rooms[0]?.room;
                const state = deriveState(b);
                return (
                  <Link key={b.id} href={`/bookings/${b.id}`} className="arrivals-row">
                    {g && <Avatar name={g.name} id={g.id} />}
                    <div style={{ minWidth: 0 }}>
                      <div className="name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {g?.name ?? "Guest"}
                        {g?.isForeign && (
                          <span className="pill pill-outline" style={{ fontSize: 10.5, padding: "1px 6px" }}>
                            <Icon name="globe" className="icon-sm" />
                            Foreign national
                          </span>
                        )}
                      </div>
                      <div className="sub">
                        <ChannelChip channelKey={b.channel.key} name={b.channel.name} />
                      </div>
                    </div>
                    <div className="room">{room ? `${room.number} · ${room.name}` : ""}</div>
                    <div className="actions">
                      {state === "unpaid" || state === "partial" ? (
                        <span className="btn btn-sm"><Icon name="send" className="icon-sm" /> Send link</span>
                      ) : (
                        <StatusPill state="paid">Paid</StatusPill>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h3>Recent activity</h3>
              <div className="sub" style={{ marginTop: 2 }}>What&apos;s happened today</div>
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {activity.map((a) => (
              <div key={a.id} className="activity-row">
                <div className={"activity-dot " + (a.actorType === "MCP" ? "accent" : a.actorType === "SYSTEM" ? "brand" : "")}>
                  <Icon name={a.actorType === "MCP" ? "sparkles" : a.actorType === "SYSTEM" ? "indian-rupee" : "user"} className="icon-sm" />
                </div>
                <div className="text">
                  <strong>{a.actorName}</strong>
                  {a.actorType === "MCP" && (
                    <span className="bot-tag"><Icon name="sparkles" className="icon-sm" /> AI</span>
                  )}{" "}
                  {a.summary}
                </div>
                <div className="when">{relTime(a.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="checklist-card" style={{ marginTop: 28 }}>
        <div className="icon-wrap"><Icon name="sparkles" className="icon" /></div>
        <div className="text">
          <div className="title">Run your homestay from Claude.ai</div>
          <div className="sub">
            Connect StayKit to Claude as a custom connector. Ask &quot;Send a payment reminder to everyone
            arriving tomorrow&quot; — every action is logged and reversible.
          </div>
        </div>
        <Link className="btn" href="/assistant">
          <Icon name="external" className="icon-sm" /> Set up MCP
        </Link>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
  prefix,
  delta,
  footer,
  href,
  warm,
}: {
  label: string;
  value: string;
  unit?: string;
  prefix?: string;
  delta?: string;
  footer: string;
  href: string;
  warm?: boolean;
}) {
  return (
    <Link href={href} className={"kpi " + (warm ? "accent-warm" : "")}>
      <div className="label"><span className={"dot " + (warm ? "accent" : "")} />{label}</div>
      <div className="value">
        {prefix && <span style={{ fontSize: 20, color: "var(--muted)", marginRight: 2, fontWeight: 500 }}>{prefix}</span>}
        <span className="tabular">{value}</span>
        {unit && <span className="unit">{unit}</span>}
      </div>
      {delta && <div className="delta">{delta}</div>}
      <div className="footer-link" style={{ color: warm ? "var(--accent)" : "var(--brand)" }}>
        {footer} <Icon name="arrow-right" className="icon-sm" />
      </div>
      <div className="accent-bar" />
    </Link>
  );
}

function relTime(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
