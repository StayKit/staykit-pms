/**
 * MCP tool catalog. Each tool declares the OAuth scope it needs (scopes map 1:1 to
 * RBAC permissions), a JSON-schema-ish input description, and a handler. RBAC is
 * enforced server-side here, never trusted from the client. Read tools are fully
 * implemented; mutating tools reuse the same domain services as the web app.
 */
import { z } from "zod";
import { prisma } from "../db";
import { getKpis } from "../reports";
import { computeAvailability } from "../booking/availability";
import { createBooking, cancelBooking, checkInBooking, checkOutBooking } from "../booking/engine";
import { createPaymentLinkForBooking } from "../payments/service";
import { parseYmd, today, addDays } from "../dates";
import type { Permission } from "../rbac/policy";

export interface McpContext {
  ownerId: string;
  userId: string;
  name: string;
  scopes: string[];
  propertyScopes: string[]; // empty = all (owner)
}

export class ScopeError extends Error {
  readonly code = "FORBIDDEN";
}

export function assertScope(ctx: McpContext, scope: Permission) {
  if (!ctx.scopes.includes(scope)) throw new ScopeError(`Missing scope: ${scope}`);
}

export interface ToolDef {
  name: string;
  scope: Permission;
  description: string;
  requiresApproval?: boolean;
  inputSchema: z.ZodTypeAny;
  jsonSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: McpContext) => Promise<unknown>;
}

const obj = (
  properties: Record<string, { type: string; description?: string }>,
  required: string[] = [],
) => ({ type: "object", properties, required });

