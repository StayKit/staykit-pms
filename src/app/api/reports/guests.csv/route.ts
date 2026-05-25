import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { ymd } from "@/lib/dates";
import { toRupees } from "@/lib/money";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const guests = await prisma.guest.findMany({
    where: { ownerId: ctx.ownerId },
    orderBy: { name: "asc" },
    include: {
      bookings: { include: { booking: { select: { amountPaid: true, status: true } } } },
    },
  });

  const header = [
    "name",
    "phone",
    "email",
    "city",
    "foreign",
    "marketingConsent",
    "stays",
    "totalPaid",
  ];
  const rows = guests.map((g) => {
    const billable = g.bookings.filter((bg) => bg.booking.status !== "CANCELLED");
    const totalPaid = billable.reduce((s, bg) => s + bg.booking.amountPaid, 0);
    return [
      g.name,
      g.phone,
      g.email ?? "",
      g.city ?? "",
      g.isForeign ? "yes" : "no",
      g.marketingConsent ? "yes" : "no",
      billable.length,
      toRupees(totalPaid),
    ];
  });

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="staykit-guests-${ymd(new Date())}.csv"`,
    },
  });
}
