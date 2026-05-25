import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { ymd } from "@/lib/dates";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Foreign-national guest register for FRRO / police reporting (audit P2 #31). */
export async function GET() {
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const bookings = await prisma.booking.findMany({
    where: {
      property: { ownerId: ctx.ownerId },
      guests: { some: { guest: { isForeign: true } } },
      status: { not: "CANCELLED" },
    },
    orderBy: { checkIn: "desc" },
    include: {
      property: { select: { name: true } },
      guests: { where: { isPrimary: true }, include: { guest: true } },
    },
  });

  const header = [
    "bookingRef",
    "property",
    "guest",
    "nationality",
    "idType",
    "idLast4",
    "phone",
    "checkIn",
    "checkOut",
    "formCFiled",
  ];
  const rows = bookings
    .filter((b) => b.guests[0]?.guest.isForeign)
    .map((b) => {
      const g = b.guests[0]!.guest;
      return [
        b.ref,
        b.property.name,
        g.name,
        g.nationality ?? "",
        g.idType ?? "",
        g.idLast4 ?? "",
        g.phone,
        ymd(b.checkIn),
        ymd(b.checkOut),
        b.formCFiledAt ? ymd(b.formCFiledAt) : "pending",
      ];
    });

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="staykit-foreigners-${ymd(new Date())}.csv"`,
    },
  });
}
