import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = (await getAppContext())!;
  const { q } = await searchParams;

  const guests = await prisma.guest.findMany({
    where: {
      ownerId: ctx.ownerId,
      ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } : {}),
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { bookings: true } } },
  });

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Guests</h2>
          <div className="sub">{guests.length} guests in your address book</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn" href="/api/reports/guests.csv">
            <Icon name="external" className="icon-sm" /> Export CSV
          </a>
          <Link className="btn btn-primary" href="/bookings?new=1">
            <Icon name="user-plus" className="icon-sm" /> Add guest
          </Link>
        </div>
      </div>

      <div className="card">
        <GuestSearch />
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Phone</th>
                <th>City</th>
                <th>Stays</th>
                <th>Marketing consent</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.id} style={{ cursor: "default" }}>
                  <td>
                    <div className="guest-cell">
                      <Avatar name={g.name} id={g.id} size={32} />
                      <div>
                        <div
                          className="name"
                          style={{ display: "flex", alignItems: "center", gap: 6 }}
                        >
                          {g.name}
                          {g.isForeign && (
                            <Icon
                              name="globe"
                              className="icon-sm"
                              style={{ color: "var(--muted)" }}
                            />
                          )}
                        </div>
                        <div className="sub">{g.email ?? "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="tabular text-sm">{g.phone}</span>
                  </td>
                  <td className="text-sm">{g.city ?? "—"}</td>
                  <td>
                    <span className="pill pill-neutral">{g._count.bookings} stays</span>
                  </td>
                  <td>
                    {g.marketingConsent ? (
                      <span className="pill pill-brand">
                        <Icon name="check" className="icon-sm" /> Opted in
                      </span>
                    ) : (
                      <span className="pill pill-neutral">Not opted in</span>
                    )}
                  </td>
                  <td>
                    <Link className="icon-btn" href={`/guests/${g.id}`} aria-label="View guest">
                      <Icon name="chevron-right" className="icon-sm" />
                    </Link>
                  </td>
                </tr>
              ))}
              {guests.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <Icon name="users" className="icon" />
                      <div className="empty-title">
                        {q ? "No guests match your search" : "No guests yet"}
                      </div>
                      <div className="empty-sub">
                        Guests are added automatically when you take a booking.
                      </div>
                      <div className="empty-actions">
                        {q && (
                          <Link className="btn" href="/guests">
                            Clear search
                          </Link>
                        )}
                        <Link className="btn btn-primary" href="/bookings?new=1">
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

// Reuse the search input pattern; a tiny inline client search bound to ?q=.
function GuestSearch() {
  return (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
      <form className="search" action="/guests" method="get">
        <Icon name="search" className="icon" />
        <input name="q" placeholder="Search guests by name or phone…" />
      </form>
    </div>
  );
}
