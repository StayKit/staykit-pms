import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { today, addDays, shortDate, nightsBetween } from "@/lib/dates";
import { inr } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { Avatar, ChannelChip, StatusPill, deriveState } from "@/components/ui";
import { BookingsFilters } from "@/components/owner/BookingsFilters";

export const dynamic = "force-dynamic";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const ctx = (await getAppContext())!;
  const { filter = "all", q } = await searchParams;
  const t0 = today();
  const t1 = addDays(t0, 1);

  const where: Prisma.BookingWhereInput = {
    property: { ownerId: ctx.ownerId },
    status: { notIn: ["CANCELLED"] },
  };
  if (filter === "today") where.checkIn = { gte: t0, lt: t1 };
  if (filter === "tentative") where.status = "TENTATIVE";
  if (filter === "checkedin") where.status = "CHECKED_IN";
  if (filter === "foreign") where.guests = { some: { guest: { isForeign: true } } };
  if (q) {
    where.OR = [
      { ref: { contains: q } },
      { guests: { some: { guest: { name: { contains: q } } } } },
      { guests: { some: { guest: { phone: { contains: q } } } } },
    ];
  }

  let bookings = await prisma.booking.findMany({
    where,
    orderBy: { checkIn: "asc" },
    include: {
      guests: { where: { isPrimary: true }, include: { guest: true } },
      rooms: { include: { room: true } },
      channel: true,
    },
  });
  if (filter === "unpaid") bookings = bookings.filter((b) => b.amountPaid < b.totalAmount);

  const total = await prisma.booking.count({
    where: { property: { ownerId: ctx.ownerId }, status: { notIn: ["CANCELLED"] } },
  });

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Bookings</h2>
          <div className="sub">{total} bookings · live view</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn" href="/api/reports/bookings.csv">
            <Icon name="external" className="icon-sm" /> Export CSV
          </Link>
          <Link className="btn btn-primary" href="?new=1">
            <Icon name="plus" className="icon-sm" /> New booking
          </Link>
        </div>
      </div>

      <div className="card">
        <BookingsFilters />
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
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const g = b.guests[0]?.guest;
                const room = b.rooms[0]?.room;
                const state = deriveState(b);
                const due = b.totalAmount - b.amountPaid;
                const nights = nightsBetween(b.checkIn, b.checkOut);
                return (
                  <tr key={b.id} style={{ cursor: "pointer" }}>
                    <td>
                      <Link
                        href={`/bookings/${b.id}`}
                        className="guest-cell"
                        style={{ color: "inherit" }}
                      >
                        {g && <Avatar name={g.name} id={g.id} size={32} />}
                        <div>
                          <div className="name">
                            {g?.name}{" "}
                            {g?.isForeign && (
                              <Icon
                                name="globe"
                                className="icon-sm"
                                style={{ color: "var(--muted)", marginLeft: 2 }}
                              />
                            )}
                          </div>
                          <div className="sub">{g?.phone}</div>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 550, fontSize: 13 }}>
                        {shortDate(b.checkIn)} → {shortDate(b.checkOut)}
                      </div>
                      <div className="text-muted text-xs">
                        {nights} night{nights > 1 ? "s" : ""} · {b.adults + b.children} guests
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 550, fontSize: 13 }}>{room?.number}</div>
                      <div className="text-muted text-xs">{room?.name}</div>
                    </td>
                    <td>
                      <ChannelChip channelKey={b.channel.key} name={b.channel.name} />
                    </td>
                    <td>
                      <StatusPill state={state} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="money" style={{ fontWeight: 600 }}>
                        {inr(b.totalAmount)}
                      </div>
                      {due > 0 && (
                        <div className="text-xs" style={{ color: "var(--st-unpaid)" }}>
                          {inr(due)} due
                        </div>
                      )}
                    </td>
                    <td>
                      <Link className="icon-btn" href={`/bookings/${b.id}`}>
                        <Icon name="chevron-right" className="icon-sm" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    No bookings match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
