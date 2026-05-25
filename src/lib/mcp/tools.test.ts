import { describe, it, expect, beforeEach } from "vitest";
import { TOOLS, TOOL_CATALOG, getTool, assertScope, ScopeError, type McpContext } from "./tools";
import { createBooking } from "../booking/engine";
import { applyPayment } from "../payments/service";
import { prisma } from "@/lib/db";
import { today, addDays, ymd } from "../dates";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

const ALL_SCOPES = [
  "bookings:read",
  "bookings:write",
  "bookings:cancel",
  "payments:read",
  "payments:write",
  "payments:refund",
  "properties:read",
  "properties:write",
  "rates:write",
  "guests:read",
  "guests:write",
  "team:manage",
  "notifications:read",
  "notifications:send",
  "compliance:read",
  "compliance:write",
  "reports:read",
  "mcp:admin",
];

let fx: Fixture;
function ctx(over: Partial<McpContext> = {}): McpContext {
  return {
    ownerId: fx.owner.id,
    userId: fx.user.id,
    name: "Owner",
    scopes: ALL_SCOPES,
    propertyScopes: [],
    ...over,
  };
}
function run(name: string, args: Record<string, unknown>, c: McpContext = ctx()) {
  return getTool(name)!.run(args, c);
}

beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
});

async function aBooking(over: Record<string, unknown> = {}) {
  return createBooking({
    ownerId: fx.owner.id,
    propertyId: fx.property.id,
    roomId: fx.room.id,
    channelKey: "direct",
    checkIn: today(),
    checkOut: addDays(today(), 2),
    guest: { name: "Sameer", phone: "+919812345678" },
    nightlyRatePaise: 6300_00,
    ...over,
  });
}

describe("catalog", () => {
  it("exposes a name/scope/requiresApproval entry per tool", () => {
    expect(TOOL_CATALOG.length).toBe(TOOLS.length);
    expect(TOOL_CATALOG.find((t) => t.name === "initiate_refund")?.requiresApproval).toBe(true);
    expect(getTool("nope")).toBeUndefined();
  });
});

describe("assertScope", () => {
  it("throws ScopeError when the required scope is absent", () => {
    expect(() => assertScope(ctx({ scopes: [] }), "bookings:read")).toThrow(ScopeError);
  });
});

describe("read tools", () => {
  it("list_properties returns the owner's properties", async () => {
    const r = (await run("list_properties", {})) as unknown[];
    expect(r).toHaveLength(1);
  });

  it("list_properties enforces its scope", async () => {
    await expect(run("list_properties", {}, ctx({ scopes: [] }))).rejects.toThrow(ScopeError);
  });

  it("get_property returns rooms + room types", async () => {
    const r = (await run("get_property", { propertyId: fx.property.id })) as { rooms: unknown[] };
    expect(r.rooms.length).toBe(1);
  });

  it("list_rooms lists rooms with their type", async () => {
    const r = (await run("list_rooms", { propertyId: fx.property.id })) as unknown[];
    expect(r).toHaveLength(1);
  });

  it("check_availability excludes occupied rooms and includes free ones", async () => {
    await aBooking(); // occupies room for today..+2
    const occupied = (await run("check_availability", {
      propertyId: fx.property.id,
      from: ymd(today()),
      to: ymd(addDays(today(), 1)),
    })) as unknown[];
    expect(occupied).toHaveLength(0);
    const free = (await run("check_availability", {
      propertyId: fx.property.id,
      from: ymd(addDays(today(), 5)),
      to: ymd(addDays(today(), 6)),
    })) as unknown[];
    expect(free).toHaveLength(1);
  });

  it("list_bookings filters by status", async () => {
    await aBooking();
    const r = (await run("list_bookings", { status: "CONFIRMED" })) as unknown[];
    expect(r.length).toBe(1);
    const none = (await run("list_bookings", {
      status: "CANCELLED",
      from: ymd(today()),
      to: ymd(addDays(today(), 30)),
    })) as unknown[];
    expect(none.length).toBe(0);
  });

  it("get_booking resolves by id and by ref", async () => {
    const b = await aBooking();
    expect((await run("get_booking", { idOrRef: b.id })) as { id: string }).toMatchObject({
      id: b.id,
    });
    expect((await run("get_booking", { idOrRef: b.ref })) as { ref: string }).toMatchObject({
      ref: b.ref,
    });
  });

  it("get_kpis returns occupancy metrics", async () => {
    await aBooking();
    const k = (await run("get_kpis", {})) as { roomNightsSold: number };
    expect(k.roomNightsSold).toBeGreaterThan(0);
  });

  it("search_guests redacts all but the last 4 digits of the phone", async () => {
    await aBooking();
    const r = (await run("search_guests", { query: "Sameer" })) as { phone: string }[];
    expect(r[0].phone).toMatch(/^x+5678$/);
  });
});

