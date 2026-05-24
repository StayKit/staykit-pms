import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { purgeExpiredGuestIds } from "./tasks";
import { saveFile } from "../storage";
import { createBooking } from "../booking/engine";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

vi.stubEnv("STAYKIT_UPLOAD_DIR", mkdtempSync(path.join(tmpdir(), "staykit-purge-")));

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
});
afterAll(() => vi.unstubAllEnvs());

async function guestWithId(phone: string, checkIn: string, checkOut: string) {
  const b = await createBooking({
    ownerId: fx.owner.id,
    propertyId: fx.property.id,
    roomId: fx.room.id,
    channelKey: "direct",
    checkIn,
    checkOut,
    guest: { name: "G", phone },
    nightlyRatePaise: 1000_00,
  });
  const bg = await prisma.bookingGuest.findFirst({ where: { bookingId: b.id } });
  const file = await saveFile({
    ownerId: fx.owner.id,
    uploadedById: fx.user.id,
    kind: "GUEST_ID",
    buffer: Buffer.from("id"),
    mime: "image/jpeg",
    ext: "jpg",
  });
  await prisma.guest.update({
    where: { id: bg!.guestId },
    data: { idFileId: file.id, idLast4: "9012", idType: "PASSPORT" },
  });
  return { guestId: bg!.guestId, fileId: file.id };
}

describe("purgeExpiredGuestIds", () => {
  it("purges IDs older than 90 days after checkout, keeps recent ones", async () => {
    // Stayed long ago → should purge.
    const old = await guestWithId("+919800000001", "2026-01-01", "2026-01-03");
    // Stayed recently → should keep.
    const recent = await guestWithId("+919800000002", "2026-05-20", "2026-05-22");

    const res = await purgeExpiredGuestIds(new Date("2026-05-23T00:00:00Z"));
    expect(res.purged).toBe(1);

    const oldGuest = await prisma.guest.findUnique({ where: { id: old.guestId } });
    expect(oldGuest?.idFileId).toBeNull();
    expect(oldGuest?.idLast4).toBeNull();
    expect(await prisma.fileUpload.findUnique({ where: { id: old.fileId } })).toBeNull();

    const recentGuest = await prisma.guest.findUnique({ where: { id: recent.guestId } });
    expect(recentGuest?.idFileId).toBe(recent.fileId);
  });
});
