import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { today, shortDate, nightsBetween } from "@/lib/dates";
import { inr } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { Avatar, ChannelChip, StatusPill, deriveState } from "@/components/ui";
import { BookingsFilters } from "@/components/owner/BookingsFilters";
import { Pagination } from "@/components/owner/Pagination";
import { queryBookingIds, SORT_KEYS, type SortKey } from "@/lib/booking/list";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

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
    page?: string;
  }>;
}) {
  const ctx = (await getAppContext())!;
  const sp = await searchParams;
  const { filter = "all", q, from, to } = sp;
  const sort = (SORT_KEYS as string[]).includes(sp.sort ?? "") ? (sp.sort as SortKey) : "checkIn";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  // Filtering, sorting, and pagination all run in SQL (see lib/booking/list) so a
  // low-spec browser only ever receives one page of rows.
  const { ids, total } = await queryBookingIds({
    ownerId: ctx.ownerId,
    filter,
    q,
    from,
    to,
    sort,
    dir,
    page,
    pageSize: PAGE_SIZE,
    today: today(),
  });

  const hydrated = await prisma.booking.findMany({
    where: { id: { in: ids } },
    include: {
      guests: { where: { isPrimary: true }, include: { guest: true } },
      rooms: { include: { room: true } },
      channel: true,
    },
  });
  // findMany ignores `in` ordering, so restore the SQL-computed page order.
  const byId = new Map(hydrated.map((b) => [b.id, b]));
  const bookings = ids.map((id) => byId.get(id)!).filter(Boolean);

  const sortHref = (col: SortKey): string => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("sort", col);
    // Toggle direction when re-clicking the active column; sort change resets to page 1.
    params.set("dir", sort === col && dir === "asc" ? "desc" : "asc");
    return "/bookings?" + params.toString();
  };
  const arrow = (col: SortKey) =>
    sort === col ? (dir === "asc" ? "chevron-up" : "chevron-down") : "chevron-down";

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
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          basePath="/bookings"
          params={{ filter: filter === "all" ? undefined : filter, q, from, to, sort, dir }}
        />
      </div>
    </div>
  );
}