describe("write tools", () => {
  it("create_booking creates an MCP-attributed booking", async () => {
    const r = (await run("create_booking", {
      propertyId: fx.property.id,
      roomId: fx.room.id,
      checkIn: ymd(today()),
      checkOut: ymd(addDays(today(), 1)),
      channel: "direct",
      guestName: "AI Guest",
      guestPhone: "+919800001234",
    })) as { id: string; ref: string };
    const b = await prisma.booking.findUnique({ where: { id: r.id } });
    expect(b?.createdViaMcp).toBe(true);
    const audit = await prisma.auditLog.findFirst({ where: { entityId: r.id } });
    expect(audit?.actorType).toBe("MCP");
  });

  it("check_in then check_out transition the booking", async () => {
    const b = await aBooking();
    expect((await run("check_in", { bookingId: b.id })) as { status: string }).toMatchObject({
      status: "CHECKED_IN",
    });
    expect((await run("check_out", { bookingId: b.id })) as { status: string }).toMatchObject({
      status: "CHECKED_OUT",
    });
  });

  it("cancel_booking previews, then releases the booking on confirm", async () => {
    const b = await aBooking();
    const preview = (await run("cancel_booking", { bookingId: b.id, reason: "No-show" })) as {
      needsConfirmation: boolean;
    };
    expect(preview.needsConfirmation).toBe(true);
    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after?.status).toBe("CONFIRMED"); // preview did not mutate
    expect(
      (await run("cancel_booking", {
        bookingId: b.id,
        reason: "No-show",
        confirm: true,
      })) as { status: string },
    ).toMatchObject({ status: "CANCELLED" });
  });

  it("rejects acting on a booking outside the caller's workspace", async () => {
    const other = await seedBasic({ gstin: null });
    const foreign = await createBooking({
      ownerId: other.owner.id,
      propertyId: other.property.id,
      roomId: other.room.id,
      channelKey: "direct",
      checkIn: today(),
      checkOut: addDays(today(), 1),
      guest: { name: "X", phone: "+919800007777" },
      nightlyRatePaise: 100000,
    });
    await expect(run("cancel_booking", { bookingId: foreign.id, reason: "x" })).rejects.toThrow(
      ScopeError,
    );
  });

  it("get_payment_status reports the balance, and 404s for unknown bookings", async () => {
    const b = await aBooking();
    const s = (await run("get_payment_status", { bookingId: b.id })) as { due: number };
    expect(s.due).toBe(b.totalAmount);
    await expect(run("get_payment_status", { bookingId: "nope" })).rejects.toThrow(/not found/);
  });

  it("create_payment_link returns a (mock) link", async () => {
    const b = await aBooking();
    const r = (await run("create_payment_link", { bookingId: b.id })) as {
      mock: boolean;
      shortUrl: string;
    };
    expect(r.mock).toBe(true);
    expect(r.shortUrl).toContain("/pay/");
  });

  it("initiate_refund previews the policy, then processes on confirm", async () => {
    const b = await aBooking();
    await applyPayment(b.id, b.totalAmount, { method: "cash" });

    const first = (await run("initiate_refund", {
      bookingId: b.id,
      amountPaise: 1000_00,
    })) as { needsConfirmation: boolean; amountToRefundPaise: number };
    expect(first.needsConfirmation).toBe(true);
    expect(first.amountToRefundPaise).toBe(1000_00);

    const confirmed = (await run("initiate_refund", {
      bookingId: b.id,
      amountPaise: 1000_00,
      confirm: true,
    })) as { status: string; mock: boolean };
    expect(confirmed.status).toBe("PROCESSED");
    expect(confirmed.mock).toBe(true);
    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after?.amountPaid).toBe(b.totalAmount - 1000_00);
  });

  it("initiate_refund rejects a booking outside the workspace", async () => {
    await expect(run("initiate_refund", { bookingId: "missing", confirm: true })).rejects.toThrow(
      /workspace/,
    );
  });

  it("initiate_refund enforces the payments:refund scope", async () => {
    await expect(
      run(
        "initiate_refund",
        { bookingId: "b", amountPaise: 1 },
        ctx({ scopes: ["bookings:read"] }),
      ),
    ).rejects.toThrow(ScopeError);
  });
});

