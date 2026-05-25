"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "../auth/context";
import { assertAccess } from "../rbac/policy";
import {
  createBooking,
  checkInBooking,
  checkOutBooking,
  cancelBooking,
  confirmBookingHold,
  markNoShow,
  moveBooking,
  DoubleBookingError,
  BookingValidationError,
} from "../booking/engine";
import { createPaymentLinkForBooking, applyPayment } from "../payments/service";
import { onlinePaymentsEnabled } from "../payments/razorpay/client";
import { writeAudit } from "../audit";
import { prisma } from "../db";
import { toPaise, toRupees, inr } from "../money";
import { eachNight, utcMidnight, nightsBetween } from "../dates";
import { quoteStay, type RatePlanLike } from "../booking/rates";
import { computeTax } from "../tax";
import { GST } from "../config";

export interface ActionResult {
  ok: boolean;
  message?: string;
  ref?: string;
  bookingId?: string;
}

const createSchema = z.object({
  propertyId: z.string().min(1),
  roomId: z.string().optional(),
  roomIds: z.array(z.string()).optional(),
  channelKey: z.string().min(1),
  guestName: z.string().min(1, "Guest name is required"),
  guestPhone: z.string().min(5, "A valid mobile number is required"),
  guestEmail: z.string().email().optional().or(z.literal("")),
  guestCity: z.string().optional(),
  guestState: z.string().optional(),
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  adults: z.coerce.number().int().min(1).default(2),
  children: z.coerce.number().int().min(0).default(0),
  isForeign: z.boolean().optional().default(false),
  nightlyRateRupees: z.coerce.number().optional(),
  payment: z.enum(["link", "paid", "later"]).default("link"),
  notes: z.string().optional(),
});

export async function createBookingAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult> {
  try {
    const data = createSchema.parse(input);
    const ctx = await requireContext();
    assertAccess(ctx, "bookings:write", { propertyId: data.propertyId });

    const roomIds = data.roomIds?.length ? data.roomIds : data.roomId ? [data.roomId] : [];
    if (roomIds.length === 0) return { ok: false, message: "Pick at least one room." };

    const booking = await createBooking({
      ownerId: ctx.ownerId,
      propertyId: data.propertyId,
      roomIds,
      channelKey: data.channelKey,
      checkIn: data.checkIn,
      checkOut: data.checkOut,
      adults: data.adults,
      children: data.children,
      nightlyRatePaise: data.nightlyRateRupees ? toPaise(data.nightlyRateRupees) : undefined,
      guest: {
        name: data.guestName,
        phone: data.guestPhone,
        email: data.guestEmail || null,
        isForeign: data.isForeign,
        city: data.guestCity || null,
        state: data.guestState || null,
      },
      notes: data.notes || null,
      createdById: ctx.userId,
      actorName: ctx.name,
    });

    if (data.payment === "paid") {
      await applyPayment(booking.id, booking.totalAmount, { method: "cash" });
    } else if (data.payment === "link" && (await onlinePaymentsEnabled())) {
      // Online links are best-effort and only when Razorpay is enabled; otherwise the
      // booking simply stays "collect manually" (cash-first default).
      await createPaymentLinkForBooking(booking.id, { actorName: ctx.name }).catch(() => {});
    }

    revalidatePath("/dashboard");
    revalidatePath("/calendar");
    revalidatePath("/bookings");
    return { ok: true, ref: booking.ref, bookingId: booking.id };
  } catch (e) {
    if (e instanceof DoubleBookingError) {
      return { ok: false, message: "That room is already booked for one or more of those nights." };
    }
    if (e instanceof BookingValidationError) return { ok: false, message: e.message };
    if (e instanceof z.ZodError) return { ok: false, message: e.errors[0].message };
    console.error(e);
    return { ok: false, message: "Something went wrong creating the booking." };
  }
}

