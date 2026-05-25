/**
 * MCP tool catalog. Each tool declares the OAuth scope it needs (scopes map 1:1 to
 * RBAC permissions), a JSON-schema-ish input description, and a handler. RBAC is
 * enforced server-side here, never trusted from the client. Tools reuse the same domain
 * services as the web app.
 *
 * Scope split follows docs/mcp.md (AI vs UI boundary): AI gets the *operational* surface
 * (reacting to inbound guest/staff requests). Fine-tuning (rate-plan authoring, room /
 * property / channel CRUD, team management) is deliberately UI-only — those have no
 * tools here, only read access for context.
 *
 * Property scoping: a MANAGER/STAFF token carries propertyScopes; every tool restricts
 * to them via propertyScopeWhere/assertProperty so a scoped user can't reach other
 * properties (audit §17).
 */
import { z } from "zod";
import { prisma } from "../db";
import { getKpis, sourceMix } from "../reports";
import { computeAvailability } from "../booking/availability";
import {
  createBooking,
  cancelBooking,
  checkInBooking,
  checkOutBooking,
  moveBooking,
} from "../booking/engine";
import {
  createPaymentLinkForBooking,
  createRefund,
  applyPayment,
  RefundError,
} from "../payments/service";
import { quoteRefund, type CancellationReason } from "../booking/cancellation";
import { quoteStay, type RatePlanLike } from "../booking/rates";
import { computeTax } from "../tax";
import { enqueueNotification, sendNow, type TriggerKey } from "../notify/dispatch";
import { deleteStoredFile } from "../storage";
import { writeAudit } from "../audit";
import { inr } from "../money";
import { parseYmd, today, addDays, eachNight, nightsBetween } from "../dates";
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

/** Prisma `where` fragment selecting the properties this caller may touch (owner + scope). */
export function propertyScopeWhere(ctx: McpContext): { ownerId: string; id?: { in: string[] } } {
  return ctx.propertyScopes.length
    ? { ownerId: ctx.ownerId, id: { in: ctx.propertyScopes } }
    : { ownerId: ctx.ownerId };
}

/** Throw if a specific property is outside the caller's property scope. */
export function assertProperty(ctx: McpContext, propertyId: string) {
  if (ctx.propertyScopes.length && !ctx.propertyScopes.includes(propertyId)) {
    throw new ScopeError("This property is outside your access.");
  }
}

/** Property relation filter for list/detail queries, pinned to a requested id when given. */
function propertyFilter(ctx: McpContext, requestedId?: string) {
  if (requestedId) {
    assertProperty(ctx, requestedId);
    return { ...propertyScopeWhere(ctx), id: requestedId };
  }
  return propertyScopeWhere(ctx);
}

