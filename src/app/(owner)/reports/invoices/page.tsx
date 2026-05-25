import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { inr } from "@/lib/money";
import { longDate } from "@/lib/dates";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

/**
 * Invoice register (audit P0 #3). The legally-required ledger of issued tax invoices:
 * every gapless serial, the booking it belongs to, the taxable value and GST. A re-print
 * regenerates from the frozen number, never a new one.
 */
export default async function InvoiceRegisterPage() {
  const ctx = (await getAppContext())!;

  const invoices = await prisma.booking.findMany({
    where: { property: { ownerId: ctx.ownerId }, invoiceNumber: { not: null } },
    orderBy: { invoiceIssuedAt: "desc" },
    take: 500,
    include: {
      property: { select: { name: true } },
      guests: { where: { isPrimary: true }, include: { guest: { select: { name: true } } } },
    },
  });

  const taxable = invoices.reduce((s, b) => s + b.subtotal, 0);
  const gst = invoices.reduce((s, b) => s + b.taxAmount, 0);

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Invoice register</h2>
          <div className="sub">
            Gapless GST serials, issued when a booking is first paid. {invoices.length} issued.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn" href="/reports">
            <Icon name="chevron-left" className="icon-sm" /> Reports
          </Link>
          <a className="btn" href="/api/reports/invoices.csv">
            <Icon name="external" className="icon-sm" /> Export CSV
          </a>
        </div>
      </div>

      <div
        className="kpi-row"
        style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}
      >
        <Stat label="Invoices issued" value={String(invoices.length)} />
        <Stat label="Taxable value" value={inr(taxable)} />
        <Stat label="GST charged" value={inr(gst)} />
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Invoice no.</th>
              <th>Date</th>
              <th>Guest</th>
              <th>Booking</th>
              <th>Taxable</th>
              <th>GST</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((b) => (
              <tr key={b.id}>
                <td className="tabular" style={{ fontWeight: 600 }}>
                  {b.invoiceNumber}
                </td>
                <td className="text-sm">{b.invoiceIssuedAt ? longDate(b.invoiceIssuedAt) : "—"}</td>
                <td className="text-sm">{b.guests[0]?.guest.name ?? "Guest"}</td>
                <td>
                  <Link href={`/bookings/${b.id}`}>{b.ref}</Link>
                </td>
                <td className="tabular">{inr(b.subtotal)}</td>
                <td className="tabular">{inr(b.taxAmount)}</td>
                <td className="tabular">{inr(b.totalAmount)}</td>
                <td>
                  <a
                    className="btn btn-sm btn-ghost"
                    href={`/bookings/${b.id}/invoice`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon name="external" className="icon-sm" /> View
                  </a>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  No tax invoices issued yet. They appear here once a booking is paid.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="card" style={{ padding: 14, flex: 1, minWidth: 140 }}>
      <div className="text-xs text-muted">{label}</div>
      <div className="money" style={{ fontSize: 20 }}>
        {value}
      </div>
    </div>
  );
}
