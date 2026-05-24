/**
 * Printable GST invoice (HTML). The owner prints to PDF from the browser — no PDF
 * dependency in v1. Intra-state supply splits GST into CGST + SGST halves; SAC 996311.
 * Route handlers bypass the (owner) layout, so this renders as a clean standalone page.
 */
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { inr } from "@/lib/money";
import { GST } from "@/lib/config";
import { longDate, nightsBetween } from "@/lib/dates";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;

  const b = await prisma.booking.findFirst({
    where: { id, property: { ownerId: ctx.ownerId } },
    include: {
      property: true,
      guests: { where: { isPrimary: true }, include: { guest: true } },
      rooms: { include: { room: { include: { roomType: true } } } },
    },
  });
  if (!b) return new Response("Not found", { status: 404 });

  const guest = b.guests[0]?.guest;
  const nights = nightsBetween(b.checkIn, b.checkOut);
  const hasGst = !!b.property.gstin && b.taxAmount > 0;
  const halfTax = Math.round(b.taxAmount / 2);
  const invoiceNo = `${b.property.invoicePrefix}-${b.ref}`;

  const html = `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Invoice ${esc(invoiceNo)}</title>
<style>
  :root { font-family: ui-sans-serif, system-ui, sans-serif; color: #1f2937; }
  body { max-width: 760px; margin: 24px auto; padding: 0 20px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .muted { color: #6b7280; font-size: 13px; }
  .row { display: flex; justify-content: space-between; gap: 24px; margin-top: 18px; }
  table { width: 100%; border-collapse: collapse; margin-top: 22px; font-size: 14px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e5e7eb; }
  td.amt, th.amt { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { border: none; }
  .tot { font-weight: 700; font-size: 16px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:6px; background:#ecfdf5; color:#047857; font-size:12px; }
  @media print { .noprint { display: none; } body { margin: 0; } }
</style></head>
<body>
  <button class="noprint" onclick="window.print()" style="float:right;padding:8px 14px">Print / Save PDF</button>
  <h1>${esc(b.property.name)}</h1>
  <div class="muted">${esc(b.property.addressLine1)}${b.property.addressLine2 ? ", " + esc(b.property.addressLine2) : ""}, ${esc(b.property.city)} ${esc(b.property.pincode)}</div>
  ${b.property.gstin ? `<div class="muted">GSTIN: ${esc(b.property.gstin)} · SAC ${GST.sacCode}</div>` : `<div class="muted">Not GST-registered</div>`}

  <div class="row">
    <div>
      <div class="muted">Billed to</div>
      <div><strong>${esc(guest?.name ?? "Guest")}</strong></div>
      <div class="muted">${esc(guest?.phone ?? "")}${guest?.city ? " · " + esc(guest.city) : ""}</div>
    </div>
    <div style="text-align:right">
      <div class="muted">Invoice</div>
      <div><strong>${esc(invoiceNo)}</strong></div>
      <div class="muted">${longDate(b.createdAt)}</div>
    </div>
  </div>

  <table>
    <thead><tr><th>Description</th><th class="amt">Amount</th></tr></thead>
    <tbody>
      <tr>
        <td>Room — ${esc(b.rooms[0]?.room.roomType.name ?? "Stay")} · ${nights} night${nights > 1 ? "s" : ""}<br/>
          <span class="muted">${longDate(b.checkIn)} → ${longDate(b.checkOut)}</span></td>
        <td class="amt">${inr(b.subtotal)}</td>
      </tr>
      ${
        hasGst
          ? `<tr><td>CGST @ ${(GST.lowRate * 50).toFixed(1)}%–9%</td><td class="amt">${inr(halfTax)}</td></tr>
             <tr><td>SGST</td><td class="amt">${inr(b.taxAmount - halfTax)}</td></tr>`
          : `<tr><td class="muted">GST not applicable</td><td class="amt">${inr(0)}</td></tr>`
      }
    </tbody>
    <tfoot>
      <tr><td class="tot">Total</td><td class="amt tot">${inr(b.totalAmount)}</td></tr>
      <tr><td>Paid</td><td class="amt">${inr(b.amountPaid)}</td></tr>
      <tr><td>Balance due</td><td class="amt">${inr(b.totalAmount - b.amountPaid)}</td></tr>
    </tfoot>
  </table>

  ${b.amountPaid >= b.totalAmount ? '<p><span class="badge">PAID IN FULL</span></p>' : ""}
  <p class="muted">This is a computer-generated invoice. ${b.property.cancellationPolicy ? "Cancellation policy: " + esc(b.property.cancellationPolicy) : ""}</p>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
