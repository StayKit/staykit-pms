import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { resolveActiveProperty } from "@/lib/property/active";
import { today, addDays } from "@/lib/dates";
import {
  HousekeepingBoard,
  type HousekeepingRoom,
} from "@/components/owner/manage/HousekeepingBoard";

export const dynamic = "force-dynamic";

function fmt(d: Date): string {
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The morning housekeeping board (audit P2 #22): occupancy + cleanliness + who's on it,
 * in one place. Combines tonight's occupant, today's arrivals/departures, the cleanliness
 * status and the assigned housekeeper.
 */
export default async function HousekeepingPage() {
  const ctx = (await getAppContext())!;
  const { activeId } = await resolveActiveProperty(ctx.ownerId);
  const property = await prisma.property.findFirst({
    where: { id: activeId ?? undefined, ownerId: ctx.ownerId },
    orderBy: { createdAt: "asc" },
  });
  if (!property) {
    return (
      <div className="page" style={{ paddingTop: 16 }}>
        <h2 style={{ fontSize: 22 }}>Housekeeping</h2>
        <div className="empty">Add a property first.</div>
      </div>
    );
  }

  const t0 = today();
  const t1 = addDays(t0, 1);

  const [rooms, tonight, departures, arrivals, team] = await Promise.all([
    prisma.room.findMany({
      where: { propertyId: property.id },
      orderBy: { name: "asc" },
      include: { roomType: { select: { name: true } } },
    }),
    prisma.bookingRoom.findMany({
      where: {
        date: { gte: t0, lt: t1 },
        room: { propertyId: property.id },
        booking: { status: { in: ["CONFIRMED", "CHECKED_IN"] } },
      },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            checkOut: true,
            guests: { where: { isPrimary: true }, include: { guest: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.booking.findMany({
      where: { propertyId: property.id, checkOut: { gte: t0, lt: t1 } },
      include: { rooms: { select: { roomId: true } } },
    }),
    prisma.booking.findMany({
      where: {
        propertyId: property.id,
        checkIn: { gte: t0, lt: t1 },
        status: { in: ["CONFIRMED", "TENTATIVE"] },
      },
      include: { rooms: { select: { roomId: true } } },
    }),
    prisma.user.findMany({
      where: { ownerId: ctx.ownerId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const occupancy = new Map<string, { guestName: string; bookingId: string; checkedIn: boolean }>();
  for (const br of tonight) {
    occupancy.set(br.roomId, {
      guestName: br.booking.guests[0]?.guest.name ?? "Guest",
      bookingId: br.booking.id,
      checkedIn: br.booking.status === "CHECKED_IN",
    });
  }
  const departingRooms = new Set(departures.flatMap((b) => b.rooms.map((r) => r.roomId)));
  const arrivingRooms = new Set(arrivals.flatMap((b) => b.rooms.map((r) => r.roomId)));
  const teamById = new Map(team.map((u) => [u.id, u.name]));

  const boardRooms: HousekeepingRoom[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    number: r.number,
    typeName: r.roomType.name,
    cleanliness: r.cleanliness,
    cleanedAt: r.cleanedAt ? fmt(r.cleanedAt) : null,
    cleanedBy: r.cleanedById ? (teamById.get(r.cleanedById) ?? "staff") : null,
    housekeeperId: r.housekeeperId,
    occupant: occupancy.get(r.id) ?? null,
    departing: departingRooms.has(r.id),
    arriving: arrivingRooms.has(r.id),
  }));

  const dirty = boardRooms.filter((r) => r.cleanliness === "DIRTY").length;

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Housekeeping</h2>
          <div className="sub">
            {property.name} · {dirty} room{dirty === 1 ? "" : "s"} to clean today
          </div>
        </div>
      </div>
      <HousekeepingBoard rooms={boardRooms} team={team} />
    </div>
  );
}
