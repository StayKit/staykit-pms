/**
 * Availability computation (pure). Mirrors the query plan in the engineering spec
 * §B.6: a room is unavailable on a night if it has a BookingRoom row or falls
 * inside a MaintenanceBlock range.
 */
import { addDays, eachNight, utcMidnight } from "../dates";

export interface RoomLike {
  id: string;
  roomTypeId: string;
}

export interface OccupiedNight {
  roomId: string;
  date: Date;
}

export interface BlockRange {
  roomId: string;
  startDate: Date;
  endDate: Date;
}

export interface RoomAvailability {
  roomId: string;
  unavailableDates: string[]; // YYYY-MM-DD
  available: boolean; // for the requested window
}

/** Expand maintenance blocks into individual night keys within [from, to). */
export function expandBlockNights(blocks: BlockRange[], from: Date, to: Date): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    for (const night of eachNight(b.startDate, b.endDate)) {
      if (night >= utcMidnight(from) && night < utcMidnight(to)) {
        out.push(night.toISOString().slice(0, 10));
      }
    }
  }
  return out;
}

/**
 * Returns availability per room for the window [from, to). A room is `available`
 * if none of the requested nights are occupied or blocked.
 */
export function computeAvailability(
  rooms: RoomLike[],
  occupied: OccupiedNight[],
  blocks: BlockRange[],
  from: Date,
  to: Date,
): RoomAvailability[] {
  const requested = eachNight(from, to).map((d) => d.toISOString().slice(0, 10));
  const requestedSet = new Set(requested);

  return rooms.map((r) => {
    const occ = occupied
      .filter((o) => o.roomId === r.id)
      .map((o) => o.date.toISOString().slice(0, 10));
    const blk = expandBlockNights(
      blocks.filter((b) => b.roomId === r.id),
      from,
      to,
    );
    const unavailable = [...new Set([...occ, ...blk])];
    const clash = unavailable.some((d) => requestedSet.has(d));
    return { roomId: r.id, unavailableDates: unavailable, available: !clash };
  });
}

/** Filter to rooms that are fully free for the requested window. */
export function freeRooms(
  rooms: RoomLike[],
  occupied: OccupiedNight[],
  blocks: BlockRange[],
  from: Date,
  to: Date,
): string[] {
  return computeAvailability(rooms, occupied, blocks, from, to)
    .filter((a) => a.available)
    .map((a) => a.roomId);
}

export { addDays };
