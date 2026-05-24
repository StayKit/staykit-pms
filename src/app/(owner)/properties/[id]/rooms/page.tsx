import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { toRupees } from "@/lib/money";
import { PropertyTabs } from "@/components/owner/manage/PropertyTabs";
import { RoomsManager } from "@/components/owner/manage/RoomsManager";

export const dynamic = "force-dynamic";

export default async function RoomsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = (await getAppContext())!;
  const { id } = await params;
  const property = await prisma.property.findFirst({ where: { id, ownerId: ctx.ownerId } });
  if (!property) notFound();

  const [roomTypes, rooms] = await Promise.all([
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
  ]);

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
          roomCount: t._count.rooms,
        }))}
        rooms={rooms.map((r) => ({
          id: r.id,
          name: r.name,
          number: r.number,
          typeName: r.roomType.name,
          active: r.active,
          cleanliness: r.cleanliness,
        }))}
      />
    </div>
  );
}