const PAYMENT_METHODS = ["cash", "upi", "bank", "card", "other"] as const;
const CLEANLINESS = ["CLEAN", "DIRTY", "IN_PROGRESS", "OUT_OF_ORDER"] as const;

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
        where: { ...propertyScopeWhere(ctx), active: true },
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
      assertProperty(ctx, String(args.propertyId));
      return prisma.property.findFirst({
        where: { id: String(args.propertyId), ownerId: ctx.ownerId },
        include: { rooms: true, roomTypes: true },
      });
    },
  },
  {
    name: "list_rooms",
    scope: "properties:read",
    description:
      "List rooms of a property, including each room's housekeeping (cleanliness) status.",
    inputSchema: z.object({ propertyId: z.string() }),
    jsonSchema: obj({ propertyId: { type: "string" } }, ["propertyId"]),
    async run(args, ctx) {
      assertScope(ctx, "properties:read");
      assertProperty(ctx, String(args.propertyId));
      return prisma.room.findMany({
        where: { propertyId: String(args.propertyId), property: { ownerId: ctx.ownerId } },
        include: { roomType: true },
      });
    },
  },
  {
    name: "list_channels",
    scope: "bookings:read",
    description:
      "List booking-source channels. Use a channel's `key` (e.g. direct, walkin, airbnb) " +
      "when calling create_booking. Channels themselves are managed in the web app.",
    inputSchema: z.object({}),
    jsonSchema: obj({}),
    async run(_args, ctx) {
      assertScope(ctx, "bookings:read");
      return prisma.channelSource.findMany({
        where: { ownerId: ctx.ownerId },
        select: { key: true, name: true, color: true, active: true },
        orderBy: { name: "asc" },
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
      assertProperty(ctx, String(args.propertyId));
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
    name: "quote_booking",
    scope: "bookings:read",
    description:
      "Price a prospective stay before booking it: nights, the applied rate plan, GST, and " +
      "whether the room is free. Read-only — answers 'do you have a room, and how much?'.",
    inputSchema: z.object({
      propertyId: z.string(),
      roomId: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
    }),
    jsonSchema: obj(
      {
        propertyId: { type: "string" },
        roomId: { type: "string" },
        checkIn: { type: "string" },
        checkOut: { type: "string" },
      },
      ["propertyId", "roomId", "checkIn", "checkOut"],
    ),
    async run(args, ctx) {
      assertScope(ctx, "bookings:read");
      assertProperty(ctx, String(args.propertyId));
      const start = parseYmd(String(args.checkIn));
      const end = parseYmd(String(args.checkOut));
      const nights = nightsBetween(start, end);
      if (nights < 1) throw new Error("Check-out must be after check-in.");
      const room = await prisma.room.findFirst({
        where: {
          id: String(args.roomId),
          propertyId: String(args.propertyId),
          property: { ownerId: ctx.ownerId },
        },
        include: { roomType: true, property: true },
      });
      if (!room) throw new ScopeError("Room not found in your workspace.");

      const plans = await loadRatePlans(String(args.propertyId));
      const { perNight, subtotal } = quoteStay(
        eachNight(start, end),
        room.roomTypeId,
        room.roomType.baseRate,
        plans,
      );
      const tax = computeTax(
        perNight.map((n) => ({ nightlyRatePaise: n.rate, nights: 1 })),
        !!room.property.gstin,
      );
      const [occupied, blocked] = await Promise.all([
        prisma.bookingRoom.findFirst({
          where: { roomId: room.id, date: { gte: start, lt: end } },
        }),
        prisma.maintenanceBlock.findFirst({
          where: { roomId: room.id, startDate: { lt: end }, endDate: { gt: start } },
        }),
      ]);
      const planNames = [...new Set(perNight.map((n) => n.planName).filter(Boolean))] as string[];
      return {
        nights,
        available: !occupied && !blocked,
        avgNightlyPaise: Math.round(subtotal / nights),
        subtotalPaise: tax.subtotalPaise,
        taxPaise: tax.taxAmountPaise,
        totalPaise: tax.totalPaise,
        appliedPlan: planNames.length ? planNames.join(", ") : null,
        ratesVary: new Set(perNight.map((n) => n.rate)).size > 1,
      };
    },
  },
  {
    name: "list_bookings",
    scope: "bookings:read",
    description:
      "Filter bookings by property, date range, and status. Includes the source channel.",
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
          property: propertyFilter(ctx, args.propertyId ? String(args.propertyId) : undefined),
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
          channel: { select: { key: true, name: true } },
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
        where: { property: propertyScopeWhere(ctx), OR: [{ id: idOrRef }, { ref: idOrRef }] },
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
      let propertyId = args.propertyId ? String(args.propertyId) : undefined;
      if (propertyId) assertProperty(ctx, propertyId);
      else if (ctx.propertyScopes.length === 1) propertyId = ctx.propertyScopes[0];
      else if (ctx.propertyScopes.length > 1)
        throw new ScopeError(
          "Specify a propertyId — your access is limited to specific properties.",
        );
      return getKpis(ctx.ownerId, from, to, propertyId);
    },
  },
  {
    name: "source_mix",
    scope: "reports:read",
    description: "Booking counts and percentages by source channel for a date range (YYYY-MM-DD).",
    inputSchema: z.object({ from: z.string().optional(), to: z.string().optional() }),
    jsonSchema: obj({ from: { type: "string" }, to: { type: "string" } }),
    async run(args, ctx) {
      assertScope(ctx, "reports:read");
      const from = args.from ? parseYmd(String(args.from)) : addDays(today(), -30);
      const to = args.to ? parseYmd(String(args.to)) : addDays(today(), 1);
      return sourceMix(ctx.ownerId, from, to);
    },
  },
  {
    name: "search_guests",
    scope: "bookings:read",
    description:
      "Search/segment guests by name or phone substring, and optionally filter by stay dates, " +
      "marketing-consent, or foreign nationals (phone partially redacted; use get_guest for detail).",
    inputSchema: z.object({
      query: z.string().optional(),
      stayedFrom: z.string().optional(),
      stayedTo: z.string().optional(),
      marketingConsent: z.boolean().optional(),
      foreignOnly: z.boolean().optional(),
    }),
    jsonSchema: obj({
      query: { type: "string" },
      stayedFrom: { type: "string" },
      stayedTo: { type: "string" },
      marketingConsent: { type: "boolean" },
      foreignOnly: { type: "boolean" },
    }),
    async run(args, ctx) {
      assertScope(ctx, "bookings:read");
      const q = args.query ? String(args.query) : "";
      const stayedFrom = args.stayedFrom ? parseYmd(String(args.stayedFrom)) : undefined;
      const stayedTo = args.stayedTo ? parseYmd(String(args.stayedTo)) : undefined;
      const guests = await prisma.guest.findMany({
        where: {
          ownerId: ctx.ownerId,
          ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } : {}),
          ...(args.marketingConsent !== undefined
            ? { marketingConsent: Boolean(args.marketingConsent) }
            : {}),
          ...(args.foreignOnly ? { isForeign: true } : {}),
          ...(stayedFrom || stayedTo
            ? {
                bookings: {
                  some: {
                    booking: {
                      property: propertyScopeWhere(ctx),
                      ...(stayedFrom ? { checkIn: { gte: stayedFrom } } : {}),
                      ...(stayedTo ? { checkIn: { lte: stayedTo } } : {}),
                    },
                  },
                },
              }
            : {}),
        },
        take: 50,
      });
      return guests.map((g) => ({
        id: g.id,
        name: g.name,
        phone: g.phone.replace(/.(?=.{4})/g, "x"),
        city: g.city,
        isForeign: g.isForeign,
        marketingConsent: g.marketingConsent,
      }));
    },
  },
  {
    name: "get_guest",
    scope: "guests:read",
    description:
      "Full guest profile: contact, consent, whether an ID is on file, and recent booking history.",
    inputSchema: z.object({ guestId: z.string() }),
    jsonSchema: obj({ guestId: { type: "string" } }, ["guestId"]),
    async run(args, ctx) {
      assertScope(ctx, "guests:read");
      const g = await prisma.guest.findFirst({
        where: { id: String(args.guestId), ownerId: ctx.ownerId },
        include: {
          bookings: {
            include: {
              booking: {
                select: {
                  id: true,
                  ref: true,
                  status: true,
                  checkIn: true,
                  checkOut: true,
                  totalAmount: true,
                  amountPaid: true,
                },
              },
            },
          },
        },
      });
      if (!g) throw new ScopeError("Guest not found in your workspace.");
      return {
        id: g.id,
        name: g.name,
        phone: g.phone,
        email: g.email,
        city: g.city,
        isForeign: g.isForeign,
        nationality: g.nationality,
        idType: g.idType,
        idLast4: g.idLast4,
        idOnFile: !!g.idFileId,
        marketingConsent: g.marketingConsent,
        dpdpConsentAt: g.dpdpConsentAt,
        notes: g.notes,
        bookings: g.bookings.map((bg) => bg.booking),
      };
    },
  },
  {
    name: "update_guest",
    scope: "guests:write",
    description:
      "Correct a guest's details (name, email, city, notes) or set their marketing consent — " +
      "e.g. a guest messages a new email or asks to stop receiving offers.",
    inputSchema: z.object({
      guestId: z.string(),
      name: z.string().optional(),
      email: z.string().optional(),
      city: z.string().optional(),
      notes: z.string().optional(),
      marketingConsent: z.boolean().optional(),
    }),
    jsonSchema: obj(
      {
        guestId: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        city: { type: "string" },
        notes: { type: "string" },
        marketingConsent: { type: "boolean" },
      },
      ["guestId"],
    ),
    async run(args, ctx) {
      assertScope(ctx, "guests:write");
      const g = await prisma.guest.findFirst({
        where: { id: String(args.guestId), ownerId: ctx.ownerId },
      });
      if (!g) throw new ScopeError("Guest not found in your workspace.");
      const data: Record<string, unknown> = {};
      if (args.name !== undefined) data.name = String(args.name);
      if (args.email !== undefined) data.email = String(args.email) || null;
      if (args.city !== undefined) data.city = String(args.city) || null;
      if (args.notes !== undefined) data.notes = String(args.notes) || null;
      if (args.marketingConsent !== undefined) {
        const next = Boolean(args.marketingConsent);
        data.marketingConsent = next;
        data.dpdpConsentAt = next ? new Date() : g.dpdpConsentAt;
      }
      await prisma.guest.update({ where: { id: g.id }, data });
      await writeAudit({
        ownerId: ctx.ownerId,
        actorType: "MCP",
        actorId: ctx.userId,
        actorName: `${ctx.name} via Claude (AI)`,
        action: "GUEST_UPDATED",
        entityType: "Guest",
        entityId: g.id,
        summary: `updated guest ${g.name} via AI`,
      });
      return { id: g.id, updated: Object.keys(data) };
    },
  },
  {
    name: "create_booking",
    scope: "bookings:write",
    description: "Create a manual booking with an attributed source channel (see list_channels).",
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
      assertProperty(ctx, String(args.propertyId));
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
    description:
      "Cancel a booking with a reason (releases the room nights). Requires human-in-the-loop: " +
      "call once to preview, then again with confirm=true. Does not auto-refund — use initiate_refund.",
    requiresApproval: true,
    inputSchema: z.object({
      bookingId: z.string(),
      reason: z.string(),
      confirm: z.boolean().optional(),
    }),
    jsonSchema: obj(
      { bookingId: { type: "string" }, reason: { type: "string" }, confirm: { type: "boolean" } },
      ["bookingId", "reason"],
    ),
    async run(args, ctx) {
      assertScope(ctx, "bookings:cancel");
      await ownsBooking(ctx, String(args.bookingId));
      if (!args.confirm) {
        const b = await prisma.booking.findUnique({
          where: { id: String(args.bookingId) },
          select: { ref: true, status: true, amountPaid: true },
        });
        return {
          needsConfirmation: true,
          ref: b?.ref,
          status: b?.status,
          amountPaidPaise: b?.amountPaid ?? 0,
          message:
            (b && b.amountPaid > 0
              ? `This booking has ${inr(b.amountPaid)} paid; cancelling does NOT refund it (call initiate_refund separately). `
              : "") + "Re-call with confirm=true to release the room nights.",
        };
      }
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
    name: "confirm_booking",
    scope: "bookings:write",
    description: "Confirm a TENTATIVE booking (e.g. a held enquiry the guest has now agreed to).",
    inputSchema: z.object({ bookingId: z.string() }),
    jsonSchema: obj({ bookingId: { type: "string" } }, ["bookingId"]),
    async run(args, ctx) {
      assertScope(ctx, "bookings:write");
      await ownsBooking(ctx, String(args.bookingId));
      const b = await prisma.booking.findUnique({ where: { id: String(args.bookingId) } });
      if (!b) throw new Error("Booking not found.");
      if (b.status !== "TENTATIVE") {
        throw new Error(`Only tentative bookings can be confirmed (this one is ${b.status}).`);
      }
      const updated = await prisma.booking.update({
        where: { id: b.id },
        data: { status: "CONFIRMED" },
      });
      await writeAudit({
        ownerId: ctx.ownerId,
        actorType: "MCP",
        actorId: ctx.userId,
        actorName: "Claude (AI)",
        action: "BOOKING_CONFIRMED",
        entityType: "Booking",
        entityId: b.id,
        summary: `confirmed booking ${b.ref} via AI`,
      });
      return { id: updated.id, status: updated.status };
    },
  },
  {
    name: "mark_no_show",
    scope: "bookings:write",
    description: "Mark a booking as a no-show and release its room nights for rebooking.",
    inputSchema: z.object({ bookingId: z.string() }),
    jsonSchema: obj({ bookingId: { type: "string" } }, ["bookingId"]),
    async run(args, ctx) {
      assertScope(ctx, "bookings:write");
      await ownsBooking(ctx, String(args.bookingId));
      const b = await prisma.booking.findUnique({ where: { id: String(args.bookingId) } });
      if (!b) throw new Error("Booking not found.");
      if (["CANCELLED", "CHECKED_OUT", "NO_SHOW"].includes(b.status)) {
        throw new Error(`This booking can't be marked no-show (it is ${b.status}).`);
      }
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({ where: { id: b.id }, data: { status: "NO_SHOW" } });
        await tx.bookingRoom.deleteMany({ where: { bookingId: b.id } });
      });
      await writeAudit({
        ownerId: ctx.ownerId,
        actorType: "MCP",
        actorId: ctx.userId,
        actorName: "Claude (AI)",
        action: "BOOKING_NO_SHOW",
        entityType: "Booking",
        entityId: b.id,
        summary: `marked booking ${b.ref} as no-show via AI`,
      });
      return { id: b.id, status: "NO_SHOW" };
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
    name: "update_booking_notes",
    scope: "bookings:write",
    description:
      "Add or replace the internal notes on a booking — e.g. 'guest arriving ~6pm, wants early check-in'.",
    inputSchema: z.object({ bookingId: z.string(), notes: z.string() }),
    jsonSchema: obj({ bookingId: { type: "string" }, notes: { type: "string" } }, [
      "bookingId",
      "notes",
    ]),
    async run(args, ctx) {
      assertScope(ctx, "bookings:write");
      await ownsBooking(ctx, String(args.bookingId));
      const trimmed = String(args.notes).trim();
      if (trimmed.length > 2000) throw new Error("Notes are too long (max 2000 chars).");
      await prisma.booking.update({
        where: { id: String(args.bookingId) },
        data: { notes: trimmed || null },
      });
      await writeAudit({
        ownerId: ctx.ownerId,
        actorType: "MCP",
        actorId: ctx.userId,
        actorName: "Claude (AI)",
        action: "BOOKING_NOTE_UPDATED",
        entityType: "Booking",
        entityId: String(args.bookingId),
        summary: trimmed ? "updated booking notes via AI" : "cleared booking notes via AI",
      });
      return { ok: true };
    },
  },
  {
    name: "set_room_status",
    scope: "bookings:write",
    description:
      "Set a room's housekeeping status: CLEAN, DIRTY, IN_PROGRESS or OUT_OF_ORDER — " +
      "e.g. a housekeeper messages that a room is cleaned.",
    inputSchema: z.object({ roomId: z.string(), status: z.string() }),
    jsonSchema: obj({ roomId: { type: "string" }, status: { type: "string" } }, [
      "roomId",
      "status",
    ]),
    async run(args, ctx) {
      assertScope(ctx, "bookings:write");
      const room = await getOwnedRoom(ctx, String(args.roomId));
      const status = String(args.status).toUpperCase();
      if (!(CLEANLINESS as readonly string[]).includes(status)) {
        throw new Error(`status must be one of ${CLEANLINESS.join(", ")}.`);
      }
      await prisma.room.update({
        where: { id: room.id },
        data: { cleanliness: status as (typeof CLEANLINESS)[number] },
      });
      await writeAudit({
        ownerId: ctx.ownerId,
        actorType: "MCP",
        actorId: ctx.userId,
        actorName: "Claude (AI)",
        action: "ROOM_STATUS_SET",
        entityType: "Room",
        entityId: room.id,
        summary: `set ${room.name} to ${status} via AI`,
      });
      return { id: room.id, cleanliness: status };
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
        where: { id: String(args.bookingId), property: propertyScopeWhere(ctx) },
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
    name: "record_payment",
    scope: "payments:write",
    description:
      "Record a payment received outside the online flow (cash, UPI, bank, card) — " +
      "e.g. 'guest paid ₹5,000 cash at the desk'. Amount is in paise and can't exceed the balance due.",
    inputSchema: z.object({
      bookingId: z.string(),
      amountPaise: z.number(),
      method: z.string().optional(),
      reference: z.string().optional(),
    }),
    jsonSchema: obj(
      {
        bookingId: { type: "string" },
        amountPaise: { type: "number" },
        method: { type: "string" },
        reference: { type: "string" },
      },
      ["bookingId", "amountPaise"],
    ),
    async run(args, ctx) {
      assertScope(ctx, "payments:write");
      await ownsBooking(ctx, String(args.bookingId));
      const booking = await prisma.booking.findUnique({ where: { id: String(args.bookingId) } });
      if (!booking) throw new Error("Booking not found.");
      const amount = Math.round(Number(args.amountPaise));
      if (!Number.isFinite(amount) || amount <= 0)
        throw new Error("Enter a valid amount in paise.");
      const due = booking.totalAmount - booking.amountPaid;
      if (amount > due) throw new Error(`That's more than the ${inr(due)} still due.`);
      const method = (PAYMENT_METHODS as readonly string[]).includes(String(args.method))
        ? String(args.method)
        : "other";
      await applyPayment(String(args.bookingId), amount, { method });
      await writeAudit({
        ownerId: ctx.ownerId,
        actorType: "MCP",
        actorId: ctx.userId,
        actorName: `${ctx.name} via Claude (AI)`,
        action: "PAYMENT_RECORDED",
        entityType: "Booking",
        entityId: String(args.bookingId),
        summary: `recorded ${inr(amount)} (${method}${args.reference ? ` · ${args.reference}` : ""}) via AI`,
      });
      return { paidPaise: booking.amountPaid + amount, duePaise: due - amount, method };
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
      assertProperty(ctx, String(args.propertyId));
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
    name: "list_maintenance_blocks",
    scope: "properties:read",
    description:
      "List maintenance/owner blocks for a property (optionally overlapping a date range), " +
      "so a block can be found and removed with unblock_room.",
    inputSchema: z.object({
      propertyId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
    jsonSchema: obj({
      propertyId: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
    }),
    async run(args, ctx) {
      assertScope(ctx, "properties:read");
      const from = args.from ? parseYmd(String(args.from)) : undefined;
      const to = args.to ? parseYmd(String(args.to)) : undefined;
      return prisma.maintenanceBlock.findMany({
        where: {
          property: propertyFilter(ctx, args.propertyId ? String(args.propertyId) : undefined),
          ...(to ? { startDate: { lt: to } } : {}),
          ...(from ? { endDate: { gt: from } } : {}),
        },
        include: { room: { select: { name: true, number: true } } },
        orderBy: { startDate: "asc" },
        take: 100,
      });
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
        where: { id: String(args.blockId), property: propertyScopeWhere(ctx) },
      });
      if (!block) throw new Error("Block not found in your workspace.");
      await prisma.maintenanceBlock.delete({ where: { id: block.id } });
      return { ok: true };
    },
  },
  {
    name: "list_rate_plans",
    scope: "properties:read",
    description:
      "List a property's rate plans with their per-room-type overrides. Read-only: rate plans " +
      "are authored in the web app (pricing strategy is a deliberate, UI-only task).",
    inputSchema: z.object({ propertyId: z.string() }),
    jsonSchema: obj({ propertyId: { type: "string" } }, ["propertyId"]),
    async run(args, ctx) {
      assertScope(ctx, "properties:read");
      assertProperty(ctx, String(args.propertyId));
      return prisma.ratePlan.findMany({
        where: { propertyId: String(args.propertyId), property: { ownerId: ctx.ownerId } },
        orderBy: { priority: "desc" },
        include: { overrides: true },
      });
    },
  },
  {
    name: "list_form_c_pending",
    scope: "compliance:read",
    description:
      "List confirmed/checked-in bookings whose foreign-national guest still needs FRRO Form C " +
      "filed (formCFiledAt is empty). Surfaces the compliance backlog for the daily briefing.",
    inputSchema: z.object({ propertyId: z.string().optional() }),
    jsonSchema: obj({ propertyId: { type: "string" } }),
    async run(args, ctx) {
      assertScope(ctx, "compliance:read");
      const rows = await prisma.booking.findMany({
        where: {
          property: propertyFilter(ctx, args.propertyId ? String(args.propertyId) : undefined),
          formCFiledAt: null,
          status: { in: ["CONFIRMED", "CHECKED_IN"] },
          guests: { some: { isPrimary: true, guest: { isForeign: true } } },
        },
        select: {
          id: true,
          ref: true,
          status: true,
          checkIn: true,
          checkOut: true,
          guests: {
            where: { isPrimary: true },
            select: {
              guest: {
                select: { name: true, nationality: true, idType: true, idLast4: true },
              },
            },
          },
        },
        orderBy: { checkIn: "asc" },
        take: 50,
      });
      return rows.map((b) => ({
        bookingId: b.id,
        ref: b.ref,
        status: b.status,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        guest: b.guests[0]?.guest ?? null,
      }));
    },
  },
  {
    name: "mark_form_c_filed",
    scope: "compliance:write",
    description: "Record that FRRO Form C has been filed for a booking's foreign guest.",
    inputSchema: z.object({ bookingId: z.string() }),
    jsonSchema: obj({ bookingId: { type: "string" } }, ["bookingId"]),
    async run(args, ctx) {
      assertScope(ctx, "compliance:write");
      await ownsBooking(ctx, String(args.bookingId));
      const filedAt = new Date();
      const b = await prisma.booking.update({
        where: { id: String(args.bookingId) },
        data: { formCFiledAt: filedAt },
      });
      await writeAudit({
        ownerId: ctx.ownerId,
        actorType: "MCP",
        actorId: ctx.userId,
        actorName: "Claude (AI)",
        action: "FORM_C_FILED",
        entityType: "Booking",
        entityId: b.id,
        summary: `marked Form C filed for booking ${b.ref} via AI`,
      });
      return { id: b.id, formCFiledAt: filedAt };
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
  {
    name: "resend_notification",
    scope: "notifications:send",
    description:
      "Re-send a previously sent message by its notification-log id — e.g. a payment link the " +
      "guest says never arrived (find the id with list_notification_log).",
    inputSchema: z.object({ logId: z.string() }),
    jsonSchema: obj({ logId: { type: "string" } }, ["logId"]),
    async run(args, ctx) {
      assertScope(ctx, "notifications:send");
      const log = await prisma.notificationLog.findUnique({ where: { id: String(args.logId) } });
      if (!log?.templateId) throw new Error("This message can't be re-sent.");
      const template = await prisma.notificationTemplate.findFirst({
        where: { id: log.templateId, ownerId: ctx.ownerId },
      });
      if (!template) throw new ScopeError("That message is not in your workspace.");

      let scope: Record<string, unknown> = {};
      if (log.bookingId) {
        await ownsBooking(ctx, log.bookingId);
        const booking = await prisma.booking.findUnique({
          where: { id: log.bookingId },
          include: {
            property: true,
            guests: { where: { isPrimary: true }, include: { guest: true } },
          },
        });
        if (booking) {
          const guest = booking.guests[0]?.guest;
          scope = {
            guest: { name: guest?.name ?? "" },
            booking: {
              ref: booking.ref,
              checkIn: booking.checkIn.toISOString(),
              checkOut: booking.checkOut.toISOString(),
            },
            property: { name: booking.property.name, checkInTime: booking.property.checkInTime },
            amount: { due: booking.totalAmount - booking.amountPaid, total: booking.totalAmount },
          };
        }
      }
      await sendNow(template.id, log.to, scope, { bookingId: log.bookingId ?? undefined });
      return { ok: true, to: maskContact(log.to) };
    },
  },
  {
    name: "list_notification_log",
    scope: "notifications:read",
    description:
      "Recent message deliveries (status, channel, errors), optionally for one booking — " +
      "answers 'did the confirmation/payment SMS actually go out?'. Recipient is masked.",
    inputSchema: z.object({ bookingId: z.string().optional() }),
    jsonSchema: obj({ bookingId: { type: "string" } }),
    async run(args, ctx) {
      assertScope(ctx, "notifications:read");
      if (args.bookingId) await ownsBooking(ctx, String(args.bookingId));
      const logs = await prisma.notificationLog.findMany({
        where: args.bookingId
          ? { bookingId: String(args.bookingId) }
          : { booking: { property: propertyScopeWhere(ctx) } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          channel: true,
          status: true,
          triggerKey: true,
          to: true,
          sentAt: true,
          lastError: true,
          createdAt: true,
        },
      });
      return logs.map((l) => ({ ...l, to: maskContact(l.to) }));
    },
  },
  {
    name: "erase_guest",
    scope: "guests:write",
    description:
      "DPDP right-to-erasure: anonymise (when tax records must be kept) or fully delete a guest's " +
      "personal data. Requires human-in-the-loop: call once to preview, then again with confirm=true.",
    requiresApproval: true,
    inputSchema: z.object({ guestId: z.string(), confirm: z.boolean().optional() }),
    jsonSchema: obj({ guestId: { type: "string" }, confirm: { type: "boolean" } }, ["guestId"]),
    async run(args, ctx) {
      assertScope(ctx, "guests:write");
      const guestId = String(args.guestId);
      const g = await prisma.guest.findFirst({ where: { id: guestId, ownerId: ctx.ownerId } });
      if (!g) throw new ScopeError("Guest not found in your workspace.");
      const billable = await prisma.booking.count({
        where: { guests: { some: { guestId } }, status: { not: "CANCELLED" } },
      });
      if (!args.confirm) {
        return {
          needsConfirmation: true,
          willAnonymise: billable > 0,
          billableBookings: billable,
          message:
            billable > 0
              ? "This guest has billable bookings; their PII will be anonymised but tax records " +
                "kept. Re-call with confirm=true."
              : "This guest has no billable bookings and will be fully deleted. Re-call with confirm=true.",
        };
      }
      if (g.idFileId) await deleteStoredFile(g.idFileId);
      if (billable > 0) {
        await prisma.guest.update({
          where: { id: guestId },
          data: {
            name: "Erased guest",
            phone: `erased_${guestId}`,
            email: null,
            city: null,
            notes: null,
            idType: null,
            idLast4: null,
            idFileId: null,
            marketingConsent: false,
          },
        });
        await writeAudit({
          ownerId: ctx.ownerId,
          actorType: "MCP",
          actorId: ctx.userId,
          actorName: `${ctx.name} via Claude (AI)`,
          action: "GUEST_ANONYMISED",
          entityType: "Guest",
          entityId: guestId,
          summary: `anonymised guest PII via AI (retained ${billable} booking record(s) for tax)`,
        });
        return { status: "anonymised", retainedBookings: billable };
      }
      await prisma.guest.delete({ where: { id: guestId } });
      await writeAudit({
        ownerId: ctx.ownerId,
        actorType: "MCP",
        actorId: ctx.userId,
        actorName: `${ctx.name} via Claude (AI)`,
        action: "GUEST_ERASED",
        entityType: "Guest",
        entityId: guestId,
        summary: `erased guest ${g.name} via AI`,
      });
      return { status: "deleted" };
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

/** Mask a phone/email for display in read tools, keeping just enough to recognise it. */
function maskContact(s: string): string {
  if (s.includes("@")) {
    const [u, d] = s.split("@");
    return `${u.slice(0, 2)}***@${d}`;
  }
  return s.replace(/.(?=.{4})/g, "x");
}

async function loadRatePlans(propertyId: string): Promise<RatePlanLike[]> {
  const plans = await prisma.ratePlan.findMany({
    where: { propertyId },
    include: { overrides: true },
  });
  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    priority: p.priority,
    startDate: p.startDate,
    endDate: p.endDate,
    daysOfWeek: p.daysOfWeek,
    overrides: p.overrides.map((o) => ({ roomTypeId: o.roomTypeId, amount: o.amount })),
  }));
}

async function ownsBooking(ctx: McpContext, bookingId: string) {
  const b = await prisma.booking.findFirst({
    where: { id: bookingId, property: propertyScopeWhere(ctx) },
    select: { id: true },
  });
  if (!b) throw new ScopeError("Booking not found in your workspace.");
}

async function getOwnedRoom(ctx: McpContext, roomId: string) {
  const room = await prisma.room.findFirst({
    where: { id: roomId, property: propertyScopeWhere(ctx) },
  });
  if (!room) throw new ScopeError("Room not found in your workspace.");
  return room;
}
