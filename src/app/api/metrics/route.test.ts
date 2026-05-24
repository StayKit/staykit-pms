import { describe, it, expect, beforeEach } from "vitest";
import { GET } from "./route";
import { createBooking } from "@/lib/booking/engine";
import { today, addDays } from "@/lib/dates";
import { resetDb, seedBasic, type Fixture } from "../../../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
});

describe("GET /api/metrics", () => {
  it("emits Prometheus-format gauges", async () => {
    await createBooking({
      ownerId: fx.owner.id,
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      checkIn: today(),
      checkOut: addDays(today(), 1),
      guest: { name: "G", phone: "+919812300000" },
      nightlyRatePaise: 1000_00,
    });
    const res = await GET();
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toMatch(/staykit_bookings_total 1/);
    expect(body).toMatch(/# TYPE staykit_jobs_queued gauge/);
    expect(body).toContain("staykit_notifications_total");
  });
});
