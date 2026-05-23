import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB so the booking transaction throws a non-unique-constraint error;
// the engine should re-throw it (not swallow it as a DoubleBookingError).
vi.mock("@/lib/db", () => ({
  prisma: {
    room: { findFirst: vi.fn() },
    channelSource: { findFirst: vi.fn() },
    ratePlan: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { createBooking, DoubleBookingError } from "./engine";
import { prisma } from "@/lib/db";

const room = prisma.room.findFirst as unknown as ReturnType<typeof vi.fn>;
const channel = prisma.channelSource.findFirst as unknown as ReturnType<typeof vi.fn>;
const tx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  room.mockResolvedValue({
    id: "r1",
    roomTypeId: "t1",
    roomType: { baseRate: 6300_00 },
    property: { gstin: null },
  });
  channel.mockResolvedValue({ id: "c1" });
});

describe("createBooking error propagation", () => {
  it("re-throws unexpected (non-P2002) transaction errors", async () => {
    tx.mockRejectedValue(new Error("boom"));
    await expect(
      createBooking({
        ownerId: "o1",
        propertyId: "p1",
        roomId: "r1",
        channelKey: "direct",
        checkIn: "2026-07-01",
        checkOut: "2026-07-03",
        guest: { name: "S", phone: "+91" },
        nightlyRatePaise: 6300_00,
      }),
    ).rejects.toThrow("boom");
  });

  it("does not misclassify a generic error as a double-booking", async () => {
    tx.mockRejectedValue(new Error("boom"));
    await expect(
      createBooking({
        ownerId: "o1",
        propertyId: "p1",
        roomId: "r1",
        channelKey: "direct",
        checkIn: "2026-07-01",
        checkOut: "2026-07-03",
        guest: { name: "S", phone: "+91" },
        nightlyRatePaise: 6300_00,
      }),
    ).rejects.not.toBeInstanceOf(DoubleBookingError);
  });
});
