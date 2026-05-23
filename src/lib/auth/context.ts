/**
 * Resolves the active app context (owner + acting user). Uses the staff session
 * cookie when present. For a freshly-seeded single-owner deployment with no login
 * yet, it falls back to the owner's OWNER user so the dashboard is browsable —
 * this fallback is disabled in production by setting REQUIRE_LOGIN=1.
 */
import { prisma } from "../db";
import type { Role } from "../rbac/policy";
import { getStaffSession } from "./session";

export interface AppContext {
  ownerId: string;
  userId: string;
  role: Role;
  name: string;
  propertyScopes: string[];
  /** true when resolved from the dev fallback rather than a real session. */
  demo: boolean;
}

export async function getAppContext(): Promise<AppContext | null> {
  const session = await getStaffSession();
  if (session) {
    return {
      ownerId: session.ownerId,
      userId: session.userId,
      role: session.role,
      name: session.name,
      propertyScopes: session.propertyScopes,
      demo: false,
    };
  }

  if (process.env.REQUIRE_LOGIN === "1") return null;

  // Dev/demo fallback: act as the first owner's OWNER user.
  const user = await prisma.user.findFirst({
    where: { role: "OWNER" },
    orderBy: { createdAt: "asc" },
    include: { propertyScopes: true },
  });
  if (!user) return null;
  return {
    ownerId: user.ownerId,
    userId: user.id,
    role: user.role as Role,
    name: user.name,
    propertyScopes: user.propertyScopes.map((s) => s.propertyId),
    demo: true,
  };
}

/** Throwing variant for server actions / route handlers. */
export async function requireContext(): Promise<AppContext> {
  const ctx = await getAppContext();
  if (!ctx) throw new Error("Not authenticated");
  return ctx;
}
