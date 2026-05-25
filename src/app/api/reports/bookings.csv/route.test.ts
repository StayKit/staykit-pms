import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("@/lib/auth/context", () => ({ getAppContext: vi.fn() }));

import { GET } from "./route";
import { getAppContext } from "@/lib/auth/context";
import { createBooking } from "@/lib/booking/engine";
import { prisma } from "@/lib/db";
import { today, addDays } from "@/lib/dates";
import { resetDb, seedBasic, type Fixture } from "../../../../../test/factories";

const mockCtx = getAppContext as unknown as Mock;
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

describe("GET /api/reports/bookings.csv", () => {
  const req = (qs = "") => new Request(`http://localhost/api/reports/bookings.csv${qs}`);

  it("returns 401 when unauthenticated", async () => {
    mockCtx.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("streams a CSV with a header and one row per booking", async () => {
    await createBooking({
      ownerId: fx.owner.id,
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      checkIn: today(),
      checkOut: addDays(today(), 2),
      guest: { name: "Khan, Sameer", phone: "+919812300000" },
      nightlyRatePaise: 6300_00,
    });
    // A guest-less / room-less booking exercises the empty-cell path.
    const ch = await prisma.channelSource.findFirst({ where: { ownerId: fx.owner.id } });
    await prisma.booking.create({
      data: {
        ref: "SK-NOGUEST",
        propertyId: fx.property.id,
        channelId: ch!.id,
        checkIn: today(),
        checkOut: addDays(today(), 1),
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
      },
    });

    const res = await GET(req());
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const text = await res.text();
    const lines = text.trim().split("\n");
    expect(lines[0]).toContain("ref,property,guest");
    // the comma in the guest name is CSV-escaped with quotes
    expect(text).toContain('"Khan, Sameer"');
    // totals are in rupees
    expect(text).toContain("12600"); // 6300 × 2, no GST
    // the guest-less booking renders empty cells without throwing
    expect(text).toContain("SK-NOGUEST");
  });
});
