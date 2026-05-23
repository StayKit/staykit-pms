import { prisma } from "@/lib/db";
import { DEFAULT_CHANNELS } from "@/lib/config";

/** Truncate every table in FK-safe order. Call in beforeEach for service tests. */
export async function resetDb() {
  await prisma.$transaction([
    prisma.mcpAuditEntry.deleteMany(),
    prisma.mcpAccessToken.deleteMany(),
    prisma.mcpOAuthClient.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.notificationLog.deleteMany(),
    prisma.notificationAutomation.deleteMany(),
    prisma.notificationTemplate.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.paymentLink.deleteMany(),
    prisma.bookingRoom.deleteMany(),
    prisma.bookingGuest.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.maintenanceBlock.deleteMany(),
    prisma.ratePlanOverride.deleteMany(),
    prisma.ratePlan.deleteMany(),
    prisma.room.deleteMany(),
    prisma.roomType.deleteMany(),
    prisma.channelSource.deleteMany(),
    prisma.guest.deleteMany(),
    prisma.propertyScope.deleteMany(),
    prisma.property.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.job.deleteMany(),
    prisma.fileUpload.deleteMany(),
    prisma.session.deleteMany(),
    prisma.otpRequest.deleteMany(),
    prisma.user.deleteMany(),
    prisma.dailyOccupancy.deleteMany(),
    prisma.owner.deleteMany(),
  ]);
}

export interface Fixture {
  owner: Awaited<ReturnType<typeof prisma.owner.create>>;
  user: Awaited<ReturnType<typeof prisma.user.create>>;
  property: Awaited<ReturnType<typeof prisma.property.create>>;
  roomType: Awaited<ReturnType<typeof prisma.roomType.create>>;
  room: Awaited<ReturnType<typeof prisma.room.create>>;
}

/**
 * A minimal but complete fixture: one owner with an OWNER user, a GST-registered
 * property, one room type, one room, and the default channels.
 */
let seq = 0;

export async function seedBasic(opts?: { gstin?: string | null }): Promise<Fixture> {
  seq += 1;
  const phone = `+9198000${String(10000 + seq).slice(-5)}`;
  const owner = await prisma.owner.create({
    data: { name: "Test Owner", email: `owner${seq}@test.in`, phone },
  });
  const user = await prisma.user.create({
    data: { ownerId: owner.id, name: "Owner User", phone, role: "OWNER" },
  });
  for (const c of DEFAULT_CHANNELS) {
    await prisma.channelSource.create({ data: { ownerId: owner.id, ...c } });
  }
  const property = await prisma.property.create({
    data: {
      ownerId: owner.id,
      name: "Test Homestay",
      addressLine1: "1 Test Road",
      city: "Madikeri",
      state: "KA",
      pincode: "571201",
      gstin: opts?.gstin === undefined ? "29ABCDE1234F1Z5" : opts.gstin,
    },
  });
  const roomType = await prisma.roomType.create({
    data: { propertyId: property.id, name: "Deluxe", baseRate: 6300_00, maxOccupancy: 3 },
  });
  const room = await prisma.room.create({
    data: { propertyId: property.id, roomTypeId: roomType.id, name: "Room 1", number: "101" },
  });
  return { owner, user, property, roomType, room };
}

export async function addRoom(propertyId: string, roomTypeId: string, name: string, number: string) {
  return prisma.room.create({ data: { propertyId, roomTypeId, name, number } });
}
