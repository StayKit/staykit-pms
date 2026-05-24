import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ requireContext: vi.fn() }));

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { requireContext } from "@/lib/auth/context";
import {
  toggleMarketingConsentAction,
  updateGuestAction,
  eraseGuestAction,
  uploadGuestIdAction,
} from "./guests";
import { readStoredFile } from "../storage";

vi.stubEnv("STAYKIT_UPLOAD_DIR", mkdtempSync(path.join(tmpdir(), "staykit-guest-id-")));
import { createBooking } from "../booking/engine";
import { today, addDays } from "../dates";
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

async function aGuest(phone = "+919812300000") {
  return prisma.guest.create({ data: { ownerId: fx.owner.id, name: "Sameer", phone } });
}

describe("toggleMarketingConsentAction", () => {
  it("opts in (stamping consent time) then out", async () => {
    const g = await aGuest();
    await toggleMarketingConsentAction(g.id);
    let after = await prisma.guest.findUnique({ where: { id: g.id } });
    expect(after?.marketingConsent).toBe(true);
    expect(after?.dpdpConsentAt).toBeTruthy();
    await toggleMarketingConsentAction(g.id);
    after = await prisma.guest.findUnique({ where: { id: g.id } });
    expect(after?.marketingConsent).toBe(false);
  });
});

describe("updateGuestAction", () => {
  it("edits fields and rejects a bad email", async () => {
    const g = await aGuest();
    expect((await updateGuestAction(g.id, { name: "Sam K", city: "Coorg" })).ok).toBe(true);
    expect((await prisma.guest.findUnique({ where: { id: g.id } }))?.city).toBe("Coorg");
    expect((await updateGuestAction(g.id, { name: "X", email: "nope" })).ok).toBe(false);
  });
});

describe("uploadGuestIdAction", () => {
  it("stores an encrypted ID and records the masked last 4", async () => {
    const g = await aGuest("+919800000777");
    const form = new FormData();
    form.set("file", new File([Buffer.from("aadhaar-bytes")], "id.png", { type: "image/png" }));
    form.set("idType", "AADHAAR");
    form.set("idLast4", "9012");
    const res = await uploadGuestIdAction(g.id, form);
    expect(res.ok).toBe(true);

    const after = await prisma.guest.findUnique({ where: { id: g.id } });
    expect(after?.idLast4).toBe("9012");
    expect(after?.idFileId).toBeTruthy();
    const bytes = await readStoredFile(after!.idFileId!, fx.owner.id);
    expect(bytes.toString()).toBe("aadhaar-bytes");
  });

  it("rejects a disallowed mime type", async () => {
    const g = await aGuest("+919800000778");
    const form = new FormData();
    form.set("file", new File([Buffer.from("x")], "bad.exe", { type: "application/x-msdownload" }));
    expect((await uploadGuestIdAction(g.id, form)).ok).toBe(false);
  });
});

describe("eraseGuestAction", () => {
  it("hard-deletes a guest with no bookings", async () => {
    const g = await aGuest("+919800000001");
    const res = await eraseGuestAction(g.id);
    expect(res.ok).toBe(true);
    expect(await prisma.guest.findUnique({ where: { id: g.id } })).toBeNull();
  });

  it("anonymises a guest who has billable bookings", async () => {
    const b = await createBooking({
      ownerId: fx.owner.id,
      propertyId: fx.property.id,
      roomId: fx.room.id,
      channelKey: "direct",
      checkIn: today(),
      checkOut: addDays(today(), 1),
      guest: { name: "Sameer", phone: "+919812300000" },
      nightlyRatePaise: 1000_00,
    });
    const bg = await prisma.bookingGuest.findFirst({ where: { bookingId: b.id } });
    const res = await eraseGuestAction(bg!.guestId);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/retained/);
    const after = await prisma.guest.findUnique({ where: { id: bg!.guestId } });
    expect(after?.name).toBe("Erased guest");
    expect(after?.phone).toMatch(/^erased_/);
  });
});
