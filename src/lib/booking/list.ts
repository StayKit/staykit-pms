import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { addDays, parseYmd } from "@/lib/dates";

export type SortKey = "guest" | "checkIn" | "room" | "status" | "total";
export const SORT_KEYS: SortKey[] = ["guest", "checkIn", "room", "status", "total"];

export type BookingListParams = {
  ownerId: string;
  filter: string;
  q?: string;
  from?: string;
  to?: string;
  sort: SortKey;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  today: Date;
};

// Builds the shared WHERE used by both the page and count queries. Filtering,
// the unpaid column-comparison, and search all run in SQL so pagination is exact.
function buildWhere(p: BookingListParams): Prisma.Sql {
  const cond: Prisma.Sql[] = [
    Prisma.sql`b.propertyId IN (SELECT id FROM Property WHERE ownerId = ${p.ownerId})`,
    Prisma.sql`b.status != 'CANCELLED'`,
  ];

  if (p.filter === "tentative") cond.push(Prisma.sql`b.status = 'TENTATIVE'`);
  if (p.filter === "checkedin") cond.push(Prisma.sql`b.status = 'CHECKED_IN'`);
  if (p.filter === "foreign")
    cond.push(
      Prisma.sql`EXISTS (SELECT 1 FROM BookingGuest bg JOIN Guest g ON g.id = bg.guestId WHERE bg.bookingId = b.id AND g.isForeign = 1)`,
    );
  if (p.filter === "cancelreq") cond.push(Prisma.sql`b.cancelRequestedAt IS NOT NULL`);
  if (p.filter === "unpaid") cond.push(Prisma.sql`b.amountPaid < b.totalAmount`);

  // DateTime is stored as epoch-ms integers in SQLite, so compare with getTime().
  // An explicit check-in range takes precedence over the "today" preset.
  if (p.from || p.to) {
    if (p.from) cond.push(Prisma.sql`b.checkIn >= ${parseYmd(p.from).getTime()}`);
    if (p.to) cond.push(Prisma.sql`b.checkIn < ${addDays(parseYmd(p.to), 1).getTime()}`);
  } else if (p.filter === "today") {
    cond.push(
      Prisma.sql`b.checkIn >= ${p.today.getTime()} AND b.checkIn < ${addDays(p.today, 1).getTime()}`,
    );
  }

  if (p.q) {
    const like = `%${p.q}%`;
    cond.push(
      Prisma.sql`(b.ref LIKE ${like} OR EXISTS (SELECT 1 FROM BookingGuest bg JOIN Guest g ON g.id = bg.guestId WHERE bg.bookingId = b.id AND (g.name LIKE ${like} OR g.phone LIKE ${like})))`,
    );
  }

  return Prisma.sql`WHERE ${Prisma.join(cond, " AND ")}`;
}

// ORDER BY for the requested column. Guest/room sort through to-many relations and
// status uses a custom ranking — none expressible via Prisma's orderBy alongside
// LIMIT/OFFSET, which is why the list is driven by raw SQL. b.id is a stable tiebreak.
function buildOrder(sort: SortKey, dir: "asc" | "desc"): Prisma.Sql {
  const d = dir === "desc" ? Prisma.raw("DESC") : Prisma.raw("ASC");
  switch (sort) {
    case "guest":
      return Prisma.sql`ORDER BY (SELECT lower(g.name) FROM BookingGuest bg JOIN Guest g ON g.id = bg.guestId WHERE bg.bookingId = b.id AND bg.isPrimary = 1 LIMIT 1) ${d}, b.id ASC`;
    case "room":
      return Prisma.sql`ORDER BY (SELECT min(r.number) FROM BookingRoom br JOIN Room r ON r.id = br.roomId WHERE br.bookingId = b.id) ${d}, b.id ASC`;
    case "status":
      return Prisma.sql`ORDER BY (CASE b.status WHEN 'TENTATIVE' THEN 0 WHEN 'CONFIRMED' THEN 1 WHEN 'CHECKED_IN' THEN 2 WHEN 'CHECKED_OUT' THEN 3 WHEN 'NO_SHOW' THEN 4 ELSE 5 END) ${d}, b.id ASC`;
    case "total":
      return Prisma.sql`ORDER BY b.totalAmount ${d}, b.id ASC`;
    default:
      return Prisma.sql`ORDER BY b.checkIn ${d}, b.id ASC`;
  }
}

// Returns the ordered booking IDs for the requested page plus the total match count.
// Callers hydrate the IDs with Prisma includes, preserving this order.
export async function queryBookingIds(
  p: BookingListParams,
): Promise<{ ids: string[]; total: number }> {
  const where = buildWhere(p);
  const order = buildOrder(p.sort, p.dir);
  const offset = (p.page - 1) * p.pageSize;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT b.id FROM Booking b ${where} ${order} LIMIT ${p.pageSize} OFFSET ${offset}`,
    ),
    prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n FROM Booking b ${where}`),
  ]);

  return { ids: rows.map((r) => r.id), total: Number(countRows[0].n) };
}
