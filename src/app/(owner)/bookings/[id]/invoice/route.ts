/**
 * Printable GST invoice (HTML). The owner prints to PDF from the browser — no PDF
 * dependency in v1. Intra-state supply splits GST into CGST + SGST halves; SAC 996311.
 * Route handlers bypass the (owner) layout, so this renders as a clean standalone page.
 */
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { getGuestSession } from "@/lib/auth/session";
import { inr } from "@/lib/money";
import { GST } from "@/lib/config";
import { placeOfSupply } from "@/lib/invoice";
import { stateName } from "@/lib/india";
import { longDate, nightsBetween } from "@/lib/dates";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

interface BookingRoomLike {
  roomId: string;
  rateApplied: number;
  room: { name: string; roomType: { name: string } };
}

/** One invoice line per room in the booking (audit P1 #9 multi-room). */
function roomLines(
  rows: BookingRoomLike[],
  nights: number,
  fromLabel: string,
  toLabel: string,
): string {
  const byRoom = new Map<string, { name: string; type: string; amount: number }>();
  for (const r of rows) {
    const cur = byRoom.get(r.roomId) ?? {
      name: r.room.name,
      type: r.room.roomType.name,
      amount: 0,
    };
    cur.amount += r.rateApplied;
    byRoom.set(r.roomId, cur);
  }
  const nightsLabel = `${nights} night${nights > 1 ? "s" : ""}`;
  if (byRoom.size === 0) {
    return `<tr><td>Stay · ${nightsLabel}</td><td class="amt">${inr(0)}</td></tr>`;
  }
  return [...byRoom.values()]
    .map(
      (r) =>
        `<tr><td>${esc(r.name)} — ${esc(r.type)} · ${nightsLabel}<br/>
          <span class="muted">${fromLabel} → ${toLabel}</span></td>
          <td class="amt">${inr(r.amount)}</td></tr>`,
    )
    .join("\n");
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Owner/staff access by tenant; a logged-in guest can fetch their own booking's
  // invoice/receipt too (audit P1 #14).
  const ctx = await getAppContext();
  const guestSession = ctx ? null : await getGuestSession();
  if (!ctx && !guestSession) return new Response("Unauthorized", { status: 401 });

  const b = await prisma.booking.findFirst({
    where: ctx
      ? { id, property: { ownerId: ctx.ownerId } }
      : { id, guests: { some: { isPrimary: true, guest: { phone: guestSession!.phone } } } },
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
  // Issued tax invoices carry the frozen gapless serial; an unpaid booking is a
  // provisional proforma keyed off the booking ref (audit P0 #3).
  const isProforma = b.amountPaid <= 0 || !b.invoiceNumber;
  const invoiceNo = b.invoiceNumber ?? `${b.property.invoicePrefix}-${b.ref} (proforma)`;
  const docTitle = isProforma ? "Proforma Invoice / Quote" : "Tax Invoice";
  // CGST+SGST (same state) vs IGST (inter-state) from the guest's state of residence.
  const pos = placeOfSupply(b.property.state, guest?.state, b.subtotal, b.taxAmount);

  const html = `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(docTitle)} ${esc(invoiceNo)}</title>
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
      ${guest?.state ? `<div class="muted">Place of supply: ${esc(stateName(guest.state))} (${esc(guest.state)})</div>` : ``}
    </div>
    <div style="text-align:right">
      <div class="muted">${esc(docTitle)}</div>
      <div><strong>${esc(invoiceNo)}</strong></div>
      <div class="muted">${longDate(b.invoiceIssuedAt ?? b.createdAt)}</div>
    </div>
  </div>

  <table>
    <thead><tr><th>Description</th><th class="amt">Amount</th></tr></thead>
    <tbody>
      ${roomLines(b.rooms, nights, longDate(b.checkIn), longDate(b.checkOut))}
      ${
        hasGst
          ? pos.lines
              .map(
                (l) =>
                  `<tr><td>${esc(l.label)}</td><td class="amt">${inr(l.amountPaise)}</td></tr>`,
              )
              .join("\n")
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
  ${isProforma ? '<p class="muted"><strong>This is a proforma / quote</strong> — not a tax invoice. A tax invoice is issued once payment is recorded.</p>' : ""}
  <p class="muted">This is a computer-generated ${esc(isProforma ? "quote" : "invoice")}. ${b.property.cancellationPolicy ? "Cancellation policy: " + esc(b.property.cancellationPolicy) : ""}</p>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
