import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { toRupees } from "@/lib/money";
import { ymd } from "@/lib/dates";
import { PropertyTabs } from "@/components/owner/manage/PropertyTabs";
import { RatePlansManager } from "@/components/owner/manage/RatePlansManager";

export const dynamic = "force-dynamic";

export default async function RatePlansPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = (await getAppContext())!;
  const { id } = await params;
  const property = await prisma.property.findFirst({ where: { id, ownerId: ctx.ownerId } });
  if (!property) notFound();

  const [plans, roomTypes] = await Promise.all([
    prisma.ratePlan.findMany({
      where: { propertyId: id },
      orderBy: { priority: "desc" },
      include: { overrides: { include: { roomType: true } } },
    }),
    prisma.roomType.findMany({ where: { propertyId: id }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <h2 style={{ fontSize: 22 }}>{property.name}</h2>
      <PropertyTabs propertyId={id} active="rate-plans" />
      <RatePlansManager
        propertyId={id}
        roomTypes={roomTypes.map((t) => ({ id: t.id, name: t.name }))}
        plans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          priority: p.priority,
          startDate: ymd(p.startDate),
          endDate: ymd(p.endDate),
          minStay: p.minStay,
          overrides: p.overrides.map((o) => ({
            typeName: o.roomType.name,
            rupees: toRupees(o.amount),
          })),
        }))}
      />
    </div>
  );
}
