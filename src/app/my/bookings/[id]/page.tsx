import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getGuestSession } from "@/lib/auth/session";
import { shortDate, nightsBetween } from "@/lib/dates";
import { inr } from "@/lib/money";
import { Icon } from "@/components/Icon";
import { onlinePaymentsEnabled } from "@/lib/payments/razorpay/client";

export const dynamic = "force-dynamic";

const DEFAULT_PAY_INSTRUCTIONS =
  "Please pay by cash at check-in, or message the host for UPI / bank transfer details. " +
  "Your booking is confirmed — the host verifies your payment after you pay.";

export default async function GuestBookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await getGuestSession();
  if (!session) redirect("/my");
  const { id } = await params;

  const b = await prisma.booking.findFirst({
    where: { id, guests: { some: { guest: { phone: session.phone } } } },
    include: {
      property: true,
      rooms: { include: { room: true } },
      paymentLinks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!b) notFound();

  const room = b.rooms[0]?.room;
  const due = b.totalAmount - b.amountPaid;
  const nights = nightsBetween(b.checkIn, b.checkOut);
  const payLink = b.paymentLinks[0];
  const onlineEnabled = await onlinePaymentsEnabled();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", padding: "24px 16px" }}>
        <Link href="/my/bookings" className="btn btn-sm" style={{ marginBottom: 16 }}>
          <Icon name="chevron-left" className="icon-sm" /> All bookings
        </Link>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "var(--shadow-1)",
          }}
        >
          <div style={{ padding: "18px 18px 14px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{b.ref}</div>
            <div style={{ fontWeight: 600, fontSize: 16, marginTop: 2 }}>
              {room ? `${room.name} · Room ${room.number}` : b.property.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {shortDate(b.checkIn)} → {shortDate(b.checkOut)} · {nights} nights
            </div>
          </div>

          <div style={{ padding: 18 }}>
            {due <= 0 ? (
              <div
                style={{
                  background: "var(--surface-2)",
                  borderRadius: 12,
                  padding: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Icon name="check" className="icon" style={{ color: "var(--st-checkedin)" }} />
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  Paid in full · {inr(b.totalAmount)}
                </div>
              </div>
            ) : (
              <>
                {onlineEnabled && payLink ? (
                  <a
                    href={payLink.shortUrl}
                    style={{
                      background: "var(--accent-soft)",
                      borderRadius: 12,
                      padding: 14,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Icon name="indian-rupee" className="icon" style={{ color: "var(--accent)" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {inr(due)} — pay online now
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        Secure payment via Razorpay
                      </div>
                    </div>
                    <Icon
                      name="chevron-right"
                      className="icon-sm"
                      style={{ color: "var(--accent)" }}
                    />
                  </a>
                ) : null}

                <div
                  style={{
                    background: "var(--surface-2)",
                    borderRadius: 12,
                    padding: 14,
                    marginTop: onlineEnabled && payLink ? 10 : 0,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="clock" className="icon-sm" style={{ color: "var(--st-unpaid)" }} />
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {inr(due)} due · Awaiting payment confirmation
                    </div>
                  </div>
                  <div
                    style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.6 }}
                  >
                    {b.property.paymentInstructions || DEFAULT_PAY_INSTRUCTIONS}
                  </div>
                </div>
              </>
            )}

            <div
              style={{
                marginTop: 14,
                fontSize: 12,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 600,
              }}
            >
              Your stay
            </div>
            <div
              style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 10,
                background: "var(--surface)",
                border: "1px solid var(--line)",
                fontSize: 12.5,
                lineHeight: 1.7,
              }}
            >
              <div>
                <b>Check-in</b> · {shortDate(b.checkIn)}, {b.property.checkInTime}
              </div>
              <div>
                <b>Check-out</b> · {shortDate(b.checkOut)}, {b.property.checkOutTime}
              </div>
              <div>
                <b>Guests</b> · {b.adults} adults{b.children ? `, ${b.children} children` : ""}
              </div>
              <div>
                <b>Total</b> · {inr(b.totalAmount)} ({inr(b.amountPaid)} paid)
              </div>
            </div>

            <button
              className="btn"
              style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
            >
              <Icon name="map-pin" className="icon-sm" /> How to reach us
            </button>
            <button
              className="btn btn-ghost"
              style={{
                width: "100%",
                justifyContent: "center",
                marginTop: 6,
                color: "var(--st-unpaid)",
              }}
            >
              Request to cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