export interface BookingQuote {
  ok: boolean;
  message?: string;
  nights: number;
  /** Representative nightly rate in rupees (subtotal / nights, rounded) for the rate field. */
  nightlyRupees: number;
  subtotalRupees: number;
  /** GST amount in rupees — computed by the real tax engine (0/5/18% per night). */
  taxRupees: number;
  /** subtotal + tax, in rupees. */
  totalRupees: number;
  /** Human label for the GST line, e.g. "GST 18%", "GST (mixed 5%/18%)", "GST not applicable". */
  taxLabel: string;
  /** Human label for the applied rate plan, "Mixed rate plans", or null for the base rate. */
  appliedPlan: string | null;
  /** True when nightly rates differ across the stay (weekday vs weekend, etc.). */
  varies: boolean;
  /** Selected room type's max occupancy (0 if the room wasn't found), for capacity warnings. */
  maxOccupancy: number;
  /** Rooms (in this property) that can't take the stay — already booked or under maintenance. */
  unavailableRoomIds: string[];
}

/** Build the GST line label from the per-night rate bands actually applied. */
function taxLabelFor(perNight: { rate: number }[], hasGstin: boolean): string {
  if (!hasGstin) return "GST not applicable (not registered)";
  const bands = new Set(perNight.map((n) => (n.rate <= GST.thresholdPaise ? "5%" : "18%")));
  if (bands.size === 0) return "GST not applicable";
  if (bands.size === 1) return `GST ${[...bands][0]}`;
  return "GST (mixed 5% / 18%)";
}

/**
 * Price a prospective stay from the property's rate plans (or a manual nightly rate)
 * AND report which rooms are free for those dates — powering QuickAdd's auto-rate,
 * correct GST, and availability hints (audit P0 #2). Pure read; safe to call on every
 * room/date/rate change.
 */
export async function quoteBookingAction(input: {
  propertyId: string;
  /** One room (back-compat) or several for a group booking (audit P1 #9). */
  roomId?: string;
  roomIds?: string[];
  checkIn: string;
  checkOut: string;
  /** When set, price at this flat nightly rate instead of the rate plans (staff override). */
  nightlyRateRupees?: number;
}): Promise<BookingQuote> {
  const empty: BookingQuote = {
    ok: false,
    nights: 0,
    nightlyRupees: 0,
    subtotalRupees: 0,
    taxRupees: 0,
    totalRupees: 0,
    taxLabel: "",
    appliedPlan: null,
    varies: false,
    maxOccupancy: 0,
    unavailableRoomIds: [],
  };
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "bookings:write", { propertyId: input.propertyId });

    const start = utcMidnight(input.checkIn);
    const end = utcMidnight(input.checkOut);
    const nights = nightsBetween(start, end);
    if (nights < 1) return { ...empty, message: "Check-out must be after check-in." };

    const roomIds = input.roomIds?.length ? input.roomIds : input.roomId ? [input.roomId] : [];
    const rooms = await prisma.room.findMany({
      where: { id: { in: roomIds }, propertyId: input.propertyId },
      include: { roomType: true, property: { select: { gstin: true } } },
    });

    // Rooms that clash with the requested window (occupied or under maintenance).
    const [occupied, blocks] = await Promise.all([
      prisma.bookingRoom.findMany({
        where: { date: { gte: start, lt: end }, room: { propertyId: input.propertyId } },
        select: { roomId: true },
      }),
      prisma.maintenanceBlock.findMany({
        where: { propertyId: input.propertyId, startDate: { lt: end }, endDate: { gt: start } },
        select: { roomId: true },
      }),
    ]);
    const unavailable = new Set<string>();
    for (const o of occupied) unavailable.add(o.roomId);
    for (const b of blocks) unavailable.add(b.roomId);
    const unavailableRoomIds = [...unavailable];

    if (rooms.length === 0) {
      return { ...empty, ok: true, nights, unavailableRoomIds };
    }

    const hasGstin = !!rooms[0].property.gstin;
    // A manual rate is a flat per-night figure applied to every room; otherwise derive
    // each room's per-night rate from its type's rate plans.
    const manualPaise =
      input.nightlyRateRupees != null && input.nightlyRateRupees > 0
        ? toPaise(input.nightlyRateRupees)
        : null;
    const plans = manualPaise != null ? [] : await loadRatePlansForQuote(input.propertyId);
    const nightDates = eachNight(start, end);
    const perNight: { rate: number; planName?: string | null }[] = [];
    for (const room of rooms) {
      if (manualPaise != null) {
        for (const _ of nightDates) perNight.push({ rate: manualPaise, planName: null });
      } else {
        const q = quoteStay(nightDates, room.roomTypeId, room.roomType.baseRate, plans);
        perNight.push(...q.perNight);
      }
    }
    const subtotal = perNight.reduce((s, n) => s + n.rate, 0);

    const tax = computeTax(
      perNight.map((n) => ({ nightlyRatePaise: n.rate, nights: 1 })),
      hasGstin,
    );
    const planNames = [...new Set(perNight.map((n) => n.planName).filter(Boolean))] as string[];
    const rates = new Set(perNight.map((n) => n.rate));
    const appliedPlan =
      manualPaise != null
        ? null
        : planNames.length === 0
          ? null
          : planNames.length === 1
            ? planNames[0]
            : "Mixed rate plans";
    const maxOccupancy = rooms.reduce((s, r) => s + r.roomType.maxOccupancy, 0);

    return {
      ok: true,
      nights,
      subtotalRupees: toRupees(subtotal),
      nightlyRupees: toRupees(Math.round(subtotal / nights)),
      taxRupees: toRupees(tax.taxAmountPaise),
      totalRupees: toRupees(tax.totalPaise),
      taxLabel: taxLabelFor(perNight, hasGstin),
      appliedPlan,
      varies: rates.size > 1,
      maxOccupancy,
      unavailableRoomIds,
    };
  } catch {
    return { ...empty, message: "Could not price this stay." };
  }
}

