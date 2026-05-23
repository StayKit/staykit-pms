/**
 * Reporting: occupancy, ADR, RevPAR, source mix. Plain definitions surfaced in UI:
 *   ADR    = room revenue / rooms sold (average price per room sold)
 *   RevPAR = room revenue / available room-nights (revenue per available room)
 */
import { prisma } from "./db";
import { eachNight, nightsBetween } from "./dates";

export interface Kpis {
  roomNightsSold: number;
  roomNightsAvailable: number;
  occupancyPct: number;
  roomRevenuePaise: number;
  adrPaise: number;
  revparPaise: number;
}

export async function getKpis(
  ownerId: string,
  from: Date,
  to: Date,
  propertyId?: string,
): Promise<Kpis> {
  const properties = await prisma.property.findMany({
    where: { ownerId, ...(propertyId ? { id: propertyId } : {}), active: true },
    include: { _count: { select: { rooms: true } } },
  });
  const propertyIds = properties.map((p) => p.id);
  const totalRooms = properties.reduce((s, p) => s + p._count.rooms, 0);

  const sold = await prisma.bookingRoom.findMany({
    where: {
      date: { gte: from, lt: to },
      booking: {
        propertyId: { in: propertyIds },
        status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
      },
    },
    select: { rateApplied: true },
  });

  const nights = nightsBetween(from, to);
  const roomNightsAvailable = totalRooms * Math.max(nights, 1);
  const roomNightsSold = sold.length;
  const roomRevenuePaise = sold.reduce((s, r) => s + r.rateApplied, 0);

  return {
    roomNightsSold,
    roomNightsAvailable,
    occupancyPct: roomNightsAvailable
      ? Math.round((roomNightsSold / roomNightsAvailable) * 100)
      : 0,
    roomRevenuePaise,
    adrPaise: roomNightsSold ? Math.round(roomRevenuePaise / roomNightsSold) : 0,
    revparPaise: roomNightsAvailable ? Math.round(roomRevenuePaise / roomNightsAvailable) : 0,
  };
}

export async function sourceMix(ownerId: string, from: Date, to: Date) {
  const bookings = await prisma.booking.findMany({
    where: {
      property: { ownerId },
      checkIn: { gte: from, lt: to },
      status: { notIn: ["CANCELLED"] },
    },
    include: { channel: true },
  });
  const counts = new Map<string, { name: string; color: string; count: number }>();
  for (const b of bookings) {
    const k = b.channel.key;
    const prev = counts.get(k) ?? { name: b.channel.name, color: b.channel.color, count: 0 };
    prev.count += 1;
    counts.set(k, prev);
  }
  const total = bookings.length || 1;
  return [...counts.values()]
    .map((c) => ({ ...c, pct: Math.round((c.count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

export { eachNight };
