import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { ymd } from "@/lib/dates";
import { toRupees } from "@/lib/money";
import { placeOfSupply } from "@/lib/invoice";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Invoice register export for the accountant (audit P0 #3). One row per issued tax invoice. */
export async function GET() {
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const invoices = await prisma.booking.findMany({
    where: { property: { ownerId: ctx.ownerId }, invoiceNumber: { not: null } },
    orderBy: { invoiceIssuedAt: "asc" },
    include: {
      property: { select: { name: true, state: true } },
      guests: { where: { isPrimary: true }, include: { guest: true } },
    },
  });

  const header = [
    "invoiceNo",
    "issuedDate",
    "bookingRef",
    "guest",
    "guestState",
    "placeOfSupply",
    "taxable",
    "cgst",
    "sgst",
    "igst",
    "total",
  ];
  const rows = invoices.map((b) => {
    const g = b.guests[0]?.guest;
    const pos = placeOfSupply(b.property.state, g?.state, b.subtotal, b.taxAmount);
    const cgst = pos.intraState ? Math.round(b.taxAmount / 2) : 0;
    const sgst = pos.intraState ? b.taxAmount - cgst : 0;
    const igst = pos.intraState ? 0 : b.taxAmount;
    return [
      b.invoiceNumber,
      b.invoiceIssuedAt ? ymd(b.invoiceIssuedAt) : "",
      b.ref,
      g?.name,
      g?.state ?? "",
      pos.intraState ? "intra-state" : "inter-state",
      toRupees(b.subtotal),
      toRupees(cgst),
      toRupees(sgst),
      toRupees(igst),
      toRupees(b.totalAmount),
    ];
  });

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="staykit-invoices-${ymd(new Date())}.csv"`,
    },
  });
}
