import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { ymd, nightsBetween } from "@/lib/dates";
import { toRupees } from "@/lib/money";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const bookings = await prisma.booking.findMany({
    where: { property: { ownerId: ctx.ownerId } },
    orderBy: { checkIn: "asc" },
    include: {
      property: true,
      channel: true,
      guests: { where: { isPrimary: true }, include: { guest: true } },
      rooms: { include: { room: true } },
    },
  });

  const header = [
    "ref", "property", "guest", "phone", "checkIn", "checkOut", "nights",
    "room", "channel", "status", "subtotal", "gst", "total", "paid", "due",
  ];
  const rows = bookings.map((b) => {
    const g = b.guests[0]?.guest;
    return [
      b.ref,
      b.property.name,
      g?.name,
      g?.phone,
      ymd(b.checkIn),
      ymd(b.checkOut),
      nightsBetween(b.checkIn, b.checkOut),
      b.rooms[0]?.room.name,
      b.channel.name,
      b.status,
      toRupees(b.subtotal),
      toRupees(b.taxAmount),
      toRupees(b.totalAmount),
      toRupees(b.amountPaid),
      toRupees(b.totalAmount - b.amountPaid),
    ];
  });

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="staykit-bookings-${ymd(new Date())}.csv"`,
    },
  });
}
