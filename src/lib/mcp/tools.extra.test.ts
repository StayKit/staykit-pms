import { describe, it, expect, beforeEach } from "vitest";
import { getTool, type McpContext } from "./tools";
import { createBooking } from "../booking/engine";
import { today, addDays, ymd } from "../dates";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

const ALL = [
  "bookings:read",
  "bookings:write",
  "bookings:cancel",
  "payments:read",
  "payments:refund",
  "properties:read",
  "properties:write",
  "reports:read",
  "notifications:send",
];

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
});

function ctx(): McpContext {
  return { ownerId: fx.owner.id, userId: fx.user.id, name: "O", scopes: ALL, propertyScopes: [] };
}

describe("tool argument branches", () => {
  it("list_bookings handles both empty and fully-specified filters", async () => {
    await createBooking({
      ownerId: fx.owner.id,
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      checkIn: today(),
      checkOut: addDays(today(), 2),
      guest: { name: "S", phone: "+919812300000" },
      nightlyRatePaise: 6300_00,
    });
    const all = (await getTool("list_bookings")!.run({}, ctx())) as unknown[];
    expect(all.length).toBe(1);
    const filtered = (await getTool("list_bookings")!.run(
      {
        propertyId: fx.property.id,
        status: "CONFIRMED",
        from: ymd(addDays(today(), -1)),
        to: ymd(addDays(today(), 30)),
      },
      ctx(),
    )) as unknown[];
    expect(filtered.length).toBe(1);
  });

  it("get_kpis honours explicit from/to/propertyId", async () => {
    const k = (await getTool("get_kpis")!.run(
      { from: ymd(addDays(today(), -7)), to: ymd(addDays(today(), 1)), propertyId: fx.property.id },
      ctx(),
    )) as { roomNightsAvailable: number };
    expect(k.roomNightsAvailable).toBeGreaterThan(0);
  });
});
