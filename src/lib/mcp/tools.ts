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
import {
  createBooking,
  cancelBooking,
  checkInBooking,
  checkOutBooking,
  moveBooking,
} from "../booking/engine";
import { createPaymentLinkForBooking, createRefund, RefundError } from "../payments/service";
import { quoteRefund, type CancellationReason } from "../booking/cancellation";
import { enqueueNotification, type TriggerKey } from "../notify/dispatch";
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
    description:
      "Refund a booking. Requires human-in-the-loop: call once to preview the policy " +
      "amount, then again with confirm=true to process. Reason defaults to 'Guest cancellation'.",
    requiresApproval: true,
    inputSchema: z.object({
      bookingId: z.string(),
      amountPaise: z.number().optional(),
      reason: z.string().optional(),
      confirm: z.boolean().optional(),
    }),
    jsonSchema: obj(
      {
        bookingId: { type: "string" },
        amountPaise: { type: "number" },
        reason: { type: "string" },
        confirm: { type: "boolean" },
      },
      ["bookingId"],
    ),
    async run(args, ctx) {
      assertScope(ctx, "payments:refund");
      const bookingId = String(args.bookingId);
      await ownsBooking(ctx, bookingId);
      const reason = (args.reason as CancellationReason | undefined) ?? "Guest cancellation";
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!booking) throw new Error("Booking not found");

      const quote = quoteRefund({
        amountPaidPaise: booking.amountPaid,
        checkIn: booking.checkIn,
        reason,
      });
      const amountPaise = (args.amountPaise as number | undefined) ?? quote.refundablePaise;

      if (!args.confirm) {
        return {
          needsConfirmation: true,
          policy: quote.explanation,
          refundablePaise: quote.refundablePaise,
          amountToRefundPaise: amountPaise,
          message: "Re-call with confirm=true to process this refund.",
        };
      }
      try {
        const { refund, mock } = await createRefund(bookingId, {
          amountPaise,
          reason,
          initiatedById: ctx.userId,
          actorName: ctx.name + " via Claude (AI)",
          actorType: "MCP",
        });
        return { status: refund.status, amountPaise: refund.amount, mock };
      } catch (e) {
        if (e instanceof RefundError) return { error: e.message };
        throw e;
      }
    },
  },
  {
    name: "modify_booking",
    scope: "bookings:write",
    description: "Move a booking to a different room and/or dates. Rates and GST are recalculated.",
    inputSchema: z.object({
      bookingId: z.string(),
      roomId: z.string().optional(),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
    }),
    jsonSchema: obj(
      {
        bookingId: { type: "string" },
        roomId: { type: "string" },
        checkIn: { type: "string" },
        checkOut: { type: "string" },
      },
      ["bookingId"],
    ),
    async run(args, ctx) {
      assertScope(ctx, "bookings:write");
      await ownsBooking(ctx, String(args.bookingId));
      const b = await moveBooking({
        bookingId: String(args.bookingId),
        ownerId: ctx.ownerId,
        roomId: args.roomId ? String(args.roomId) : undefined,
        checkIn: args.checkIn ? String(args.checkIn) : undefined,
        checkOut: args.checkOut ? String(args.checkOut) : undefined,
        actorName: ctx.name + " via Claude (AI)",
        actorType: "MCP",
      });
      return { id: b.id, ref: b.ref, total: b.totalAmount };
    },
  },
  {
    name: "block_room",
    scope: "properties:write",
    description: "Block a room for maintenance/owner use across a date range (YYYY-MM-DD).",
    inputSchema: z.object({
      propertyId: z.string(),
      roomId: z.string(),
      from: z.string(),
      to: z.string(),
      reason: z.string(),
    }),
    jsonSchema: obj(
      {
        propertyId: { type: "string" },
        roomId: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        reason: { type: "string" },
      },
      ["propertyId", "roomId", "from", "to", "reason"],
    ),
    async run(args, ctx) {
      assertScope(ctx, "properties:write");
      const propertyId = String(args.propertyId);
      const room = await prisma.room.findFirst({
        where: { id: String(args.roomId), propertyId, property: { ownerId: ctx.ownerId } },
      });
      if (!room) throw new Error("Room not found in your workspace.");
      const start = parseYmd(String(args.from));
      const end = parseYmd(String(args.to));
      if (end <= start) throw new Error("End date must be after start date.");
      const clash = await prisma.bookingRoom.findFirst({
        where: { roomId: room.id, date: { gte: start, lt: end } },
      });
      if (clash) throw new Error("Those dates overlap an existing booking.");
      const block = await prisma.maintenanceBlock.create({
        data: {
          propertyId,
          roomId: room.id,
          startDate: start,
          endDate: end,
          reason: String(args.reason),
          createdById: ctx.userId,
        },
      });
      return { id: block.id };
    },
  },
  {
    name: "unblock_room",
    scope: "properties:write",
    description: "Remove a maintenance block by id.",
    inputSchema: z.object({ blockId: z.string() }),
    jsonSchema: obj({ blockId: { type: "string" } }, ["blockId"]),
    async run(args, ctx) {
      assertScope(ctx, "properties:write");
      const block = await prisma.maintenanceBlock.findFirst({
        where: { id: String(args.blockId), property: { ownerId: ctx.ownerId } },
      });
      if (!block) throw new Error("Block not found in your workspace.");
      await prisma.maintenanceBlock.delete({ where: { id: block.id } });
      return { ok: true };
    },
  },
  {
    name: "list_rate_plans",
    scope: "properties:read",
    description: "List a property's rate plans with their per-room-type overrides.",
    inputSchema: z.object({ propertyId: z.string() }),
    jsonSchema: obj({ propertyId: { type: "string" } }, ["propertyId"]),
    async run(args, ctx) {
      assertScope(ctx, "properties:read");
      return prisma.ratePlan.findMany({
        where: { propertyId: String(args.propertyId), property: { ownerId: ctx.ownerId } },
        orderBy: { priority: "desc" },
        include: { overrides: true },
      });
    },
  },
  {
    name: "upsert_rate_plan",
    scope: "properties:write",
    description: "Create a rate plan with optional per-room-type nightly overrides (paise).",
    inputSchema: z.object({
      propertyId: z.string(),
      name: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      priority: z.number().optional(),
      overrides: z.array(z.object({ roomTypeId: z.string(), amountPaise: z.number() })).optional(),
    }),
    jsonSchema: obj(
      {
        propertyId: { type: "string" },
        name: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
        priority: { type: "number" },
        overrides: { type: "array" },
      },
      ["propertyId", "name", "startDate", "endDate"],
    ),
    async run(args, ctx) {
      assertScope(ctx, "properties:write");
      const property = await prisma.property.findFirst({
        where: { id: String(args.propertyId), ownerId: ctx.ownerId },
      });
      if (!property) throw new Error("Property not found in your workspace.");
      const overrides = (args.overrides as { roomTypeId: string; amountPaise: number }[]) ?? [];
      const plan = await prisma.ratePlan.create({
        data: {
          propertyId: property.id,
          name: String(args.name),
          priority: (args.priority as number) ?? 0,
          startDate: parseYmd(String(args.startDate)),
          endDate: parseYmd(String(args.endDate)),
          overrides: {
            create: overrides.map((o) => ({
              roomTypeId: o.roomTypeId,
              amount: Math.round(o.amountPaise),
            })),
          },
        },
      });
      return { id: plan.id, name: plan.name };
    },
  },
  {
    name: "send_notification",
    scope: "notifications:send",
    description:
      "Queue a templated message to a booking's guest for a trigger (e.g. PAYMENT_LINK_SENT, " +
      "PRE_ARRIVAL_24H, POST_CHECKOUT_THANKS). The owner's active templates decide the channels.",
    inputSchema: z.object({ bookingId: z.string(), triggerKey: z.string() }),
    jsonSchema: obj({ bookingId: { type: "string" }, triggerKey: { type: "string" } }, [
      "bookingId",
      "triggerKey",
    ]),
    async run(args, ctx) {
      assertScope(ctx, "notifications:send");
      const bookingId = String(args.bookingId);
      await ownsBooking(ctx, bookingId);
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          property: true,
          guests: { where: { isPrimary: true }, include: { guest: true } },
        },
      });
      const guest = booking?.guests[0]?.guest;
      if (!booking || !guest) throw new Error("Booking has no guest to notify.");
      const logs = await enqueueNotification({
        ownerId: ctx.ownerId,
        triggerKey: String(args.triggerKey) as TriggerKey,
        to: guest.phone,
        bookingId,
        scope: { guest, booking, property: booking.property },
      });
      return { queued: logs.length };
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
