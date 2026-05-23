import { describe, it, expect, beforeEach } from "vitest";
import { TOOLS, TOOL_CATALOG, getTool, assertScope, ScopeError, type McpContext } from "./tools";
import { createBooking } from "../booking/engine";
import { prisma } from "@/lib/db";
import { today, addDays, ymd } from "../dates";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

const ALL_SCOPES = [
  "bookings:read", "bookings:write", "bookings:cancel",
  "payments:read", "payments:refund",
  "properties:read", "properties:write", "rates:write",
  "team:manage", "notifications:send", "reports:read", "mcp:admin",
];

let fx: Fixture;
function ctx(over: Partial<McpContext> = {}): McpContext {
  return { ownerId: fx.owner.id, userId: fx.user.id, name: "Owner", scopes: ALL_SCOPES, propertyScopes: [], ...over };
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
    ownerId: fx.owner.id, propertyId: fx.property.id, roomId: fx.room.id, channelKey: "direct",
    checkIn: today(), checkOut: addDays(today(), 2),
    guest: { name: "Sameer", phone: "+919812345678" }, nightlyRatePaise: 6300_00, ...over,
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
      propertyId: fx.property.id, from: ymd(today()), to: ymd(addDays(today(), 1)),
    })) as unknown[];
    expect(occupied).toHaveLength(0);
    const free = (await run("check_availability", {
      propertyId: fx.property.id, from: ymd(addDays(today(), 5)), to: ymd(addDays(today(), 6)),
    })) as unknown[];
    expect(free).toHaveLength(1);
  });

  it("list_bookings filters by status", async () => {
    await aBooking();
    const r = (await run("list_bookings", { status: "CONFIRMED" })) as unknown[];
    expect(r.length).toBe(1);
    const none = (await run("list_bookings", { status: "CANCELLED", from: ymd(today()), to: ymd(addDays(today(), 30)) })) as unknown[];
    expect(none.length).toBe(0);
  });

  it("get_booking resolves by id and by ref", async () => {
    const b = await aBooking();
    expect((await run("get_booking", { idOrRef: b.id })) as { id: string }).toMatchObject({ id: b.id });
    expect((await run("get_booking", { idOrRef: b.ref })) as { ref: string }).toMatchObject({ ref: b.ref });
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
      propertyId: fx.property.id, roomId: fx.room.id,
      checkIn: ymd(today()), checkOut: ymd(addDays(today(), 1)),
      channel: "direct", guestName: "AI Guest", guestPhone: "+919800001234",
    })) as { id: string; ref: string };
    const b = await prisma.booking.findUnique({ where: { id: r.id } });
    expect(b?.createdViaMcp).toBe(true);
    const audit = await prisma.auditLog.findFirst({ where: { entityId: r.id } });
    expect(audit?.actorType).toBe("MCP");
  });

  it("check_in then check_out transition the booking", async () => {
    const b = await aBooking();
    expect((await run("check_in", { bookingId: b.id })) as { status: string }).toMatchObject({ status: "CHECKED_IN" });
    expect((await run("check_out", { bookingId: b.id })) as { status: string }).toMatchObject({ status: "CHECKED_OUT" });
  });

  it("cancel_booking releases the booking", async () => {
    const b = await aBooking();
    expect((await run("cancel_booking", { bookingId: b.id, reason: "No-show" })) as { status: string }).toMatchObject({ status: "CANCELLED" });
  });

  it("rejects acting on a booking outside the caller's workspace", async () => {
    const other = await seedBasic({ gstin: null });
    const foreign = await createBooking({
      ownerId: other.owner.id, propertyId: other.property.id, roomId: other.room.id, channelKey: "direct",
      checkIn: today(), checkOut: addDays(today(), 1), guest: { name: "X", phone: "+919800007777" }, nightlyRatePaise: 100000,
    });
    await expect(run("cancel_booking", { bookingId: foreign.id, reason: "x" })).rejects.toThrow(ScopeError);
  });

  it("get_payment_status reports the balance, and 404s for unknown bookings", async () => {
    const b = await aBooking();
    const s = (await run("get_payment_status", { bookingId: b.id })) as { due: number };
    expect(s.due).toBe(b.totalAmount);
    await expect(run("get_payment_status", { bookingId: "nope" })).rejects.toThrow(/not found/);
  });

  it("create_payment_link returns a (mock) link", async () => {
    const b = await aBooking();
    const r = (await run("create_payment_link", { bookingId: b.id })) as { mock: boolean; shortUrl: string };
    expect(r.mock).toBe(true);
    expect(r.shortUrl).toContain("/pay/");
  });

  it("initiate_refund needs human confirmation, then records pending approval", async () => {
    const first = (await run("initiate_refund", { bookingId: "b", amountPaise: 1000 })) as { needsConfirmation: boolean };
    expect(first.needsConfirmation).toBe(true);
    const confirmed = (await run("initiate_refund", { bookingId: "b", amountPaise: 1000, confirm: true })) as { status: string };
    expect(confirmed.status).toBe("PENDING_OWNER_APPROVAL");
  });

  it("initiate_refund enforces the payments:refund scope", async () => {
    await expect(run("initiate_refund", { bookingId: "b", amountPaise: 1 }, ctx({ scopes: ["bookings:read"] }))).rejects.toThrow(ScopeError);
  });
});