async function loadRatePlansForQuote(propertyId: string): Promise<RatePlanLike[]> {
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

export async function checkInAction(bookingId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { property: true },
  });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "bookings:write", { propertyId: b.propertyId });
  await checkInBooking(bookingId, ctx.ownerId, ctx.name);
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function checkOutAction(bookingId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "bookings:write", { propertyId: b.propertyId });
  await checkOutBooking(bookingId, ctx.ownerId, ctx.name);
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Confirm a tentative hold without taking payment — "confirm, collect later" (audit P1 #7). */
export async function confirmBookingAction(bookingId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "bookings:write", { propertyId: b.propertyId });
  try {
    await confirmBookingHold(bookingId, ctx.ownerId, ctx.name);
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Booking confirmed — collect payment later." };
  } catch (e) {
    if (e instanceof BookingValidationError) return { ok: false, message: e.message };
    return { ok: false, message: "Could not confirm the booking." };
  }
}

/** Mark a booking as a no-show (audit P1 #6). */
export async function noShowAction(bookingId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "bookings:write", { propertyId: b.propertyId });
  try {
    await markNoShow(bookingId, ctx.ownerId, ctx.name);
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath("/dashboard");
    revalidatePath("/calendar");
    return { ok: true, message: "Marked as no-show." };
  } catch (e) {
    if (e instanceof BookingValidationError) return { ok: false, message: e.message };
    return { ok: false, message: "Could not mark no-show." };
  }
}

export async function cancelAction(bookingId: string, reason: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "bookings:cancel", { propertyId: b.propertyId });
  await cancelBooking(bookingId, ctx.ownerId, reason, ctx.name);
  revalidatePath(`/bookings/${bookingId}`);
  revalidatePath("/calendar");
  return { ok: true };
}

export async function moveBookingAction(
  bookingId: string,
  input: { roomId?: string; checkIn?: string; checkOut?: string },
): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "bookings:write", { propertyId: b.propertyId });
  try {
    await moveBooking({
      bookingId,
      ownerId: ctx.ownerId,
      roomId: input.roomId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      actorName: ctx.name,
    });
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath("/calendar");
    return { ok: true, message: "Booking moved." };
  } catch (e) {
    if (e instanceof DoubleBookingError) {
      return { ok: false, message: "That room is already booked for one or more of those nights." };
    }
    if (e instanceof BookingValidationError) return { ok: false, message: e.message };
    return { ok: false, message: "Could not move the booking." };
  }
}

/** Add or edit the internal notes on an existing booking (audit P1 #4). */
export async function updateBookingNotesAction(
  bookingId: string,
  notes: string,
): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "bookings:write", { propertyId: b.propertyId });
  const trimmed = notes.trim();
  if (trimmed.length > 2000) return { ok: false, message: "Notes are too long (max 2000 chars)." };
  await prisma.booking.update({ where: { id: bookingId }, data: { notes: trimmed || null } });
  await writeAudit({
    ownerId: ctx.ownerId,
    actorType: "USER",
    actorName: ctx.name,
    action: "BOOKING_NOTE_UPDATED",
    entityType: "Booking",
    entityId: bookingId,
    summary: trimmed ? "updated booking notes" : "cleared booking notes",
  });
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true, message: "Notes saved." };
}

