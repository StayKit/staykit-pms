import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { ymd } from "@/lib/dates";
import { PropertyTabs } from "@/components/owner/manage/PropertyTabs";
import { MaintenanceManager } from "@/components/owner/manage/MaintenanceManager";

export const dynamic = "force-dynamic";

export default async function MaintenancePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = (await getAppContext())!;
  const { id } = await params;
  const property = await prisma.property.findFirst({ where: { id, ownerId: ctx.ownerId } });
  if (!property) notFound();

  const [blocks, rooms] = await Promise.all([
    prisma.maintenanceBlock.findMany({
      where: { propertyId: id },
      orderBy: { startDate: "asc" },
      include: { room: true },
    }),
    prisma.room.findMany({ where: { propertyId: id }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 22 }}>{property.name}</h2>
      <PropertyTabs propertyId={id} active="maintenance" />
      <MaintenanceManager
        propertyId={id}
        rooms={rooms.map((r) => ({
          id: r.id,
          label: r.number ? `${r.number} — ${r.name}` : r.name,
        }))}
        blocks={blocks.map((b) => ({
          id: b.id,
          roomName: b.room.name,
          startDate: ymd(b.startDate),
          endDate: ymd(b.endDate),
          reason: b.reason,
        }))}
      />
    </div>
  );
}
