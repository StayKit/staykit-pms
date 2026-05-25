import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { ACTIVE_PROPERTY_COOKIE } from "./cookie";

export interface PropertyOption {
  id: string;
  name: string;
}

export interface ActivePropertyResult {
  /** All of the owner's active properties, oldest first — used to populate the switcher. */
  properties: PropertyOption[];
  /** The selected property id: the cookie if it still points at a valid property, else the first. */
  activeId: string | null;
}

/**
 * Resolves the owner's active property from the `activePropertyId` cookie, falling back to the
 * first property when the cookie is missing or stale. This is the single source of truth for the
 * "which property am I looking at" question across the owner layout, dashboard and calendar.
 */
export async function resolveActiveProperty(ownerId: string): Promise<ActivePropertyResult> {
  const properties = await prisma.property.findMany({
    where: { ownerId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  const wanted = (await cookies()).get(ACTIVE_PROPERTY_COOKIE)?.value;
  const activeId = properties.find((p) => p.id === wanted)?.id ?? properties[0]?.id ?? null;
  return { properties, activeId };
}
