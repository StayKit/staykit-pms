import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { toRupees } from "@/lib/money";
import { today } from "@/lib/dates";
import { PropertyTabs } from "@/components/owner/manage/PropertyTabs";
import { RoomsManager } from "@/components/owner/manage/RoomsManager";

export const dynamic = "force-dynamic";

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export default async function RoomsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = (await getAppContext())!;
  const { id } = await params;
  const property = await prisma.property.findFirst({ where: { id, ownerId: ctx.ownerId } });
  if (!property) notFound();

  const [roomTypes, rooms, tonight] = await Promise.all([
    prisma.roomType.findMany({
      where: { propertyId: id },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { rooms: true } } },
    }),
    prisma.room.findMany({
      where: { propertyId: id },
      orderBy: { name: "asc" },
      include: { roomType: true },
    }),
    // Who is in each room tonight (the night starting today)?
    prisma.bookingRoom.findMany({
      where: {
        date: today(),
        room: { propertyId: id },
        booking: { status: { in: ["CONFIRMED", "CHECKED_IN"] } },
      },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            guests: { where: { isPrimary: true }, include: { guest: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  const occupancy = new Map<string, { guestName: string; bookingId: string; checkedIn: boolean }>();
  for (const br of tonight) {
    const guestName = br.booking.guests[0]?.guest.name ?? "Guest";
    occupancy.set(br.roomId, {
      guestName,
      bookingId: br.booking.id,
      checkedIn: br.booking.status === "CHECKED_IN",
    });
  }

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 22 }}>{property.name}</h2>
      <PropertyTabs propertyId={id} active="rooms" />
      <RoomsManager
        propertyId={id}
        roomTypes={roomTypes.map((t) => ({
          id: t.id,
          name: t.name,
          baseRateRupees: toRupees(t.baseRate),
          maxOccupancy: t.maxOccupancy,
          color: t.color,
          description: t.description ?? "",
          roomCount: t._count.rooms,
        }))}
        rooms={rooms.map((r) => ({
          id: r.id,
          name: r.name,
          number: r.number,
          typeName: r.roomType.name,
          roomTypeId: r.roomTypeId,
          active: r.active,
          cleanliness: r.cleanliness,
          amenities: safeJsonArray(r.amenities),
          occupant: occupancy.get(r.id) ?? null,
        }))}
      />
    </div>
  );
}
