import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireContext: vi.fn() }));
vi.mock("@/lib/payments/service", () => ({
  createPaymentLinkForBooking: vi.fn(),
  applyPayment: vi.fn(),
}));

import { requireContext } from "@/lib/auth/context";
import { createPaymentLinkForBooking } from "@/lib/payments/service";
import { sendPaymentLinkAction } from "./bookings";
import { prisma } from "@/lib/db";
import { today, addDays } from "../dates";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

const ctxMock = requireContext as unknown as Mock;
const linkMock = createPaymentLinkForBooking as unknown as Mock;
let fx: Fixture;
let bookingId: string;

beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
  ctxMock.mockResolvedValue({ ownerId: fx.owner.id, userId: fx.user.id, role: "OWNER", name: "P", propertyScopes: [], demo: true });
  const ch = await prisma.channelSource.findFirst({ where: { ownerId: fx.owner.id } });
  const b = await prisma.booking.create({
    data: {
      ref: "SK-PE001", propertyId: fx.property.id, channelId: ch!.id,
      checkIn: today(), checkOut: addDays(today(), 1), subtotal: 5000_00, taxAmount: 0, totalAmount: 5000_00,
    },
  });
  bookingId = b.id;
});

describe("sendPaymentLinkAction non-Error failure", () => {
  it("falls back to a default message when the service throws a non-Error", async () => {
    linkMock.mockRejectedValue("opaque failure");
    const res = await sendPaymentLinkAction(bookingId);
    expect(res).toEqual({ ok: false, message: "Could not create link" });
  });
});
