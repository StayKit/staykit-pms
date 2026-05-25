"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "../auth/context";
import { prisma } from "../db";
import { toPaise } from "../money";
import { parseYmd } from "../dates";
import { writeAudit } from "../audit";
import { type ActionResult, ok, fail, failFrom } from "./result";
import { assertOwnedProperty } from "./guards";

const ratePlanSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  priority: z.coerce.number().int().default(0),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  daysOfWeek: z
    .string()
    .regex(/^[01]{7}$/, "Days mask must be 7 bits")
    .default("1111111"),
  minStay: z.coerce.number().int().min(1).default(1),
  maxStay: z.coerce.number().int().min(1).optional(),
  refundable: z.boolean().default(true),
  overrides: z
    .array(z.object({ roomTypeId: z.string(), amountRupees: z.coerce.number().min(0) }))
    .default([]),
});

export async function createRatePlanAction(
  propertyId: string,
  input: z.input<typeof ratePlanSchema>,
): Promise<ActionResult> {
  try {
    const data = ratePlanSchema.parse(input);
    const ctx = await requireContext();
    await assertOwnedProperty(ctx, propertyId, "rates:write");
    const start = parseYmd(data.startDate);
    const end = parseYmd(data.endDate);
    if (end < start) return fail("End date must be on or after the start date.");

    const plan = await prisma.ratePlan.create({
      data: {
        propertyId,
        name: data.name,
        priority: data.priority,
        startDate: start,
        endDate: end,
        daysOfWeek: data.daysOfWeek,
        minStay: data.minStay,
        maxStay: data.maxStay ?? null,
        refundable: data.refundable,
        overrides: {
          create: data.overrides.map((o) => ({
            roomTypeId: o.roomTypeId,
            amount: toPaise(o.amountRupees),
          })),
        },
      },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "RATE_PLAN_CREATED",
      entityType: "RatePlan",
      entityId: plan.id,
      summary: `created rate plan ${data.name}`,
    });
    revalidatePath(`/properties/${propertyId}/rate-plans`);
    return ok({ id: plan.id });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e, "Could not create the rate plan.");
  }
}

export async function deleteRatePlanAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    const plan = await prisma.ratePlan.findFirst({
      where: { id, property: { ownerId: ctx.ownerId } },
    });
    if (!plan) return fail("Rate plan not found.");
    await assertOwnedProperty(ctx, plan.propertyId, "rates:write");
    await prisma.ratePlan.delete({ where: { id } });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "RATE_PLAN_DELETED",
      entityType: "RatePlan",
      entityId: id,
      summary: `deleted rate plan ${plan.name}`,
    });
    revalidatePath(`/properties/${plan.propertyId}/rate-plans`);
    return ok();
  } catch (e) {
    return failFrom(e);
  }
}

const blockSchema = z.object({
  roomId: z.string().min(1, "Pick a room"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  reason: z.string().min(1, "Give a reason"),
});

export async function createMaintenanceBlockAction(
  propertyId: string,
  input: z.input<typeof blockSchema>,
): Promise<ActionResult> {
  try {
    const data = blockSchema.parse(input);
    const ctx = await requireContext();
    await assertOwnedProperty(ctx, propertyId, "properties:write");
    const room = await prisma.room.findFirst({ where: { id: data.roomId, propertyId } });
    if (!room) return fail("That room doesn't belong to this property.");

    const start = parseYmd(data.startDate);
    const end = parseYmd(data.endDate);
    if (end <= start) return fail("End date must be after the start date.");

    // The block cannot overlap any occupied night for this room.
    const clash = await prisma.bookingRoom.findFirst({
      where: { roomId: data.roomId, date: { gte: start, lt: end } },
    });
    if (clash) return fail("Those dates overlap an existing booking for this room.");

    const block = await prisma.maintenanceBlock.create({
      data: {
        propertyId,
        roomId: data.roomId,
        startDate: start,
        endDate: end,
        reason: data.reason,
        createdById: ctx.userId,
      },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "ROOM_BLOCKED",
      entityType: "MaintenanceBlock",
      entityId: block.id,
      summary: `blocked ${room.name} (${data.reason})`,
    });
    revalidatePath(`/properties/${propertyId}/maintenance`);
    revalidatePath("/calendar");
    return ok({ id: block.id });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e, "Could not create the block.");
  }
}

export async function deleteMaintenanceBlockAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    const block = await prisma.maintenanceBlock.findFirst({
      where: { id, property: { ownerId: ctx.ownerId } },
    });
    if (!block) return fail("Block not found.");
    await assertOwnedProperty(ctx, block.propertyId, "properties:write");
    await prisma.maintenanceBlock.delete({ where: { id } });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "ROOM_UNBLOCKED",
      entityType: "MaintenanceBlock",
      entityId: id,
      summary: `removed a maintenance block (${block.reason})`,
    });
    revalidatePath(`/properties/${block.propertyId}/maintenance`);
    revalidatePath("/calendar");
    return ok();
  } catch (e) {
    return failFrom(e);
  }
}
