"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContext } from "../auth/context";
import { prisma } from "../db";
import { writeAudit } from "../audit";
import { type ActionResult, ok, fail, failFrom } from "./result";

const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("That doesn't look like a valid email").optional().or(z.literal("")),
  phone: z.string().min(5, "A valid mobile number is required"),
});

/**
 * Update the workspace owner's profile (name / email / contact mobile). OWNER-only;
 * enforces the cross-workspace uniqueness of phone (and email when set) with friendly
 * messages instead of leaking a Prisma constraint error.
 */
export async function updateAccountAction(
  input: z.input<typeof accountSchema>,
): Promise<ActionResult> {
  try {
    const data = accountSchema.parse(input);
    const ctx = await requireContext();
    if (ctx.role !== "OWNER") {
      return fail("Only the workspace owner can edit these details.");
    }

    const phoneClash = await prisma.owner.findFirst({
      where: { phone: data.phone, NOT: { id: ctx.ownerId } },
      select: { id: true },
    });
    if (phoneClash) return fail("Another workspace already uses that mobile number.");

    if (data.email) {
      const emailClash = await prisma.owner.findFirst({
        where: { email: data.email, NOT: { id: ctx.ownerId } },
        select: { id: true },
      });
      if (emailClash) return fail("Another workspace already uses that email.");
    }

    await prisma.owner.update({
      where: { id: ctx.ownerId },
      data: { name: data.name, email: data.email || null, phone: data.phone },
    });
    await writeAudit({
      ownerId: ctx.ownerId,
      actorType: "USER",
      actorName: ctx.name,
      action: "ACCOUNT_UPDATED",
      entityType: "Owner",
      entityId: ctx.ownerId,
      summary: "updated workspace profile",
    });
    revalidatePath("/settings/account");
    return ok(undefined, "Saved.");
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    return failFrom(e, "Could not update your account.");
  }
}
