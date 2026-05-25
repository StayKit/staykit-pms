import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { today, addDays, shortDate, nightsBetween, parseYmd } from "@/lib/dates";
import { inr } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { Avatar, ChannelChip, StatusPill, deriveState } from "@/components/ui";
import { BookingsFilters } from "@/components/owner/BookingsFilters";

export const dynamic = "force-dynamic";

type SortKey = "guest" | "checkIn" | "room" | "status" | "total";
const SORT_KEYS: SortKey[] = ["guest", "checkIn", "room", "status", "total"];

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    q?: string;
    from?: string;
    to?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const ctx = (await getAppContext())!;
  const sp = await searchParams;
  const { filter = "all", q, from, to } = sp;
  const sort = (SORT_KEYS as string[]).includes(sp.sort ?? "") ? (sp.sort as SortKey) : "checkIn";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
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
  if (filter === "cancelreq") where.cancelRequestedAt = { not: null };
  // Explicit check-in date range (audit P1 #7) takes precedence over the "today" preset.
  if (from || to) {
    where.checkIn = {
      ...(from ? { gte: parseYmd(from) } : {}),
      ...(to ? { lt: addDays(parseYmd(to), 1) } : {}),
    };
  }
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

  const STATUS_ORDER = ["TENTATIVE", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "NO_SHOW"];
  const sortValue = (b: (typeof bookings)[number]): string | number => {
    switch (sort) {
      case "guest":
        return (b.guests[0]?.guest.name ?? "").toLowerCase();
      case "room":
        return b.rooms[0]?.room.number ?? b.rooms[0]?.room.name ?? "";
      case "status":
        return STATUS_ORDER.indexOf(b.status);
      case "total":
        return b.totalAmount;
      default:
        return b.checkIn.getTime();
    }
  };
  bookings.sort((a, b) => {
    const av = sortValue(a);
    const bv = sortValue(b);
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    return dir === "asc" ? cmp : -cmp;
  });

  const sortHref = (col: SortKey): string => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("sort", col);
    // Toggle direction when re-clicking the active column.
    params.set("dir", sort === col && dir === "asc" ? "desc" : "asc");
    return "/bookings?" + params.toString();
  };
  const arrow = (col: SortKey) =>
    sort === col ? (dir === "asc" ? "chevron-up" : "chevron-down") : "chevron-down";

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
                <th>
                  <Link
                    className={"th-sort" + (sort === "guest" ? " active" : "")}
                    href={sortHref("guest")}
                  >
                    Guest <Icon name={arrow("guest")} className="icon-sm" />
                  </Link>
                </th>
                <th>
                  <Link
                    className={"th-sort" + (sort === "checkIn" ? " active" : "")}
                    href={sortHref("checkIn")}
                  >
                    Dates <Icon name={arrow("checkIn")} className="icon-sm" />
                  </Link>
                </th>
                <th>
                  <Link
                    className={"th-sort" + (sort === "room" ? " active" : "")}
                    href={sortHref("room")}
                  >
                    Room <Icon name={arrow("room")} className="icon-sm" />
                  </Link>
                </th>
                <th>Source</th>
                <th>
                  <Link
                    className={"th-sort" + (sort === "status" ? " active" : "")}
                    href={sortHref("status")}
                  >
                    Status <Icon name={arrow("status")} className="icon-sm" />
                  </Link>
                </th>
                <th style={{ textAlign: "right" }}>
                  <Link
                    className={"th-sort" + (sort === "total" ? " active" : "")}
                    href={sortHref("total")}
                  >
                    Total <Icon name={arrow("total")} className="icon-sm" />
                  </Link>
                </th>
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
                      {b.cancelRequestedAt && b.status !== "CANCELLED" && (
                        <div
                          className="pill pill-unpaid"
                          style={{ marginTop: 4, fontSize: 10.5, padding: "1px 6px" }}
                        >
                          <Icon name="clock" className="icon-sm" /> Cancel requested
                        </div>
                      )}
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
                  <td colSpan={7}>
                    <div className="empty-state">
                      <Icon name="book" className="icon" />
                      <div className="empty-title">
                        {filter !== "all" || q || from || to
                          ? "No bookings match these filters"
                          : "No bookings yet"}
                      </div>
                      <div className="empty-sub">
                        {filter !== "all" || q || from || to
                          ? "Try clearing the filters, or take a new booking."
                          : "Take your first booking to get started."}
                      </div>
                      <div className="empty-actions">
                        {(filter !== "all" || q || from || to) && (
                          <Link className="btn" href="/bookings">
                            Clear filters
                          </Link>
                        )}
                        <Link className="btn btn-primary" href="?new=1">
                          <Icon name="plus" className="icon-sm" /> New booking
                        </Link>
                      </div>
                    </div>
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
