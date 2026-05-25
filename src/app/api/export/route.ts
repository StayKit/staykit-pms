import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { ymd } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * Full data export for the owner (audit P2 #29) — a single JSON file with every record
 * tied to their account. Both a DPDP data-portability expectation and a safety net for a
 * self-hosted SQLite app. Sensitive secrets (tokens, password hashes, encrypted ID blobs)
 * are excluded; ID document files stay encrypted on disk and aren't inlined.
 */
export async function GET() {
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const ownerScope = { property: { ownerId: ctx.ownerId } };

  const [owner, properties, roomTypes, rooms, ratePlans, channels, guests, bookings, templates] =
    await Promise.all([
      prisma.owner.findUnique({
        where: { id: ctx.ownerId },
        select: { id: true, name: true, email: true, phone: true, createdAt: true },
      }),
      prisma.property.findMany({ where: { ownerId: ctx.ownerId } }),
      prisma.roomType.findMany({ where: { property: { ownerId: ctx.ownerId } } }),
      prisma.room.findMany({ where: { property: { ownerId: ctx.ownerId } } }),
      prisma.ratePlan.findMany({
        where: { property: { ownerId: ctx.ownerId } },
        include: { overrides: true },
      }),
      prisma.channelSource.findMany({ where: { ownerId: ctx.ownerId } }),
      prisma.guest.findMany({
        where: { ownerId: ctx.ownerId },
        // Omit the encrypted ID file pointer from the portable export.
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          city: true,
          state: true,
          isForeign: true,
          nationality: true,
          vip: true,
          blacklisted: true,
          tags: true,
          notes: true,
          marketingConsent: true,
          createdAt: true,
        },
      }),
      prisma.booking.findMany({
        where: ownerScope,
        include: {
          rooms: true,
          payments: true,
          refunds: true,
          paymentLinks: true,
          guests: { include: { guest: { select: { name: true, phone: true } } } },
        },
      }),
      prisma.notificationTemplate.findMany({ where: { ownerId: ctx.ownerId } }),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    owner,
    properties,
    roomTypes,
    rooms,
    ratePlans,
    channels,
    guests,
    bookings,
    notificationTemplates: templates,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="staykit-export-${ymd(new Date())}.json"`,
    },
  });
}