export async function sendPaymentLinkAction(bookingId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "payments:read", { propertyId: b.propertyId });
  if (!(await onlinePaymentsEnabled())) {
    return {
      ok: false,
      message: "Online payments are off. Add valid Razorpay keys, or record the payment manually.",
    };
  }
  try {
    const { shortUrl, mock } = await createPaymentLinkForBooking(bookingId, {
      actorName: ctx.name,
    });
    revalidatePath(`/bookings/${bookingId}`);
    return {
      ok: true,
      message: mock ? `Demo link created: ${shortUrl}` : `Link sent: ${shortUrl}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not create link" };
  }
}

export async function markPaidAction(bookingId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "payments:read", { propertyId: b.propertyId });
  const due = b.totalAmount - b.amountPaid;
  if (due > 0) await applyPayment(bookingId, due, { method: "cash" });
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true };
}

/**
 * Return (or forfeit) the security deposit held on a booking (audit P2 #18). Deposits
 * are typically cash-held, so this is a ledger entry — it lowers `depositHeld` and is
 * audited; no payment gateway is involved.
 */
export async function returnDepositAction(
  bookingId: string,
  opts: { forfeit?: boolean } = {},
): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "payments:read", { propertyId: b.propertyId });
  if (b.depositHeld <= 0) return { ok: false, message: "No deposit is being held." };
  const amount = b.depositHeld;
  await prisma.booking.update({ where: { id: bookingId }, data: { depositHeld: 0 } });
  await writeAudit({
    ownerId: ctx.ownerId,
    actorType: "USER",
    actorName: ctx.name,
    action: opts.forfeit ? "DEPOSIT_FORFEITED" : "DEPOSIT_RETURNED",
    entityType: "Booking",
    entityId: bookingId,
    summary: `${opts.forfeit ? "forfeited" : "returned"} deposit of ${inr(amount)}`,
  });
  revalidatePath(`/bookings/${bookingId}`);
  return {
    ok: true,
    message: `Deposit of ${inr(amount)} ${opts.forfeit ? "forfeited" : "returned"}.`,
  };
}

const PAYMENT_METHODS = ["cash", "upi", "bank", "card", "other"] as const;

/**
 * Manually record a (cash/UPI/bank) payment a manager has verified. This is the
 * cash-first confirmation path that flips a guest's "awaiting confirmation" status.
 */
export async function recordPaymentAction(
  bookingId: string,
  input: { amountRupees: number; method: string; reference?: string; isDeposit?: boolean },
): Promise<ActionResult> {
  const ctx = await requireContext();
  const b = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!b) return { ok: false, message: "Booking not found" };
  assertAccess(ctx, "payments:read", { propertyId: b.propertyId });

  const amount = toPaise(Number(input.amountRupees));
  if (!Number.isFinite(amount) || amount <= 0)
    return { ok: false, message: "Enter a valid amount." };
  // A deposit is held separately and isn't bounded by the room balance due.
  if (!input.isDeposit) {
    const due = b.totalAmount - b.amountPaid;
    if (amount > due) return { ok: false, message: `That's more than the ${inr(due)} still due.` };
  }

  const method = (PAYMENT_METHODS as readonly string[]).includes(input.method)
    ? input.method
    : "other";
  await applyPayment(bookingId, amount, { method, isDeposit: input.isDeposit });
  const kind = input.isDeposit ? "deposit" : "payment";
  await writeAudit({
    ownerId: ctx.ownerId,
    actorType: "USER",
    actorName: ctx.name,
    action: input.isDeposit ? "DEPOSIT_RECORDED" : "PAYMENT_RECORDED",
    entityType: "Booking",
    entityId: bookingId,
    summary: `recorded ${inr(amount)} ${kind} (${method}${input.reference ? ` · ${input.reference}` : ""})`,
  });
  revalidatePath(`/bookings/${bookingId}`);
  return { ok: true, message: `Recorded ${inr(amount)} ${kind} (${method}).` };
}
