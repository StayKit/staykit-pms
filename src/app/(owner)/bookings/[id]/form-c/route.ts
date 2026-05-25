/**
 * Pre-filled Form C (foreigner arrival report) for printing/saving as PDF (audit P2 #31).
 * The owner still files on the FRRO portal, but this fills everything StayKit knows so
 * they aren't re-keying it. Fields we don't hold (full passport no., visa, address abroad)
 * render as blanks to complete.
 */
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { FRRO_FORM_C_URL } from "@/lib/config";
import { longDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

function field(label: string, value: string): string {
  return `<div class="f"><div class="l">${esc(label)}</div><div class="v">${value ? esc(value) : "&nbsp;"}</div></div>`;
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
    },
  });
  if (!b) return new Response("Not found", { status: 404 });
  const guest = b.guests[0]?.guest;
  if (!guest?.isForeign) {
    return new Response("Form C applies only to foreign-national guests.", { status: 400 });
  }

  const html = `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Form C — ${esc(guest.name)}</title>
<style>
  :root { font-family: ui-sans-serif, system-ui, sans-serif; color:#1f2937; }
  body { max-width: 760px; margin: 24px auto; padding: 0 20px; }
  h1 { font-size: 20px; margin: 0; }
  .muted { color:#6b7280; font-size:13px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px 24px; margin-top:18px; }
  .f { border-bottom:1px solid #e5e7eb; padding:6px 0; }
  .l { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#6b7280; }
  .v { font-size:14px; min-height:18px; }
  .note { margin-top:20px; font-size:12px; color:#6b7280; line-height:1.6; }
  @media print { .noprint { display:none; } body { margin:0; } }
</style></head>
<body>
  <button class="noprint" onclick="window.print()" style="float:right;padding:8px 14px">Print / Save PDF</button>
  <h1>Form C — Arrival report of a foreign guest</h1>
  <div class="muted">Immigration & Foreigners Act 2025 · Accommodation provider report</div>

  <h3 style="margin-top:22px">Accommodation</h3>
  <div class="grid">
    ${field("Establishment", b.property.name)}
    ${field("Address", `${b.property.addressLine1}, ${b.property.city} ${b.property.pincode}, ${b.property.state}`)}
    ${field("Booking reference", b.ref)}
    ${field("GSTIN", b.property.gstin ?? "—")}
  </div>

  <h3 style="margin-top:22px">Guest</h3>
  <div class="grid">
    ${field("Full name", guest.name)}
    ${field("Nationality", guest.nationality ?? "")}
    ${field("Passport / ID type", guest.idType ?? "PASSPORT")}
    ${field("Passport no.", guest.idLast4 ? `•••• ${guest.idLast4}` : "")}
    ${field("Phone", guest.phone)}
    ${field("Email", guest.email ?? "")}
    ${field("Date of arrival (check-in)", longDate(b.checkIn))}
    ${field("Intended departure (check-out)", longDate(b.checkOut))}
    ${field("Visa number", "")}
    ${field("Visa type / validity", "")}
    ${field("Arriving from (place)", "")}
    ${field("Next destination", "")}
  </div>

  <p class="note">
    Complete the blank fields (visa, passport number, addresses) from the guest's passport, then
    submit on the FRRO portal: <a href="${FRRO_FORM_C_URL}">${FRRO_FORM_C_URL}</a>.
    Filing within 24 hours of check-in is a legal obligation for foreign-national guests.
  </p>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
