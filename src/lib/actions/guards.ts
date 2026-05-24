import { prisma } from "../db";
import { assertAccess, type Permission } from "../rbac/policy";
import type { AppContext } from "../auth/context";

/**
 * Load a property the caller's owner owns and assert RBAC. Throws if the property
 * doesn't belong to the owner (tenancy) or the role lacks the permission.
 */
export async function assertOwnedProperty(
  ctx: AppContext,
  propertyId: string,
  permission: Permission,
) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, ownerId: ctx.ownerId },
  });
  if (!property) throw new Error("Property not found in your workspace.");
  assertAccess(ctx, permission, { propertyId });
  return property;
}

/** Slugify a channel/name into a stable key: "Booking.com" → "booking-com". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
