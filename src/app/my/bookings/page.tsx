import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getGuestSession } from "@/lib/auth/session";
import { shortDate } from "@/lib/dates";
import { inr } from "@/lib/money";
import { StatusPill, deriveState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your bookings — StayKit" };

export default async function GuestBookings() {
  const session = await getGuestSession();
  if (!session) redirect("/my");

  const bookings = await prisma.booking.findMany({
    where: {
      guests: { some: { guest: { phone: session.phone } } },
      status: { notIn: ["CANCELLED"] },
    },
    include: { property: true, rooms: { include: { room: true } } },
    orderBy: { checkIn: "desc" },
  });

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "24px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 18 }}>Your bookings</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{session.phone}</div>
          </div>
          <form action="/api/auth/guest/logout" method="post">
            <button className="btn btn-sm">Sign out</button>
          </form>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {bookings.length === 0 && <div className="empty">No bookings found for this number.</div>}
          {bookings.map((b) => {
            const room = b.rooms[0]?.room;
            const due = b.totalAmount - b.amountPaid;
            const state = deriveState(b);
            return (
              <Link
                key={b.id}
                href={`/my/bookings/${b.id}`}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: 14,
                  padding: 14,
                  boxShadow: "var(--shadow-1)",
                  display: "block",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{b.property.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  {room ? `${room.name} · Room ${room.number}` : ""}
                </div>
                <div style={{ fontSize: 12.5, marginTop: 8 }}>
                  {shortDate(b.checkIn)} – {shortDate(b.checkOut)}
                </div>
                <div style={{ display: "flex", alignItems: "center", marginTop: 10, gap: 6 }}>
                  <StatusPill state={state} />
                </div>
                {due > 0 && (
                  <div
                    className="btn btn-accent"
                    style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
                  >
                    Pay {inr(due)}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