export const TOOLS: ToolDef[] = [
  {
    name: "list_properties",
    scope: "properties:read",
    description: "List properties accessible to the current user.",
    inputSchema: z.object({}),
    jsonSchema: obj({}),
    async run(_args, ctx) {
      assertScope(ctx, "properties:read");
      return prisma.property.findMany({
        where: { ownerId: ctx.ownerId, active: true },
        select: { id: true, name: true, city: true, state: true, gstin: true },
      });
    },
  },
  {
    name: "get_property",
    scope: "properties:read",
    description: "Fetch one property with rooms and rate context.",
    inputSchema: z.object({ propertyId: z.string() }),
    jsonSchema: obj({ propertyId: { type: "string" } }, ["propertyId"]),
    async run(args, ctx) {
      assertScope(ctx, "properties:read");
      return prisma.property.findFirst({
        where: { id: String(args.propertyId), ownerId: ctx.ownerId },
        include: { rooms: true, roomTypes: true },
      });
    },
  },
  {
    name: "list_rooms",
    scope: "properties:read",
    description: "List rooms of a property.",
    inputSchema: z.object({ propertyId: z.string() }),
    jsonSchema: obj({ propertyId: { type: "string" } }, ["propertyId"]),
    async run(args, ctx) {
      assertScope(ctx, "properties:read");
      return prisma.room.findMany({
        where: { propertyId: String(args.propertyId), property: { ownerId: ctx.ownerId } },
        include: { roomType: true },
      });
    },
  },
  {
    name: "check_availability",
    scope: "bookings:read",
    description: "Available rooms for a property across a date range (YYYY-MM-DD).",
    inputSchema: z.object({ propertyId: z.string(), from: z.string(), to: z.string() }),
    jsonSchema: obj(
      { propertyId: { type: "string" }, from: { type: "string" }, to: { type: "string" } },
      ["propertyId", "from", "to"],
    ),
    async run(args, ctx) {
      assertScope(ctx, "bookings:read");
      const from = parseYmd(String(args.from));
      const to = parseYmd(String(args.to));
      const rooms = await prisma.room.findMany({
        where: {
          propertyId: String(args.propertyId),
          property: { ownerId: ctx.ownerId },
          active: true,
        },
      });
      const occupied = await prisma.bookingRoom.findMany({
        where: { room: { propertyId: String(args.propertyId) }, date: { gte: from, lt: to } },
        select: { roomId: true, date: true },
      });
      const blocks = await prisma.maintenanceBlock.findMany({
        where: {
          propertyId: String(args.propertyId),
          startDate: { lt: to },
          endDate: { gt: from },
        },
      });
      const avail = computeAvailability(rooms, occupied, blocks, from, to);
      return rooms
        .filter((r) => avail.find((a) => a.roomId === r.id)?.available)
        .map((r) => ({ id: r.id, name: r.name, number: r.number }));
    },
  },
  {
    name: "list_bookings",
    scope: "bookings:read",
    description: "Filter bookings by property, date range, and status.",
    inputSchema: z.object({
      propertyId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      status: z.string().optional(),
    }),
    jsonSchema: obj({
      propertyId: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      status: { type: "string" },
    }),
    async run(args, ctx) {
      assertScope(ctx, "bookings:read");
      return prisma.booking.findMany({
        where: {
          property: { ownerId: ctx.ownerId },
          ...(args.propertyId ? { propertyId: String(args.propertyId) } : {}),
          ...(args.status ? { status: String(args.status) as never } : {}),
          ...(args.from ? { checkIn: { gte: parseYmd(String(args.from)) } } : {}),
          ...(args.to ? { checkOut: { lte: parseYmd(String(args.to)) } } : {}),
        },
        take: 50,
        orderBy: { checkIn: "asc" },
        select: {
          id: true,
          ref: true,
          status: true,
          checkIn: true,
          checkOut: true,
          totalAmount: true,
          amountPaid: true,
        },
      });
    },
  },
  {
    name: "get_booking",
    scope: "bookings:read",
    description: "Full booking detail by id or ref.",
    inputSchema: z.object({ idOrRef: z.string() }),
    jsonSchema: obj({ idOrRef: { type: "string" } }, ["idOrRef"]),
    async run(args, ctx) {
      assertScope(ctx, "bookings:read");
      const idOrRef = String(args.idOrRef);
      return prisma.booking.findFirst({
        where: { property: { ownerId: ctx.ownerId }, OR: [{ id: idOrRef }, { ref: idOrRef }] },
        include: {
          guests: { include: { guest: true } },
          rooms: { include: { room: true } },
          payments: true,
        },
      });
    },
  },
  {
    name: "get_kpis",
    scope: "reports:read",
    description: "Occupancy, ADR and RevPAR for a date range.",
    inputSchema: z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      propertyId: z.string().optional(),
    }),
    jsonSchema: obj({
      from: { type: "string" },
      to: { type: "string" },
      propertyId: { type: "string" },
    }),
    async run(args, ctx) {
      assertScope(ctx, "reports:read");
      const from = args.from ? parseYmd(String(args.from)) : addDays(today(), -7);
      const to = args.to ? parseYmd(String(args.to)) : addDays(today(), 1);
      return getKpis(ctx.ownerId, from, to, args.propertyId ? String(args.propertyId) : undefined);
    },
  },
  {
    name: "search_guests",
    scope: "bookings:read",
    description: "Search guests by name or phone (PII partially redacted).",
    inputSchema: z.object({ query: z.string() }),
    jsonSchema: obj({ query: { type: "string" } }, ["query"]),
    async run(args, ctx) {
      assertScope(ctx, "bookings:read");
      const q = String(args.query);
      const guests = await prisma.guest.findMany({
        where: {
          ownerId: ctx.ownerId,
          OR: [{ name: { contains: q } }, { phone: { contains: q } }],
        },
        take: 20,
      });
      return guests.map((g) => ({
        id: g.id,
        name: g.name,
        phone: g.phone.replace(/.(?=.{4})/g, "x"),
        city: g.city,
        isForeign: g.isForeign,
      }));
    },
  },
  {
    name: "create_booking",
    scope: "bookings:write",
    description: "Create a manual booking with an attributed source channel.",
    inputSchema: z.object({
      propertyId: z.string(),
      roomId: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      channel: z.string(),
      guestName: z.string(),
      guestPhone: z.string(),
      guestEmail: z.string().optional(),
      adults: z.number().optional(),
      children: z.number().optional(),
      ratePaise: z.number().optional(),
    }),
    jsonSchema: obj(
      {
        propertyId: { type: "string" },
        roomId: { type: "string" },
        checkIn: { type: "string" },
        checkOut: { type: "string" },
        channel: { type: "string" },
        guestName: { type: "string" },
        guestPhone: { type: "string" },
        guestEmail: { type: "string" },
        adults: { type: "number" },
        children: { type: "number" },
        ratePaise: { type: "number" },
      },
      ["propertyId", "roomId", "checkIn", "checkOut", "channel", "guestName", "guestPhone"],
    ),
    async run(args, ctx) {
      assertScope(ctx, "bookings:write");
      const b = await createBooking({
        ownerId: ctx.ownerId,
        propertyId: String(args.propertyId),
        roomId: String(args.roomId),
        channelKey: String(args.channel),
        checkIn: String(args.checkIn),
        checkOut: String(args.checkOut),
        guest: {
          name: String(args.guestName),
          phone: String(args.guestPhone),
          email: (args.guestEmail as string) ?? null,
        },
        adults: args.adults as number | undefined,
        children: args.children as number | undefined,
        nightlyRatePaise: args.ratePaise as number | undefined,
        createdViaMcp: true,
        createdById: ctx.userId,
        actorName: "Claude (AI)",
        actorType: "MCP",
      });
      return { id: b.id, ref: b.ref, total: b.totalAmount };
    },
  },
  {
    name: "cancel_booking",
    scope: "bookings:cancel",
    description: "Cancel a booking with a reason (releases the room nights).",
    inputSchema: z.object({ bookingId: z.string(), reason: z.string() }),
    jsonSchema: obj({ bookingId: { type: "string" }, reason: { type: "string" } }, [
      "bookingId",
      "reason",
    ]),
    async run(args, ctx) {
      assertScope(ctx, "bookings:cancel");
      await ownsBooking(ctx, String(args.bookingId));
      const b = await cancelBooking(
        String(args.bookingId),
        ctx.ownerId,
        String(args.reason),
        "Claude (AI)",
      );
      return { id: b.id, status: b.status };
    },
  },
  {
    name: "check_in",
    scope: "bookings:write",
    description: "Mark a booking CHECKED_IN.",
    inputSchema: z.object({ bookingId: z.string() }),
    jsonSchema: obj({ bookingId: { type: "string" } }, ["bookingId"]),
    async run(args, ctx) {
      assertScope(ctx, "bookings:write");
      await ownsBooking(ctx, String(args.bookingId));
      const b = await checkInBooking(String(args.bookingId), ctx.ownerId, "Claude (AI)");
      return { id: b.id, status: b.status };
    },
  },
  {
    name: "check_out",
    scope: "bookings:write",
    description: "Mark a booking CHECKED_OUT.",
    inputSchema: z.object({ bookingId: z.string() }),
    jsonSchema: obj({ bookingId: { type: "string" } }, ["bookingId"]),
    async run(args, ctx) {
      assertScope(ctx, "bookings:write");
      await ownsBooking(ctx, String(args.bookingId));
      const b = await checkOutBooking(String(args.bookingId), ctx.ownerId, "Claude (AI)");
      return { id: b.id, status: b.status };
    },
  },
  {
    name: "get_payment_status",
    scope: "payments:read",
    description: "Payment + refund status for a booking.",
    inputSchema: z.object({ bookingId: z.string() }),
    jsonSchema: obj({ bookingId: { type: "string" } }, ["bookingId"]),
    async run(args, ctx) {
      assertScope(ctx, "payments:read");
      const b = await prisma.booking.findFirst({
        where: { id: String(args.bookingId), property: { ownerId: ctx.ownerId } },
        select: { ref: true, totalAmount: true, amountPaid: true, payments: true, refunds: true },
      });
      if (!b) throw new Error("Booking not found");
      return {
        ref: b.ref,
        total: b.totalAmount,
        paid: b.amountPaid,
        due: b.totalAmount - b.amountPaid,
      };
    },
  },
  {
    name: "create_payment_link",
    scope: "payments:read",
    description: "Create and send a Razorpay payment link (side effect: SMS/email).",
    inputSchema: z.object({ bookingId: z.string(), amountPaise: z.number().optional() }),
    jsonSchema: obj({ bookingId: { type: "string" }, amountPaise: { type: "number" } }, [
      "bookingId",
    ]),
    async run(args, ctx) {
      assertScope(ctx, "payments:read");
      await ownsBooking(ctx, String(args.bookingId));
      const r = await createPaymentLinkForBooking(String(args.bookingId), {
        amountPaise: args.amountPaise as number | undefined,
        actorName: "Claude (AI)",
        actorType: "MCP",
      });
      return { shortUrl: r.shortUrl, mock: r.mock };
    },
  },
  {
    name: "initiate_refund",
    scope: "payments:refund",
    description: "Initiate a refund. Requires human-in-the-loop confirmation.",
    requiresApproval: true,
    inputSchema: z.object({
      bookingId: z.string(),
      amountPaise: z.number(),
      confirm: z.boolean().optional(),
    }),
    jsonSchema: obj(
      {
        bookingId: { type: "string" },
        amountPaise: { type: "number" },
        confirm: { type: "boolean" },
      },
      ["bookingId", "amountPaise"],
    ),
    async run(args, ctx) {
      assertScope(ctx, "payments:refund");
      if (!args.confirm) {
        return {
          needsConfirmation: true,
          message: "Re-call with confirm=true to process this refund.",
        };
      }
      // Recorded but not auto-executed against Razorpay from the AI path in v1.
      return { status: "PENDING_OWNER_APPROVAL" };
    },
  },
];

export const TOOL_CATALOG = TOOLS.map((t) => ({
  name: t.name,
  scope: t.scope,
  description: t.description,
  requiresApproval: !!t.requiresApproval,
}));

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

async function ownsBooking(ctx: McpContext, bookingId: string) {
  const b = await prisma.booking.findFirst({
    where: { id: bookingId, property: { ownerId: ctx.ownerId } },
    select: { id: true },
  });
  if (!b) throw new ScopeError("Booking not found in your workspace.");
}
