import { describe, it, expect, beforeEach } from "vitest";
import { getKpis } from "./reports";
import { prisma } from "@/lib/db";
import { addDays, today } from "./dates";
import { resetDb, seedBasic, type Fixture } from "../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic();
});

describe("getKpis with no available room-nights", () => {
  it("returns zero occupancy and RevPAR when a property has no rooms", async () => {
    const empty = await prisma.property.create({
      data: { ownerId: fx.owner.id, name: "Empty", addressLine1: "x", city: "y", state: "KA", pincode: "1" },
    });
    const k = await getKpis(fx.owner.id, today(), addDays(today(), 5), empty.id);
    expect(k.roomNightsAvailable).toBe(0);
    expect(k.occupancyPct).toBe(0);
    expect(k.revparPaise).toBe(0);
    expect(k.adrPaise).toBe(0);
  });
});
