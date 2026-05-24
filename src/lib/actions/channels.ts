"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "../auth/context";
import { assertAccess } from "../rbac/policy";
import { prisma } from "../db";
import { writeAudit } from "../audit";
import { type ActionResult, ok, fail, failFrom } from "./result";
import { slugify } from "./guards";

const channelSchema = z.object({
  name: z.string().min(1, "Channel name is required").max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour")
    .default("#3D5A80"),
});

export async function createChannelAction(
  input: z.input<typeof channelSchema>,
): Promise<ActionResult> {
  try {
    const data = channelSchema.parse(input);
    const ctx = await requireContext();
    assertAccess(ctx, "properties:write");
    const key = slugify(data.name);
    if (!key) return fail("That channel name has no usable letters.");
    const existing = await prisma.channelSource.findUnique({
      where: { ownerId_key: { ownerId: ctx.ownerId, key } },
    });
    if (existing) return fail("A channel with a similar name already exists.");
    const ch = await prisma.channelSource.create({
      data: { ownerId: ctx.ownerId, key, name: data.name, color: data.color },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "CHANNEL_CREATED",
      entityType: "ChannelSource",
      entityId: ch.id,
      summary: `added channel ${data.name}`,
    });
    revalidatePath("/channels");
    return ok({ id: ch.id });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e, "Could not add the channel.");
  }
}

export async function toggleChannelAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "properties:write");
    const ch = await prisma.channelSource.findFirst({ where: { id, ownerId: ctx.ownerId } });
    if (!ch) return fail("Channel not found.");
    await prisma.channelSource.update({ where: { id }, data: { active: !ch.active } });
    revalidatePath("/channels");
    return ok();
  } catch (e) {
    return failFrom(e);
  }
}

export async function updateChannelAction(
  id: string,
  input: z.input<typeof channelSchema>,
): Promise<ActionResult> {
  try {
    const data = channelSchema.parse(input);
    const ctx = await requireContext();
    assertAccess(ctx, "properties:write");
    const ch = await prisma.channelSource.findFirst({ where: { id, ownerId: ctx.ownerId } });
    if (!ch) return fail("Channel not found.");
    await prisma.channelSource.update({
      where: { id },
      data: { name: data.name, color: data.color },
    });
    revalidatePath("/channels");
    return ok();
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e);
  }
}
