import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { today, ymd, nightsBetween } from "@/lib/dates";
import { inr } from "@/lib/money";
import { deriveState } from "@/components/ui";
import { TapeChart, type TapeGroup, type TapeBooking } from "@/components/owner/TapeChart";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const ctx = (await getAppContext())!;
  const { property: propParam } = await searchParams;

  const properties = await prisma.property.findMany({
    where: { ownerId: ctx.ownerId, active: true },
    orderBy: { createdAt: "asc" },
  });
  const active = properties.find((p) => p.id === propParam) ?? properties[0];

  const [roomTypes, bookings, blocks] = await Promise.all([
    prisma.roomType.findMany({
      where: { propertyId: active.id },
      orderBy: { sortOrder: "asc" },
      include: { rooms: { where: { active: true }, orderBy: { number: "asc" } } },
    }),
    prisma.booking.findMany({
      where: {
        propertyId: active.id,
        status: { notIn: ["CANCELLED"] },
      },
      include: {
        guests: { where: { isPrimary: true }, include: { guest: true } },
        rooms: { select: { roomId: true } },
      },
    }),
    prisma.maintenanceBlock.findMany({ where: { propertyId: active.id } }),
  ]);

  const groups: TapeGroup[] = roomTypes
    .filter((rt) => rt.rooms.length > 0)
    .map((rt) => ({
      typeId: rt.id,
      typeName: rt.name,
      color: rt.color,
      rooms: rt.rooms.map((r) => ({
        id: r.id,
        number: r.number,
        name: r.name,
        cleanliness: r.cleanliness,
      })),
    }));

  const tapeBookings: TapeBooking[] = [];
  for (const b of bookings) {
    const roomId = b.rooms[0]?.roomId;
    if (!roomId) continue;
    const guest = b.guests[0]?.guest;
    const nights = nightsBetween(b.checkIn, b.checkOut);
    tapeBookings.push({
      id: b.id,
      roomId,
      label: guest?.name ?? "Guest",
      checkIn: ymd(b.checkIn),
      checkOut: ymd(b.checkOut),
      state: deriveState(b),
      meta: `${nights}n · ${inr(b.totalAmount)}`,
      isBlock: false,
    });
  }
  for (const blk of blocks) {
    tapeBookings.push({
      id: blk.id,
      roomId: blk.roomId,
      label: "Blocked",
      checkIn: ymd(blk.startDate),
      checkOut: ymd(blk.endDate),
      state: "block",
      meta: blk.reason,
      isBlock: true,
    });
  }

  return (
    <TapeChart
      anchorIso={ymd(today())}
      groups={groups}
      bookings={tapeBookings}
      properties={properties.map((p) => ({ id: p.id, name: p.name }))}
      activePropertyId={active.id}
    />
  );
}
