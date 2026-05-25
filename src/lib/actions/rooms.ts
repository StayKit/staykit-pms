"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "../auth/context";
import { prisma } from "../db";
import { toPaise } from "../money";
import { writeAudit } from "../audit";
import { type ActionResult, ok, fail, failFrom } from "./result";
import { assertOwnedProperty } from "./guards";

const CLEANLINESS = ["CLEAN", "DIRTY", "IN_PROGRESS", "OUT_OF_ORDER"] as const;

const roomTypeSchema = z.object({
  name: z.string().min(1, "Type name is required"),
  baseRateRupees: z.coerce.number().min(0, "Base rate must be ≥ 0"),
  maxOccupancy: z.coerce.number().int().min(1).default(2),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#3D5A80"),
  description: z.string().optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().default(0),
});

const roomSchema = z.object({
  name: z.string().min(1, "Room name is required"),
  number: z.string().optional().or(z.literal("")),
  roomTypeId: z.string().min(1, "Pick a room type"),
  amenities: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});

function revalidateInventory(propertyId: string) {
  revalidatePath(`/properties/${propertyId}/rooms`);
  revalidatePath("/calendar");
}

export async function createRoomTypeAction(
  propertyId: string,
  input: z.input<typeof roomTypeSchema>,
): Promise<ActionResult> {
  try {
    const data = roomTypeSchema.parse(input);
    const ctx = await requireContext();
    await assertOwnedProperty(ctx, propertyId, "properties:write");
    const rt = await prisma.roomType.create({
      data: {
        propertyId,
        name: data.name,
        baseRate: toPaise(data.baseRateRupees),
        maxOccupancy: data.maxOccupancy,
        color: data.color,
        description: data.description || null,
        sortOrder: data.sortOrder,
      },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "ROOM_TYPE_CREATED",
      entityType: "RoomType",
      entityId: rt.id,
      summary: `added room type ${data.name}`,
    });
    revalidateInventory(propertyId);
    return ok({ id: rt.id });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e, "Could not add the room type.");
  }
}

export async function updateRoomTypeAction(
  id: string,
  input: z.input<typeof roomTypeSchema>,
): Promise<ActionResult> {
  try {
    const data = roomTypeSchema.parse(input);
    const ctx = await requireContext();
    const rt = await prisma.roomType.findFirst({
      where: { id, property: { ownerId: ctx.ownerId } },
    });
    if (!rt) return fail("Room type not found.");
    await assertOwnedProperty(ctx, rt.propertyId, "properties:write");
    await prisma.roomType.update({
      where: { id },
      data: {
        name: data.name,
        baseRate: toPaise(data.baseRateRupees),
        maxOccupancy: data.maxOccupancy,
        color: data.color,
        description: data.description || null,
        sortOrder: data.sortOrder,
      },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "ROOM_TYPE_UPDATED",
      entityType: "RoomType",
      entityId: id,
      summary: `edited room type ${data.name}`,
    });
    revalidateInventory(rt.propertyId);
    return ok();
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e);
  }
}

export async function deleteRoomTypeAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    const rt = await prisma.roomType.findFirst({
      where: { id, property: { ownerId: ctx.ownerId } },
      include: { _count: { select: { rooms: true } } },
    });
    if (!rt) return fail("Room type not found.");
    await assertOwnedProperty(ctx, rt.propertyId, "properties:write");
    if (rt._count.rooms > 0) return fail("Remove the rooms of this type first.");
    await prisma.roomType.delete({ where: { id } });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "ROOM_TYPE_DELETED",
      entityType: "RoomType",
      entityId: id,
      summary: `deleted room type ${rt.name}`,
    });
    revalidateInventory(rt.propertyId);
    return ok();
  } catch (e) {
    return failFrom(e);
  }
}

export async function createRoomAction(
  propertyId: string,
  input: z.input<typeof roomSchema>,
): Promise<ActionResult> {
  try {
    const data = roomSchema.parse(input);
    const ctx = await requireContext();
    await assertOwnedProperty(ctx, propertyId, "properties:write");
    const type = await prisma.roomType.findFirst({
      where: { id: data.roomTypeId, propertyId },
    });
    if (!type) return fail("That room type doesn't belong to this property.");
    const dupe = await prisma.room.findUnique({
      where: { propertyId_name: { propertyId, name: data.name } },
    });
    if (dupe) return fail(`A room named "${data.name}" already exists.`);
    const room = await prisma.room.create({
      data: {
        propertyId,
        roomTypeId: data.roomTypeId,
        name: data.name,
        number: data.number || "",
        amenities: JSON.stringify(data.amenities),
        active: data.active,
      },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "ROOM_CREATED",
      entityType: "Room",
      entityId: room.id,
      summary: `added room ${data.name}`,
    });
    revalidateInventory(propertyId);
    return ok({ id: room.id });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e, "Could not add the room.");
  }
}

