import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireContext: vi.fn() }));

import { requireContext } from "@/lib/auth/context";
import { createChannelAction, toggleChannelAction, updateChannelAction } from "./channels";
import { createPropertyAction, updatePropertyAction } from "./properties";
import {
  createRoomTypeAction,
  createRoomAction,
  deleteRoomTypeAction,
  deleteRoomAction,
  setCleanlinessAction,
} from "./rooms";
import {
  createRatePlanAction,
  deleteRatePlanAction,
  createMaintenanceBlockAction,
  deleteMaintenanceBlockAction,
} from "./rateplans";
import { createBooking } from "../booking/engine";
import { today, addDays, ymd } from "../dates";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

const mockCtx = requireContext as unknown as Mock;
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

describe("channels", () => {
  it("creates a channel with a slugified key, then rejects a near-duplicate", async () => {
    const r = await createChannelAction({ name: "Trip Advisor", color: "#29508A" });
    expect(r.ok).toBe(true);
    const ch = await prisma.channelSource.findFirst({ where: { name: "Trip Advisor" } });
    expect(ch?.key).toBe("trip-advisor");
    const dupe = await createChannelAction({ name: "trip advisor!" });
    expect(dupe.ok).toBe(false);
  });

  it("toggles and updates a channel", async () => {
    await createChannelAction({ name: "Agoda" });
    const ch = await prisma.channelSource.findFirst({ where: { name: "Agoda" } });
    await toggleChannelAction(ch!.id);
    expect((await prisma.channelSource.findUnique({ where: { id: ch!.id } }))?.active).toBe(false);
    await updateChannelAction(ch!.id, { name: "Agoda Partner", color: "#112233" });
    expect((await prisma.channelSource.findUnique({ where: { id: ch!.id } }))?.name).toBe(
      "Agoda Partner",
    );
  });

  it("rejects a name with no usable letters", async () => {
    expect((await createChannelAction({ name: "!!!" })).ok).toBe(false);
  });
});

describe("properties", () => {
  it("creates and updates a property", async () => {
    const r = await createPropertyAction({
      name: "Coorg Villa",
      addressLine1: "Hill Rd",
      city: "Madikeri",
      state: "KA",
      pincode: "571201",
    });
    expect(r.ok).toBe(true);
    const id = (r.data as { id: string }).id;
    const upd = await updatePropertyAction(id, {
      name: "Coorg Villa Deluxe",
      addressLine1: "Hill Rd",
      city: "Madikeri",
      state: "KA",
      pincode: "571201",
      gstin: "29ABCDE1234F1Z5",
    });
    expect(upd.ok).toBe(true);
    const p = await prisma.property.findUnique({ where: { id } });
    expect(p?.name).toBe("Coorg Villa Deluxe");
    expect(p?.gstin).toBe("29ABCDE1234F1Z5");
  });

  it("rejects an invalid GSTIN and a bad pincode", async () => {
    const bad = await createPropertyAction({
      name: "X",
      addressLine1: "Y",
      city: "Z",
      state: "KA",
      pincode: "123",
    });
    expect(bad.ok).toBe(false);
    const badGst = await createPropertyAction({
      name: "X",
      addressLine1: "Y",
      city: "Z",
      state: "KA",
      pincode: "560001",
      gstin: "NOTAGSTIN",
    });
    expect(badGst.ok).toBe(false);
  });
});

describe("rooms & room types", () => {
  it("creates a type and a room, and prevents duplicate room names", async () => {
    const rt = await createRoomTypeAction(fx.property.id, {
      name: "Suite",
      baseRateRupees: 8000,
      maxOccupancy: 4,
    });
    expect(rt.ok).toBe(true);
    const typeId = (rt.data as { id: string }).id;
    const r = await createRoomAction(fx.property.id, { name: "Suite 1", roomTypeId: typeId });
    expect(r.ok).toBe(true);
    const dupe = await createRoomAction(fx.property.id, { name: "Suite 1", roomTypeId: typeId });
    expect(dupe.ok).toBe(false);
    // baseRate stored as paise.
    expect((await prisma.roomType.findUnique({ where: { id: typeId } }))?.baseRate).toBe(8000_00);
  });

  it("sets cleanliness", async () => {
    const r = await setCleanlinessAction(fx.room.id, "DIRTY");
    expect(r.ok).toBe(true);
    expect((await prisma.room.findUnique({ where: { id: fx.room.id } }))?.cleanliness).toBe(
      "DIRTY",
    );
  });

  it("guards deletes: room with bookings, type with rooms", async () => {
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
    expect((await deleteRoomAction(fx.room.id)).ok).toBe(false);
    expect((await deleteRoomTypeAction(fx.roomType.id)).ok).toBe(false);
  });
});

describe("rate plans & maintenance", () => {
  it("creates a rate plan with an override and deletes it", async () => {
    const r = await createRatePlanAction(fx.property.id, {
      name: "Diwali",
      startDate: "2026-11-01",
      endDate: "2026-11-10",
      priority: 5,
      overrides: [{ roomTypeId: fx.roomType.id, amountRupees: 9000 }],
    });
    expect(r.ok).toBe(true);
    const planId = (r.data as { id: string }).id;
    const ov = await prisma.ratePlanOverride.findFirst({ where: { ratePlanId: planId } });
    expect(ov?.amount).toBe(9000_00);
    expect((await deleteRatePlanAction(planId)).ok).toBe(true);
  });

  it("rejects an end date before the start date", async () => {
    const r = await createRatePlanAction(fx.property.id, {
      name: "Bad",
      startDate: "2026-11-10",
      endDate: "2026-11-01",
    });
    expect(r.ok).toBe(false);
  });

  it("blocks a room and rejects overlap with a booking", async () => {
    const r = await createMaintenanceBlockAction(fx.property.id, {
      roomId: fx.room.id,
      startDate: "2026-12-01",
      endDate: "2026-12-05",
      reason: "Repainting",
    });
    expect(r.ok).toBe(true);
    const blockId = (r.data as { id: string }).id;

    await createBooking({
      ownerId: fx.owner.id,
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      checkIn: "2027-01-10",
      checkOut: "2027-01-12",
      guest: { name: "G", phone: "+919812300001" },
      nightlyRatePaise: 1000_00,
    });
    const clash = await createMaintenanceBlockAction(fx.property.id, {
      roomId: fx.room.id,
      startDate: "2027-01-10",
      endDate: "2027-01-12",
      reason: "Clash",
    });
    expect(clash.ok).toBe(false);

    expect((await deleteMaintenanceBlockAction(blockId)).ok).toBe(true);
  });

  it("rejects a block whose end is not after start", async () => {
    const r = await createMaintenanceBlockAction(fx.property.id, {
      roomId: fx.room.id,
      startDate: "2026-12-05",
      endDate: "2026-12-05",
      reason: "x",
    });
    expect(r.ok).toBe(false);
  });
});

// Keep the import used so lint is happy in case the booking helper above changes.
void ymd;
