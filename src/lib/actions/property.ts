"use server";

import { cookies } from "next/headers";
import { ACTIVE_PROPERTY_COOKIE } from "@/lib/property/cookie";

/**
 * Persists the owner's selected property in a cookie. The caller (a client switcher) is expected to
 * `router.refresh()` afterwards so server components re-read the new selection. Validation that the
 * id belongs to the owner happens in `resolveActiveProperty`, which ignores stale/foreign ids.
 */
export async function setActivePropertyAction(propertyId: string): Promise<void> {
  (await cookies()).set(ACTIVE_PROPERTY_COOKIE, propertyId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