describe("inventory & ops tools", () => {
  it("modify_booking moves a booking and recomputes the total", async () => {
    const b = await aBooking({ checkIn: "2026-06-10", checkOut: "2026-06-12" });
    const r = (await run("modify_booking", {
      bookingId: b.id,
      checkIn: "2026-06-10",
      checkOut: "2026-06-13",
    })) as { total: number };
    expect(r.total).toBe(6300_00 * 3);
  });

  it("block_room then unblock_room", async () => {
    const blk = (await run("block_room", {
      propertyId: fx.property.id,
      roomId: fx.room.id,
      from: "2026-10-01",
      to: "2026-10-05",
      reason: "Repaint",
    })) as { id: string };
    expect(await prisma.maintenanceBlock.count()).toBe(1);
    const un = (await run("unblock_room", { blockId: blk.id })) as { ok: boolean };
    expect(un.ok).toBe(true);
    expect(await prisma.maintenanceBlock.count()).toBe(0);
  });

  it("block_room rejects overlap with a booking", async () => {
    await aBooking({ checkIn: "2026-11-01", checkOut: "2026-11-03" });
    await expect(
      run("block_room", {
        propertyId: fx.property.id,
        roomId: fx.room.id,
        from: "2026-11-01",
        to: "2026-11-03",
        reason: "x",
      }),
    ).rejects.toThrow(/overlap/);
  });

  it("list_rate_plans returns the property's plans (authoring is UI-only — no MCP write tool)", async () => {
    expect(getTool("upsert_rate_plan")).toBeUndefined();
    await prisma.ratePlan.create({
      data: {
        propertyId: fx.property.id,
        name: "Peak",
        priority: 9,
        startDate: new Date("2026-12-20"),
        endDate: new Date("2026-12-31"),
        overrides: { create: [{ roomTypeId: fx.roomType.id, amount: 9000_00 }] },
      },
    });
    const plans = (await run("list_rate_plans", { propertyId: fx.property.id })) as unknown[];
    expect(plans).toHaveLength(1);
  });

  it("send_notification queues messages for the booking's guest", async () => {
    const b = await aBooking();
    await prisma.notificationTemplate.create({
      data: {
        ownerId: fx.owner.id,
        channel: "SMS",
        triggerKey: "PRE_ARRIVAL_24H",
        name: "reminder",
        body: "see you {{guest.name}}",
      },
    });
    const r = (await run("send_notification", {
      bookingId: b.id,
      triggerKey: "PRE_ARRIVAL_24H",
    })) as { queued: number };
    expect(r.queued).toBe(1);
  });

  it("inventory tools enforce their scopes", async () => {
    await expect(
      run(
        "block_room",
        { propertyId: "p", roomId: "r", from: "a", to: "b", reason: "x" },
        ctx({ scopes: ["bookings:read"] }),
      ),
    ).rejects.toThrow(ScopeError);
  });
});

