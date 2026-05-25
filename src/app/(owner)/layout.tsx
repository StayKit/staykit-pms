import { redirect } from "next/navigation";
import { getAppContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { toRupees } from "@/lib/money";
import { onlinePaymentsEnabled } from "@/lib/payments/razorpay/client";
import { resolveActiveProperty } from "@/lib/property/active";
import { OwnerShell } from "@/components/owner/OwnerShell";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  if (!ctx) redirect("/signin");

  const { properties, activeId } = await resolveActiveProperty(ctx.ownerId);
  const property = properties.find((p) => p.id === activeId);
  if (!property) redirect("/signin");

  const [rooms, channels, onlineEnabled, cancelRequests] = await Promise.all([
    prisma.room.findMany({
      where: { propertyId: property.id, active: true },
      include: { roomType: true },
      orderBy: { number: "asc" },
    }),
    prisma.channelSource.findMany({ where: { ownerId: ctx.ownerId, active: true } }),
    onlinePaymentsEnabled(),
    prisma.booking.count({
      where: {
        property: { ownerId: ctx.ownerId },
        cancelRequestedAt: { not: null },
        status: { notIn: ["CANCELLED", "CHECKED_OUT"] },
      },
    }),
  ]);

  return (
    <OwnerShell
      user={{ name: ctx.name, role: ctx.role }}
      property={{ id: property.id, name: property.name }}
      properties={properties}
      demo={ctx.demo}
      onlineEnabled={onlineEnabled}
      badges={{ "/bookings": cancelRequests }}
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
