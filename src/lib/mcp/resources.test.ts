import { describe, it, expect, beforeEach } from "vitest";
import { listResources, readResource, RESOURCE_TEMPLATES } from "./resources";
import type { McpContext } from "./tools";
import { createBooking } from "../booking/engine";
import { today, addDays, ymd } from "../dates";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

let fx: Fixture;
function ctx(): McpContext {
  return {
    ownerId: fx.owner.id,
    userId: fx.user.id,
    name: "Owner",
    scopes: ["properties:read", "bookings:read", "reports:read"],
    propertyScopes: [],
  };
}

beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
});

describe("listResources", () => {
  it("lists the properties resource plus per-property entries", async () => {
    const list = await listResources(ctx());
    expect(list.find((r) => r.uri === "staykit://properties")).toBeTruthy();
    expect(list.find((r) => r.uri === `staykit://properties/${fx.property.id}`)).toBeTruthy();
    expect(
      list.find((r) => r.uri === `staykit://policies/cancellation/${fx.property.id}`),
    ).toBeTruthy();
    expect(RESOURCE_TEMPLATES.length).toBeGreaterThan(0);
  });
});

describe("readResource", () => {
  it("reads the properties collection", async () => {
    const c = await readResource("staykit://properties", ctx());
    expect(JSON.parse(c.text)).toHaveLength(1);
  });

  it("reads a property, a booking, a policy and an occupancy snapshot", async () => {
    const b = await createBooking({
      ownerId: fx.owner.id,
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      checkIn: today(),
      checkOut: addDays(today(), 1),
      guest: { name: "Sameer", phone: "+919812300000" },
      nightlyRatePaise: 5000_00,
    });
    expect((await readResource(`staykit://properties/${fx.property.id}`, ctx())).mimeType).toBe(
      "application/json",
    );
    expect((await readResource(`staykit://bookings/${b.id}`, ctx())).text).toContain(b.ref);
    expect(
      (await readResource(`staykit://policies/cancellation/${fx.property.id}`, ctx())).mimeType,
    ).toBe("text/plain");
    const occ = await readResource(
      `staykit://reports/occupancy/${ymd(today())}/${ymd(addDays(today(), 1))}`,
      ctx(),
    );
    expect(JSON.parse(occ.text)).toHaveProperty("occupancyPct");
  });

  it("throws for unknown or unauthorised URIs", async () => {
    await expect(readResource("staykit://nope", ctx())).rejects.toThrow(/Unknown resource/);
    await expect(readResource("staykit://bookings/missing", ctx())).rejects.toThrow(/not found/);
  });
});