describe("new operational tools", () => {
  it("list_channels returns seeded channels with their keys", async () => {
    const r = (await run("list_channels", {})) as { key: string }[];
    expect(r.find((c) => c.key === "direct")).toBeTruthy();
  });

  it("quote_booking prices a free stay and flags an occupied one", async () => {
    const q = (await run("quote_booking", {
      propertyId: fx.property.id,
      roomId: fx.room.id,
      checkIn: "2026-07-01",
      checkOut: "2026-07-03",
    })) as { nights: number; available: boolean; totalPaise: number };
    expect(q.nights).toBe(2);
    expect(q.available).toBe(true);
    expect(q.totalPaise).toBe(6300_00 * 2); // gstin null → no GST

    await aBooking({ checkIn: "2026-07-01", checkOut: "2026-07-03" });
    const q2 = (await run("quote_booking", {
      propertyId: fx.property.id,
      roomId: fx.room.id,
      checkIn: "2026-07-01",
      checkOut: "2026-07-03",
    })) as { available: boolean };
    expect(q2.available).toBe(false);
  });

  it("record_payment applies a cash payment and rejects over-payment", async () => {
    const b = await aBooking();
    const r = (await run("record_payment", {
      bookingId: b.id,
      amountPaise: 1000_00,
      method: "cash",
    })) as { duePaise: number };
    expect(r.duePaise).toBe(b.totalAmount - 1000_00);
    await expect(
      run("record_payment", { bookingId: b.id, amountPaise: b.totalAmount }),
    ).rejects.toThrow(/still due/);
  });

  it("record_payment requires payments:write", async () => {
    const b = await aBooking();
    await expect(
      run(
        "record_payment",
        { bookingId: b.id, amountPaise: 100 },
        ctx({ scopes: ["payments:read"] }),
      ),
    ).rejects.toThrow(ScopeError);
  });

  it("update_booking_notes saves notes", async () => {
    const b = await aBooking();
    await run("update_booking_notes", { bookingId: b.id, notes: "early check-in" });
    expect((await prisma.booking.findUnique({ where: { id: b.id } }))?.notes).toBe(
      "early check-in",
    );
  });

  it("get_guest returns profile + history; update_guest edits it", async () => {
    await aBooking();
    const guest = await prisma.guest.findFirstOrThrow({ where: { ownerId: fx.owner.id } });
    const g = (await run("get_guest", { guestId: guest.id })) as { bookings: unknown[] };
    expect(g.bookings.length).toBe(1);
    await run("update_guest", { guestId: guest.id, email: "x@y.in", marketingConsent: true });
    const after = await prisma.guest.findUnique({ where: { id: guest.id } });
    expect(after?.email).toBe("x@y.in");
    expect(after?.marketingConsent).toBe(true);
    expect(after?.dpdpConsentAt).toBeTruthy();
  });

  it("set_room_status changes cleanliness and rejects bad values", async () => {
    const r = (await run("set_room_status", { roomId: fx.room.id, status: "dirty" })) as {
      cleanliness: string;
    };
    expect(r.cleanliness).toBe("DIRTY");
    expect((await prisma.room.findUnique({ where: { id: fx.room.id } }))?.cleanliness).toBe(
      "DIRTY",
    );
    await expect(run("set_room_status", { roomId: fx.room.id, status: "SHINY" })).rejects.toThrow();
  });

  it("list_maintenance_blocks returns created blocks", async () => {
    await run("block_room", {
      propertyId: fx.property.id,
      roomId: fx.room.id,
      from: "2027-01-01",
      to: "2027-01-05",
      reason: "Repaint",
    });
    expect(
      (await run("list_maintenance_blocks", { propertyId: fx.property.id })) as unknown[],
    ).toHaveLength(1);
  });

  it("Form C: lists a pending foreign guest, then marks it filed", async () => {
    const b = await aBooking({ guest: { name: "Tom", phone: "+14155550000", isForeign: true } });
    const pending = (await run("list_form_c_pending", {})) as { bookingId: string }[];
    expect(pending.find((p) => p.bookingId === b.id)).toBeTruthy();
    await run("mark_form_c_filed", { bookingId: b.id });
    expect((await run("list_form_c_pending", {})) as unknown[]).toHaveLength(0);
  });

  it("confirm_booking only promotes a tentative booking", async () => {
    const t = await aBooking({ status: "TENTATIVE" });
    expect((await run("confirm_booking", { bookingId: t.id })) as { status: string }).toMatchObject(
      {
        status: "CONFIRMED",
      },
    );
    await expect(run("confirm_booking", { bookingId: t.id })).rejects.toThrow(/tentative/);
  });

  it("mark_no_show releases the room nights", async () => {
    const b = await aBooking();
    await run("mark_no_show", { bookingId: b.id });
    const after = await prisma.booking.findUnique({
      where: { id: b.id },
      include: { rooms: true },
    });
    expect(after?.status).toBe("NO_SHOW");
    expect(after?.rooms.length).toBe(0);
  });

  it("source_mix breaks bookings down by channel", async () => {
    await aBooking();
    const mix = (await run("source_mix", {
      from: ymd(addDays(today(), -1)),
      to: ymd(addDays(today(), 2)),
    })) as { count: number }[];
    expect(mix[0].count).toBe(1);
  });

  it("search_guests filters to foreign nationals only", async () => {
    await aBooking(); // Sameer, domestic
    await aBooking({
      guest: { name: "Tom", phone: "+14155551111", isForeign: true },
      checkIn: addDays(today(), 5),
      checkOut: addDays(today(), 7),
    });
    const foreign = (await run("search_guests", { foreignOnly: true })) as { name: string }[];
    expect(foreign.length).toBe(1);
    expect(foreign[0].name).toBe("Tom");
  });

  it("erase_guest previews then deletes a guest with no billable bookings", async () => {
    const guest = await prisma.guest.create({
      data: { ownerId: fx.owner.id, name: "Walk", phone: "+919800009999" },
    });
    const preview = (await run("erase_guest", { guestId: guest.id })) as {
      needsConfirmation: boolean;
      willAnonymise: boolean;
    };
    expect(preview).toMatchObject({ needsConfirmation: true, willAnonymise: false });
    const done = (await run("erase_guest", { guestId: guest.id, confirm: true })) as {
      status: string;
    };
    expect(done.status).toBe("deleted");
    expect(await prisma.guest.findUnique({ where: { id: guest.id } })).toBeNull();
  });

  it("erase_guest anonymises a guest who has billable bookings", async () => {
    await aBooking();
    const guest = await prisma.guest.findFirstOrThrow({ where: { ownerId: fx.owner.id } });
    const done = (await run("erase_guest", { guestId: guest.id, confirm: true })) as {
      status: string;
    };
    expect(done.status).toBe("anonymised");
    expect((await prisma.guest.findUnique({ where: { id: guest.id } }))?.name).toBe("Erased guest");
  });

  it("resend_notification re-sends; list_notification_log masks the recipient", async () => {
    const b = await aBooking();
    const tpl = await prisma.notificationTemplate.create({
      data: {
        ownerId: fx.owner.id,
        channel: "SMS",
        triggerKey: "PRE_ARRIVAL_24H",
        name: "r",
        body: "hi {{guest.name}}",
      },
    });
    const log = await prisma.notificationLog.create({
      data: {
        bookingId: b.id,
        channel: "SMS",
        to: "+919812345678",
        templateId: tpl.id,
        triggerKey: "PRE_ARRIVAL_24H",
        status: "SENT",
        scheduledFor: new Date(),
      },
    });
    const r = (await run("resend_notification", { logId: log.id })) as { ok: boolean; to: string };
    expect(r.ok).toBe(true);
    expect(r.to).toMatch(/^x+5678$/);
    const logs = (await run("list_notification_log", { bookingId: b.id })) as { to: string }[];
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].to).toMatch(/\d{4}$/);
  });
});

describe("property scoping", () => {
  it("a property-scoped caller cannot reach another property", async () => {
    const b = await aBooking();
    const scoped = ctx({ propertyScopes: ["another-property-id"] });
    expect((await run("list_bookings", {}, scoped)) as unknown[]).toHaveLength(0);
    expect(await run("get_booking", { idOrRef: b.id }, scoped)).toBeNull();
    await expect(run("list_rooms", { propertyId: fx.property.id }, scoped)).rejects.toThrow(
      ScopeError,
    );
    await expect(run("check_in", { bookingId: b.id }, scoped)).rejects.toThrow(ScopeError);
  });

  it("a caller scoped to the real property still operates on it", async () => {
    const b = await aBooking();
    const scoped = ctx({ propertyScopes: [fx.property.id] });
    expect((await run("list_bookings", {}, scoped)) as unknown[]).toHaveLength(1);
    expect(
      (await run("check_in", { bookingId: b.id }, scoped)) as { status: string },
    ).toMatchObject({ status: "CHECKED_IN" });
  });
});
