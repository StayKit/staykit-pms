"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, type NotificationChannel } from "@prisma/client";
import { requireContext } from "../auth/context";
import { assertAccess } from "../rbac/policy";
import { prisma } from "../db";
import { sendNow } from "../notify/dispatch";
import { DEFAULT_TEMPLATES } from "../notify/defaults";
import { type ActionResult, ok, fail, failFrom } from "./result";

const templateSchema = z.object({
  channel: z.enum(["SMS", "EMAIL", "WHATSAPP"]),
  triggerKey: z.string().min(1, "Pick a trigger"),
  name: z.string().min(1, "Give the template a name"),
  subject: z.string().optional().or(z.literal("")),
  body: z.string().min(1, "The message body can't be empty"),
  dltTemplateId: z.string().optional().or(z.literal("")),
  whatsappTemplateName: z.string().optional().or(z.literal("")),
});

/** Create a new notification template (one per owner+channel+trigger). */
export async function createTemplateAction(
  input: z.input<typeof templateSchema>,
): Promise<ActionResult> {
  try {
    const data = templateSchema.parse(input);
    const ctx = await requireContext();
    assertAccess(ctx, "notifications:send");
    const created = await prisma.notificationTemplate.create({
      data: {
        ownerId: ctx.ownerId,
        channel: data.channel as NotificationChannel,
        triggerKey: data.triggerKey,
        name: data.name,
        subject: data.subject || null,
        body: data.body,
        dltTemplateId: data.dltTemplateId || null,
        whatsappTemplateName: data.whatsappTemplateName || null,
      },
    });
    revalidatePath("/notifications");
    revalidatePath("/settings/notifications");
    return ok({ id: created.id }, "Template created.");
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.errors[0].message);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("A template for that channel + trigger already exists. Edit that one instead.");
    }
    return failFrom(e, "Could not create the template.");
  }
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "notifications:send");
    const t = await prisma.notificationTemplate.findFirst({ where: { id, ownerId: ctx.ownerId } });
    if (!t) return fail("Template not found.");
    await prisma.notificationTemplate.delete({ where: { id } });
    revalidatePath("/notifications");
    revalidatePath("/settings/notifications");
    return ok(undefined, "Template deleted.");
  } catch (e) {
    return failFrom(e, "Could not delete the template.");
  }
}

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
  input: {
    name?: string;
    subject?: string;
    body: string;
    dltTemplateId?: string;
    whatsappTemplateName?: string;
  },
): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "notifications:send");
    const t = await prisma.notificationTemplate.findFirst({ where: { id, ownerId: ctx.ownerId } });
    if (!t) return fail("Template not found.");
    if (!input.body?.trim()) return fail("Template body can't be empty.");
    await prisma.notificationTemplate.update({
      where: { id },
      data: {
        name: input.name ?? t.name,
        subject: input.subject ?? t.subject,
        body: input.body,
        dltTemplateId: input.dltTemplateId ?? t.dltTemplateId,
        whatsappTemplateName: input.whatsappTemplateName ?? t.whatsappTemplateName,
      },
    });
    revalidatePath("/notifications");
    revalidatePath("/settings/notifications");
    return ok(undefined, "Template saved.");
  } catch (e) {
    return failFrom(e);
  }
}

/**
 * Manually send a template to the guest on a specific booking (audit P1 #5). Picks the
 * destination from the template's channel (email → guest email, SMS/WhatsApp → phone),
 * fills the scope from the booking, and logs it against the booking's Messages timeline.
 */
export async function sendBookingNotificationAction(
  bookingId: string,
  templateId: string,
): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "notifications:send");
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, property: { ownerId: ctx.ownerId } },
      include: {
        property: true,
        guests: { where: { isPrimary: true }, include: { guest: true } },
      },
    });
    if (!booking) return fail("Booking not found.");
    const template = await prisma.notificationTemplate.findFirst({
      where: { id: templateId, ownerId: ctx.ownerId },
    });
    if (!template) return fail("Template not found.");

    const guest = booking.guests[0]?.guest;
    if (!guest) return fail("This booking has no guest to message.");
    const to = template.channel === "EMAIL" ? guest.email : guest.phone;
    if (!to)
      return fail(
        template.channel === "EMAIL"
          ? "This guest has no email on file. Add one first."
          : "This guest has no mobile number on file.",
      );

    const due = booking.totalAmount - booking.amountPaid;
    await sendNow(
      templateId,
      to,
      {
        guest: { name: guest.name },
        booking: {
          ref: booking.ref,
          checkIn: booking.checkIn.toISOString(),
          checkOut: booking.checkOut.toISOString(),
        },
        property: { name: booking.property.name, checkInTime: booking.property.checkInTime },
        amount: { due, total: booking.totalAmount },
      },
      { bookingId },
    );
    revalidatePath(`/bookings/${bookingId}`);
    return ok(undefined, `${template.channel.toLowerCase()} sent to ${guest.name}.`);
  } catch (e) {
    return failFrom(e, "Could not send the message.");
  }
}

/** Re-send a previously sent message (audit P3 #18: "Resend" in the booking Messages tab). */
export async function resendNotificationAction(logId: string): Promise<ActionResult> {
  try {
    const ctx = await requireContext();
    assertAccess(ctx, "notifications:send");
    const log = await prisma.notificationLog.findUnique({ where: { id: logId } });
    if (!log?.templateId) return fail("This message can't be re-sent.");
    const template = await prisma.notificationTemplate.findFirst({
      where: { id: log.templateId, ownerId: ctx.ownerId },
    });
    if (!template) return fail("The template for this message no longer exists.");

    let scope: Record<string, unknown> = {};
    if (log.bookingId) {
      const booking = await prisma.booking.findFirst({
        where: { id: log.bookingId, property: { ownerId: ctx.ownerId } },
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
    if (log.bookingId) revalidatePath(`/bookings/${log.bookingId}`);
    revalidatePath("/notifications/log");
    return ok(undefined, `Re-sent to ${log.to}.`);
  } catch (e) {
    return failFrom(e, "Could not re-send the message.");
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
