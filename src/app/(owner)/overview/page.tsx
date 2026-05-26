import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { setActivePropertyAction } from "@/lib/actions/property";
import { today, addDays, longDate } from "@/lib/dates";
import { inr } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { Avatar, ChannelChip, deriveState, StatusPill } from "@/components/ui";
import { BookingLink } from "@/components/owner/BookingLink";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const ctx = (await getAppContext())!;
  const t0 = today();
  const t1 = addDays(t0, 1);

  const properties = await prisma.property.findMany({
    where: { ownerId: ctx.ownerId, active: true },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { rooms: true } } },
  });
  const propertyIds = properties.map((p) => p.id);

  const [arrivals, departures, occupiedTonight, pending] = await Promise.all([
    prisma.booking.findMany({
      where: {
        propertyId: { in: propertyIds },
        checkIn: { gte: t0, lt: t1 },
        status: { in: ["CONFIRMED", "TENTATIVE", "CHECKED_IN"] },
      },
      include: {
        property: { select: { id: true, name: true } },
        guests: { where: { isPrimary: true }, include: { guest: true } },
        rooms: { include: { room: true } },
        channel: true,
      },
      orderBy: { checkIn: "asc" },
    }),
    prisma.booking.findMany({
      where: { propertyId: { in: propertyIds }, checkOut: { gte: t0, lt: t1 } },
      select: { propertyId: true },
    }),
    prisma.bookingRoom.findMany({
      where: {
        date: { gte: t0, lt: t1 },
        room: { propertyId: { in: propertyIds } },
        booking: { status: { in: ["CONFIRMED", "CHECKED_IN"] } },
      },
      select: { roomId: true, room: { select: { propertyId: true } } },
    }),
    prisma.booking.findMany({
      where: {
        propertyId: { in: propertyIds },
        status: { in: ["CONFIRMED", "TENTATIVE", "CHECKED_IN"] },
      },
      select: { propertyId: true, totalAmount: true, amountPaid: true },
    }),
  ]);

  // Aggregate per property.
  const arrivalsBy = new Map<string, number>();
  for (const b of arrivals) arrivalsBy.set(b.propertyId, (arrivalsBy.get(b.propertyId) ?? 0) + 1);
  const departBy = new Map<string, number>();
  for (const d of departures) departBy.set(d.propertyId, (departBy.get(d.propertyId) ?? 0) + 1);
  const occBy = new Map<string, Set<string>>();
  for (const o of occupiedTonight) {
    const set = occBy.get(o.room.propertyId) ?? new Set<string>();
    set.add(o.roomId);
    occBy.set(o.room.propertyId, set);
  }
  const dueBy = new Map<string, number>();
  for (const p of pending) {
    const due = p.totalAmount - p.amountPaid;
    if (due > 0) dueBy.set(p.propertyId, (dueBy.get(p.propertyId) ?? 0) + due);
  }

  const totals = {
    rooms: properties.reduce((s, p) => s + p._count.rooms, 0),
    occ: [...occBy.values()].reduce((s, set) => s + set.size, 0),
    arrivals: arrivals.length,
    due: [...dueBy.values()].reduce((s, v) => s + v, 0),
  };

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Overview</h2>
          <div className="sub">
            {longDate(t0)} · {properties.length} propert
            {properties.length === 1 ? "y" : "ies"}
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <Stat label="Properties" value={String(properties.length)} />
        <Stat
          label="Occupied tonight"
          value={`${totals.rooms ? Math.round((totals.occ / totals.rooms) * 100) : 0}%`}
          sub={`${totals.occ} of ${totals.rooms} rooms`}
        />
        <Stat label="Arrivals today" value={String(totals.arrivals)} />
        <Stat label="Pending payments" value={inr(totals.due)} />
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h3>By property</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Property</th>
                <th>Tonight</th>
                <th>Arrivals</th>
                <th>Departures</th>
                <th style={{ textAlign: "right" }}>Pending</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => {
                const occ = occBy.get(p.id)?.size ?? 0;
                const pct = p._count.rooms ? Math.round((occ / p._count.rooms) * 100) : 0;
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 550 }}>{p.name}</td>
                    <td>
                      {occ}/{p._count.rooms} · {pct}%
                    </td>
                    <td>{arrivalsBy.get(p.id) ?? 0}</td>
                    <td>{departBy.get(p.id) ?? 0}</td>
                    <td style={{ textAlign: "right" }} className="money">
                      {inr(dueBy.get(p.id) ?? 0)}
                    </td>
                    <td>
                      <form
                        action={async () => {
                          "use server";
                          await setActivePropertyAction(p.id);
                          redirect("/dashboard");
                        }}
                      >
                        <button className="btn btn-sm" type="submit">
                          Open <Icon name="arrow-right" className="icon-sm" />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h3>Arrivals today — all properties</h3>
          <div className="sub" style={{ marginLeft: "auto" }}>
            {arrivals.length} expected
          </div>
        </div>
        <div className="card-body">
          {arrivals.length === 0 ? (
            <div className="empty">No arrivals across your properties today.</div>
          ) : (
            arrivals.map((b) => {
              const g = b.guests[0]?.guest;
              const room = b.rooms[0]?.room;
              return (
                <BookingLink key={b.id} id={b.id} className="arrivals-row">
                  {g && <Avatar name={g.name} id={g.id} />}
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{g?.name ?? "Guest"}</div>
                    <div className="sub">
                      {b.property.name} ·{" "}
                      <ChannelChip channelKey={b.channel.key} name={b.channel.name} />
                    </div>
                  </div>
                  <div className="room">{room ? `${room.number} · ${room.name}` : ""}</div>
                  <div className="actions">
                    <StatusPill state={deriveState(b)} />
                  </div>
                </BookingLink>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: Readonly<{ label: string; value: string; sub?: string }>) {
  return (
    <div className="kpi" style={{ cursor: "default" }}>
      <div className="label">
        <span className="dot" />
        {label}
      </div>
      <div className="value">
        <span className="tabular">{value}</span>
      </div>
      {sub && <div className="delta">{sub}</div>}
      <div className="accent-bar" />
    </div>
  );
}