export async function updateRoomAction(
  id: string,
  input: z.input<typeof roomSchema>,
): Promise<ActionResult> {
  try {
    const data = roomSchema.parse(input);
    const ctx = await requireContext();
    const room = await prisma.room.findFirst({
      where: { id, property: { ownerId: ctx.ownerId } },
    });
    if (!room) return fail("Room not found.");
    await assertOwnedProperty(ctx, room.propertyId, "properties:write");
    await prisma.room.update({
      where: { id },
      data: {
        name: data.name,
        number: data.number || "",
        roomTypeId: data.roomTypeId,
        amenities: JSON.stringify(data.amenities),
        active: data.active,
      },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "ROOM_UPDATED",
      entityType: "Room",
      entityId: id,
      summary: `edited room ${data.name}`,
    });
    revalidateInventory(room.propertyId);
    return ok();
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e);
  }
}

export async function setCleanlinessAction(
  roomId: string,
  value: (typeof CLEANLINESS)[number],
): Promise<ActionResult> {
  try {
    if (!CLEANLINESS.includes(value)) return fail("Invalid cleanliness value.");
    const ctx = await requireContext();
    const room = await prisma.room.findFirst({
      where: { id: roomId, property: { ownerId: ctx.ownerId } },
    });
    if (!room) return fail("Room not found.");
    // Front-desk can change cleanliness with bookings:write (operate the day).
    // Record who cleaned it and when (audit P2 #22) so the housekeeping board has accountability.
    await prisma.room.update({
      where: { id: roomId },
      data: {
        cleanliness: value,
        ...(value === "CLEAN" ? { cleanedAt: new Date(), cleanedById: ctx.userId } : {}),
      },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "ROOM_CLEANLINESS_SET",
      entityType: "Room",
      entityId: roomId,
      summary: `set ${room.name} to ${value.toLowerCase().replace("_", " ")}`,
    });
    revalidateInventory(room.propertyId);
    return ok();
  } catch (e) {
    return failFrom(e);
  }
}

/** Assign (or clear) the housekeeper responsible for turning a room (audit P2 #22). */
export async function assignHousekeeperAction(
  roomId: string,
  userId: string | null,
): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    const room = await prisma.room.findFirst({
      where: { id: roomId, property: { ownerId: ctx.ownerId } },
    });
    if (!room) return fail("Room not found.");
    let assignee: { id: string; name: string } | null = null;
    if (userId) {
      assignee = await prisma.user.findFirst({
        where: { id: userId, ownerId: ctx.ownerId },
        select: { id: true, name: true },
      });
      if (!assignee) return fail("That team member doesn't belong to you.");
    }
    await prisma.room.update({
      where: { id: roomId },
      data: { housekeeperId: assignee?.id ?? null },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "HOUSEKEEPER_ASSIGNED",
      entityType: "Room",
      entityId: roomId,
      summary: assignee
        ? `assigned ${assignee.name} to clean ${room.name}`
        : `cleared housekeeper on ${room.name}`,
    });
    revalidateInventory(room.propertyId);
    revalidatePath("/housekeeping");
    return ok();
  } catch (e) {
    return failFrom(e);
  }
}

export async function deleteRoomAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    const room = await prisma.room.findFirst({
      where: { id, property: { ownerId: ctx.ownerId } },
      include: { _count: { select: { bookings: true } } },
    });
    if (!room) return fail("Room not found.");
    await assertOwnedProperty(ctx, room.propertyId, "properties:write");
    if (room._count.bookings > 0) {
      return fail("This room has bookings — set it inactive instead of deleting.");
    }
    await prisma.room.delete({ where: { id } });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "ROOM_DELETED",
      entityType: "Room",
      entityId: id,
      summary: `deleted room ${room.name}`,
    });
    revalidateInventory(room.propertyId);
    return ok();
  } catch (e) {
    return failFrom(e);
  }
}
