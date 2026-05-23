import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { toRupees } from "@/lib/money";
import { OwnerShell } from "@/components/owner/OwnerShell";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  if (!ctx) redirect("/signin");

  const property = await prisma.property.findFirst({
    where: { ownerId: ctx.ownerId, active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!property) redirect("/signin");

  const [rooms, channels] = await Promise.all([
    prisma.room.findMany({
      where: { propertyId: property.id, active: true },
      include: { roomType: true },
      orderBy: { number: "asc" },
    }),
    prisma.channelSource.findMany({ where: { ownerId: ctx.ownerId, active: true } }),
  ]);

  return (
    <OwnerShell
      user={{ name: ctx.name, role: ctx.role }}
      property={{ id: property.id, name: property.name }}
      demo={ctx.demo}
      rooms={rooms.map((r) => ({
        id: r.id,
        label: `${r.number} — ${r.name} (${r.roomType.name})`,
        baseRateRupees: toRupees(r.roomType.baseRate),
      }))}
      channels={channels.map((c) => ({ key: c.key, name: c.name }))}
    >
      {children}
    </OwnerShell>
  );
}
