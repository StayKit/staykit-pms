import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { financialYearLabel, placeOfSupply } from "./invoice";
import { resetDb, seedBasic, type Fixture } from "../../test/factories";
import { createBooking } from "./booking/engine";
import { applyPayment } from "./payments/service";
import { today, addDays } from "./dates";

describe("financialYearLabel", () => {
  it("uses India's Apr–Mar financial year", () => {
    expect(financialYearLabel(new Date("2025-04-01T00:00:00+05:30"))).toBe("25-26");
    expect(financialYearLabel(new Date("2026-03-31T23:00:00+05:30"))).toBe("25-26");
    expect(financialYearLabel(new Date("2026-04-01T06:00:00+05:30"))).toBe("26-27");
  });
});

describe("placeOfSupply", () => {
  it("splits CGST+SGST for an intra-state guest", () => {
    const pos = placeOfSupply("KA", "KA", 10000_00, 1800_00);
    expect(pos.intraState).toBe(true);
    expect(pos.lines).toHaveLength(2);
    expect(pos.lines[0].amountPaise + pos.lines[1].amountPaise).toBe(1800_00);
    expect(pos.lines[0].label).toContain("CGST");
  });

  it("charges IGST for an inter-state guest", () => {
    const pos = placeOfSupply("KA", "MH", 10000_00, 1800_00);
    expect(pos.intraState).toBe(false);
    expect(pos.lines).toHaveLength(1);
    expect(pos.lines[0].label).toContain("IGST");
    expect(pos.lines[0].amountPaise).toBe(1800_00);
  });

  it("treats an unknown guest state as intra-state (conservative default)", () => {
    const pos = placeOfSupply("KA", null, 10000_00, 500_00);
    expect(pos.intraState).toBe(true);
  });
});

describe("issueInvoiceNumber (via applyPayment)", () => {
  let fx: Fixture;
  beforeEach(async () => {
    await resetDb();
    fx = await seedBasic();
  });

  it("assigns a gapless serial on first payment and never regenerates it", async () => {
    const b = await createBooking({
      ownerId: fx.owner.id,
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      checkIn: today(),
      checkOut: addDays(today(), 1),
      guest: { name: "Asha", phone: "+919800011111" },
      nightlyRatePaise: 5000_00,
    });
    expect(b.invoiceNumber).toBeNull();

    await applyPayment(b.id, 1000_00, { method: "cash" });
    const afterFirst = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(afterFirst?.invoiceNumber).toMatch(/^INV\/\d\d-\d\d\/0001$/);

    // A second payment must not change the issued number.
    await applyPayment(b.id, 500_00, { method: "cash" });
    const afterSecond = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(afterSecond?.invoiceNumber).toBe(afterFirst?.invoiceNumber);
  });

  it("increments consecutively across bookings", async () => {
    const make = async (phone: string) =>
      createBooking({
        ownerId: fx.owner.id,
        propertyId: fx.property.id,
        roomId: fx.room.id,
        channelKey: "direct",
        checkIn: today(),
        checkOut: addDays(today(), 1),
        guest: { name: "G", phone },
        nightlyRatePaise: 5000_00,
      });
    const b1 = await make("+919800022222");
    await applyPayment(b1.id, 100_00, { method: "cash" });
    // free the room/night for a second booking
    const b2 = await prisma.booking.create({
      data: {
        ref: "SK-SECOND",
        propertyId: fx.property.id,
        channelId: (
          await prisma.channelSource.findFirstOrThrow({ where: { ownerId: fx.owner.id } })
        ).id,
        checkIn: addDays(today(), 5),
        checkOut: addDays(today(), 6),
        subtotal: 5000_00,
        taxAmount: 0,
        totalAmount: 5000_00,
      },
    });
    await applyPayment(b2.id, 100_00, { method: "cash" });

    const n1 = (await prisma.booking.findUnique({ where: { id: b1.id } }))?.invoiceNumber;
    const n2 = (await prisma.booking.findUnique({ where: { id: b2.id } }))?.invoiceNumber;
    expect(n1).toMatch(/0001$/);
    expect(n2).toMatch(/0002$/);

    // The deposit path must NOT consume an invoice number.
    const counter = (await prisma.property.findUnique({ where: { id: fx.property.id } }))
      ?.invoiceCounter;
    expect(counter).toBe(2);
  });

  it("does not issue an invoice for a deposit-only payment", async () => {
    const b = await createBooking({
      ownerId: fx.owner.id,
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      checkIn: today(),
      checkOut: addDays(today(), 1),
      guest: { name: "Dep", phone: "+919800033333" },
      nightlyRatePaise: 5000_00,
    });
    await applyPayment(b.id, 2000_00, { method: "cash", isDeposit: true });
    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after?.invoiceNumber).toBeNull();
    expect(after?.depositHeld).toBe(2000_00);
    expect(after?.amountPaid).toBe(0);
  });
});
