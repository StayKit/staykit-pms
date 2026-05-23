import { describe, it, expect, beforeEach } from "vitest";
import { getKpis, sourceMix } from "./reports";
import { createBooking } from "./booking/engine";
import { addDays, today } from "./dates";
import { resetDb, seedBasic, addRoom, type Fixture } from "../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null }); // simpler maths: total == subtotal
});

const from = () => addDays(today(), -1);
const to = () => addDays(today(), 10);

describe("getKpis (occupancy / ADR / RevPAR)", () => {
  it("returns zeroes when there are no rooms sold", async () => {
    const k = await getKpis(fx.owner.id, from(), to());
    expect(k.roomNightsSold).toBe(0);
    expect(k.occupancyPct).toBe(0);
    expect(k.adrPaise).toBe(0);
    expect(k.revparPaise).toBe(0);
    expect(k.roomNightsAvailable).toBeGreaterThan(0);
  });

  it("computes room-nights sold, ADR and RevPAR from confirmed bookings", async () => {
    // 1 room, 2 nights @ ₹6300.
    await createBooking({
      ownerId: fx.owner.id,
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      checkIn: today(),
      checkOut: addDays(today(), 2),
      guest: { name: "G", phone: "+919800001111" },
      nightlyRatePaise: 6300_00,
    });
    const k = await getKpis(fx.owner.id, from(), to());
    expect(k.roomNightsSold).toBe(2);
    expect(k.roomRevenuePaise).toBe(2 * 6300_00);
    // ADR = revenue / nights sold = 6300
    expect(k.adrPaise).toBe(6300_00);
    // RevPAR = revenue / available room-nights
    expect(k.revparPaise).toBe(Math.round((2 * 6300_00) / k.roomNightsAvailable));
  });

  it("can scope KPIs to a single property", async () => {
    const k = await getKpis(fx.owner.id, from(), to(), fx.property.id);
    expect(k.roomNightsAvailable).toBe(11 * 1); // 1 room × (to-from) nights
  });
});

describe("sourceMix", () => {
  it("aggregates bookings by channel as percentages", async () => {
    await addRoom(fx.property.id, fx.roomType.id, "Room 2", "102");
    const r2 = await addRoom(fx.property.id, fx.roomType.id, "Room 3", "103");
    await createBooking({
      ownerId: fx.owner.id,
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      checkIn: today(),
      checkOut: addDays(today(), 1),
      guest: { name: "A", phone: "+919800002221" },
      nightlyRatePaise: 5000_00,
    });
    await createBooking({
      ownerId: fx.owner.id,
      propertyId: fx.property.id,
      roomId: r2.id,
      channelKey: "airbnb",
      checkIn: today(),
      checkOut: addDays(today(), 1),
      guest: { name: "B", phone: "+919800002222" },
      nightlyRatePaise: 5000_00,
    });
    const mix = await sourceMix(fx.owner.id, from(), to());
    const total = mix.reduce((s, m) => s + m.count, 0);
    expect(total).toBe(2);
    expect(mix.find((m) => m.name === "Direct")?.pct).toBe(50);
    // sorted by count desc
    expect(mix[0].count).toBeGreaterThanOrEqual(mix[mix.length - 1].count);
  });

  it("returns an empty array when there are no bookings", async () => {
    expect(await sourceMix(fx.owner.id, from(), to())).toEqual([]);
  });
});
