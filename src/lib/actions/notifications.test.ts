import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireContext: vi.fn() }));

import { requireContext } from "@/lib/auth/context";
import {
  seedDefaultTemplatesAction,
  toggleTemplateAction,
  updateTemplateAction,
  sendTestAction,
  sendBookingNotificationAction,
  createTemplateAction,
  deleteTemplateAction,
  resendNotificationAction,
} from "./notifications";
import { DEFAULT_TEMPLATES } from "../notify/defaults";
import { prisma } from "@/lib/db";
import { today, addDays } from "../dates";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

async function makeBooking(opts: { email?: string | null } = {}) {
  const guest = await prisma.guest.create({
    data: {
      ownerId: fx.owner.id,
      name: "Asha",
      phone: `+91980001${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`,
      email: opts.email === undefined ? "asha@test.in" : opts.email,
    },
  });
  const channel = await prisma.channelSource.findFirst({
    where: { ownerId: fx.owner.id, key: "direct" },
  });
  const booking = await prisma.booking.create({
    data: {
      ref: "SK-" + Math.random().toString(36).slice(2, 7).toUpperCase(),
      propertyId: fx.property.id,
      channelId: channel!.id,
      checkIn: today(),
      checkOut: addDays(today(), 2),
      subtotal: 12600_00,
      taxAmount: 0,
      totalAmount: 12600_00,
      guests: { create: { guestId: guest.id, isPrimary: true } },
    },
  });
  return { booking, guest };
}

const mockCtx = requireContext as unknown as Mock;
let fx: Fixture;

beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
  mockCtx.mockResolvedValue({
    ownerId: fx.owner.id,
    userId: fx.user.id,
    role: "OWNER",
    name: "Priya",
    propertyScopes: [],
    demo: true,
  });
});

describe("seedDefaultTemplatesAction", () => {
  it("creates the default template set, idempotently", async () => {
    const first = await seedDefaultTemplatesAction();
    expect(first.ok).toBe(true);
    expect((first.data as { created: number }).created).toBe(DEFAULT_TEMPLATES.length);
    const second = await seedDefaultTemplatesAction();
    expect((second.data as { created: number }).created).toBe(0);
    expect(await prisma.notificationTemplate.count()).toBe(DEFAULT_TEMPLATES.length);
  });
});

describe("template editing", () => {
  it("toggles and updates a template", async () => {
    await seedDefaultTemplatesAction();
    const t = await prisma.notificationTemplate.findFirst({ where: { ownerId: fx.owner.id } });
    await toggleTemplateAction(t!.id);
    expect((await prisma.notificationTemplate.findUnique({ where: { id: t!.id } }))?.active).toBe(
      false,
    );
    const upd = await updateTemplateAction(t!.id, { body: "New body {{guest.name}}" });
    expect(upd.ok).toBe(true);
    const empty = await updateTemplateAction(t!.id, { body: "  " });
    expect(empty.ok).toBe(false);
  });
});

describe("sendTestAction", () => {
  it("sends a test message and logs it", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await seedDefaultTemplatesAction();
    const t = await prisma.notificationTemplate.findFirst({ where: { channel: "SMS" } });
    const res = await sendTestAction(t!.id, "+919812300000");
    expect(res.ok).toBe(true);
    const log = await prisma.notificationLog.findFirst({ where: { templateId: t!.id } });
    expect(log?.status).toBe("SENT");
    spy.mockRestore();
  });

  it("rejects an empty recipient", async () => {
    await seedDefaultTemplatesAction();
    const t = await prisma.notificationTemplate.findFirst();
    expect((await sendTestAction(t!.id, "")).ok).toBe(false);
  });
});

describe("template CRUD", () => {
  it("creates a template and rejects a duplicate channel+trigger", async () => {
    const res = await createTemplateAction({
      channel: "SMS",
      triggerKey: "BOOKING_CONFIRMED",
      name: "Confirmed (SMS)",
      body: "Hi {{guest.name}}",
    });
    expect(res.ok).toBe(true);
    const dup = await createTemplateAction({
      channel: "SMS",
      triggerKey: "BOOKING_CONFIRMED",
      name: "Another",
      body: "x",
    });
    expect(dup.ok).toBe(false);
    expect(dup.message).toMatch(/already exists/i);
  });

  it("deletes a template", async () => {
    const created = await createTemplateAction({
      channel: "EMAIL",
      triggerKey: "POST_CHECKOUT_THANKS",
      name: "Thanks",
      subject: "Thanks",
      body: "Bye {{guest.name}}",
    });
    const id = (created.data as { id: string }).id;
    const del = await deleteTemplateAction(id);
    expect(del.ok).toBe(true);
    expect(await prisma.notificationTemplate.findUnique({ where: { id } })).toBeNull();
  });
});

describe("resendNotificationAction", () => {
  it("re-sends a logged message and logs the resend", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await seedDefaultTemplatesAction();
    const { booking } = await makeBooking();
    const t = await prisma.notificationTemplate.findFirst({ where: { channel: "SMS" } });
    await sendBookingNotificationAction(booking.id, t!.id);
    const first = await prisma.notificationLog.findFirst({ where: { bookingId: booking.id } });
    const res = await resendNotificationAction(first!.id);
    expect(res.ok).toBe(true);
    const count = await prisma.notificationLog.count({ where: { bookingId: booking.id } });
    expect(count).toBe(2);
    spy.mockRestore();
  });
});

describe("sendBookingNotificationAction", () => {
  it("sends an SMS template to the booking's guest and logs it against the booking", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await seedDefaultTemplatesAction();
    const { booking } = await makeBooking();
    const t = await prisma.notificationTemplate.findFirst({ where: { channel: "SMS" } });
    const res = await sendBookingNotificationAction(booking.id, t!.id);
    expect(res.ok).toBe(true);
    const log = await prisma.notificationLog.findFirst({ where: { bookingId: booking.id } });
    expect(log?.status).toBe("SENT");
    expect(log?.bookingId).toBe(booking.id);
    spy.mockRestore();
  });

  it("refuses an email template when the guest has no email", async () => {
    await seedDefaultTemplatesAction();
    const { booking } = await makeBooking({ email: null });
    const t = await prisma.notificationTemplate.findFirst({ where: { channel: "EMAIL" } });
    const res = await sendBookingNotificationAction(booking.id, t!.id);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/email/i);
  });
});
