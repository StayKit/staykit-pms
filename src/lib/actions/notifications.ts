"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "../auth/context";
import { assertAccess } from "../rbac/policy";
import { prisma } from "../db";
import { sendNow } from "../notify/dispatch";
import { DEFAULT_TEMPLATES } from "../notify/defaults";
import { type ActionResult, ok, fail, failFrom } from "./result";

/** Seed the default template set (idempotent — skips trigger/channel pairs that exist). */
export async function seedDefaultTemplatesAction(): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "notifications:send");
    let created = 0;
    for (const t of DEFAULT_TEMPLATES) {
      const existing = await prisma.notificationTemplate.findUnique({
        where: {
          ownerId_channel_triggerKey: {
            ownerId: ctx.ownerId,
            channel: t.channel,
            triggerKey: t.triggerKey,
          },
        },
      });
      if (existing) continue;
      await prisma.notificationTemplate.create({
        data: {
          ownerId: ctx.ownerId,
          channel: t.channel,
          triggerKey: t.triggerKey,
          name: t.name,
          subject: t.subject ?? null,
          body: t.body,
        },
      });
      created += 1;
    }
    revalidatePath("/notifications");
    revalidatePath("/settings/notifications");
    revalidatePath("/onboarding");
    return ok({ created }, created ? `Added ${created} templates.` : "Templates already set up.");
  } catch (e) {
    return failFrom(e, "Could not seed templates.");
  }
}

export async function toggleTemplateAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "notifications:send");
    const t = await prisma.notificationTemplate.findFirst({ where: { id, ownerId: ctx.ownerId } });
    if (!t) return fail("Template not found.");
    await prisma.notificationTemplate.update({ where: { id }, data: { active: !t.active } });
    revalidatePath("/notifications");
    revalidatePath("/settings/notifications");
    return ok();
  } catch (e) {
    return failFrom(e);
  }
}

export async function updateTemplateAction(
  id: string,
  input: { name?: string; subject?: string; body: string },
): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "notifications:send");
    const t = await prisma.notificationTemplate.findFirst({ where: { id, ownerId: ctx.ownerId } });
    if (!t) return fail("Template not found.");
    if (!input.body?.trim()) return fail("Template body can't be empty.");
    await prisma.notificationTemplate.update({
      where: { id },
      data: { name: input.name ?? t.name, subject: input.subject ?? t.subject, body: input.body },
    });
    revalidatePath("/notifications");
    return ok();
  } catch (e) {
    return failFrom(e);
  }
}

/** Send a test message for a template to a phone/email (J: "Send test" button). */
export async function sendTestAction(templateId: string, to: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "notifications:send");
    const t = await prisma.notificationTemplate.findFirst({
      where: { id: templateId, ownerId: ctx.ownerId },
    });
    if (!t) return fail("Template not found.");
    if (!to.trim()) return fail("Enter a phone number or email to test.");
    await sendNow(templateId, to, {
      guest: { name: "Test Guest" },
      booking: { ref: "SK-TEST1" },
      property: { name: "Your Homestay", checkInTime: "14:00" },
      amount: { due: 250000, total: 250000 },
      paymentLink: { url: "https://example.com/pay/test" },
    });
    return ok(undefined, `Test ${t.channel.toLowerCase()} sent to ${to}.`);
  } catch (e) {
    return failFrom(e, "Could not send the test.");
  }
}
