import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { inr } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function PaymentsReportPage() {
  const ctx = (await getAppContext())!;

  const [payments, refunds] = await Promise.all([
    prisma.payment.findMany({
      where: {
        booking: { property: { ownerId: ctx.ownerId } },
        status: { in: ["CAPTURED", "REFUNDED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { booking: true },
    }),
    prisma.refund.findMany({
      where: { booking: { property: { ownerId: ctx.ownerId } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { booking: true },
    }),
  ]);

  const collected = payments.reduce((s, p) => s + p.amount, 0);
  const refunded = refunds
    .filter((r) => r.status === "PROCESSED")
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Payments & reconciliation</h2>
          <div className="sub">Razorpay captures, refunds and settlement status.</div>
        </div>
      </div>

      <div
        className="kpi-row"
        style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}
      >
        <Stat label="Collected" value={inr(collected)} />
        <Stat label="Refunded" value={inr(refunded)} tone="var(--st-unpaid)" />
        <Stat label="Net" value={inr(collected - refunded)} tone="var(--st-checkedin)" />
      </div>

      <div className="card" style={{ overflow: "hidden", marginBottom: 16 }}>
        <div
          style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", fontWeight: 600 }}
        >
          Payments
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Booking</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Settlement</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/bookings/${p.bookingId}`}>{p.booking.ref}</Link>
                </td>
                <td className="tabular">{inr(p.amount)}</td>
                <td className="text-sm">{(p.method ?? "—").toUpperCase()}</td>
                <td className="text-sm">{p.status.toLowerCase()}</td>
                <td className="text-sm text-muted">{p.settlementId ?? "pending"}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No payments recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", fontWeight: 600 }}
        >
          Refunds
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Booking</th>
              <th>Amount</th>
              <th>Reason</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/bookings/${r.bookingId}`}>{r.booking.ref}</Link>
                </td>
                <td className="tabular">{inr(r.amount)}</td>
                <td className="text-sm">{r.reason ?? "—"}</td>
                <td className="text-sm">{r.status.toLowerCase()}</td>
              </tr>
            ))}
            {refunds.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  No refunds yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: Readonly<{ label: string; value: string; tone?: string }>) {
  return (
    <div className="card" style={{ padding: 14, flex: 1, minWidth: 140 }}>
      <div className="text-xs text-muted">{label}</div>
      <div className="money" style={{ fontSize: 20, color: tone }}>
        {value}
      </div>
    </div>
  );
}
