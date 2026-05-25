"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "../auth/context";
import { assertAccess, permissionsForRole, type Role } from "../rbac/policy";
import { prisma } from "../db";
import { writeAudit } from "../audit";
import { type ActionResult, ok, fail, failFrom } from "./result";

const ROLES: Role[] = ["OWNER", "MANAGER", "STAFF"];

const userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(5, "A valid mobile number is required"),
  email: z.string().email().optional().or(z.literal("")),
  role: z.enum(["OWNER", "MANAGER", "STAFF"]),
  propertyIds: z.array(z.string()).default([]),
});

async function syncScopes(userId: string, role: Role, propertyIds: string[], ownerId: string) {
  await prisma.propertyScope.deleteMany({ where: { userId } });
  if (propertyIds.length === 0) return;
  // Only assign scopes for properties the owner actually owns.
  const owned = await prisma.property.findMany({
    where: { id: { in: propertyIds }, ownerId },
    select: { id: true },
  });
  const perms = permissionsForRole(role).join(",");
  await prisma.propertyScope.createMany({
    data: owned.map((p) => ({ userId, propertyId: p.id, permissions: perms })),
  });
}

export async function createTeamMemberAction(
  input: z.input<typeof userSchema>,
): Promise<ActionResult> {
  try {
    const data = userSchema.parse(input);
    const ctx = await requireContext();
    assertAccess(ctx, "team:manage");
    const dupe = await prisma.user.findUnique({ where: { phone: data.phone } });
    if (dupe) return fail("A user with that mobile number already exists.");
    const user = await prisma.user.create({
      data: {
        ownerId: ctx.ownerId,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        role: data.role,
      },
    });
    await syncScopes(user.id, data.role, data.propertyIds, ctx.ownerId);
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "TEAM_MEMBER_ADDED",
      entityType: "User",
      entityId: user.id,
      summary: `added ${data.name} as ${data.role}`,
    });
    revalidatePath("/settings/team");
    return ok({ id: user.id });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e, "Could not add the team member.");
  }
}

export async function updateTeamMemberAction(
  userId: string,
  input: { role: Role; propertyIds: string[] },
): Promise<ActionResult> {
  try {
    if (!ROLES.includes(input.role)) return fail("Invalid role.");
    const ctx = await requireContext();
    assertAccess(ctx, "team:manage");
    const user = await prisma.user.findFirst({ where: { id: userId, ownerId: ctx.ownerId } });
    if (!user) return fail("Team member not found.");
    await prisma.user.update({ where: { id: userId }, data: { role: input.role } });
    await syncScopes(userId, input.role, input.propertyIds, ctx.ownerId);
    revalidatePath("/settings/team");
    return ok();
  } catch (e) {
    return failFrom(e);
  }
}

export async function toggleTeamMemberActiveAction(userId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "team:manage");
    const user = await prisma.user.findFirst({ where: { id: userId, ownerId: ctx.ownerId } });
    if (!user) return fail("Team member not found.");
    if (user.id === ctx.userId) return fail("You can't deactivate your own account.");
    await prisma.user.update({ where: { id: userId }, data: { active: !user.active } });
    revalidatePath("/settings/team");
    return ok();
  } catch (e) {
    return failFrom(e);
  }
}
