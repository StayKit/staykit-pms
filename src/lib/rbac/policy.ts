/**
 * Role-based access control. A central map of (role → permissions). Permissions
 * are namespaced strings; MCP OAuth scopes map 1:1 onto these keys.
 *
 * MANAGER and STAFF are additionally constrained to their assigned PropertyScope
 * (checked in assertAccess by the caller passing the user's scoped property ids).
 */
export type Permission =
  | "bookings:read"
  | "bookings:write"
  | "bookings:cancel"
  | "payments:read"
  | "payments:write"
  | "payments:refund"
  | "properties:read"
  | "properties:write"
  | "rates:write"
  | "guests:read"
  | "guests:write"
  | "team:manage"
  | "notifications:read"
  | "notifications:send"
  | "compliance:read"
  | "compliance:write"
  | "reports:read"
  | "mcp:admin";

export type Role = "OWNER" | "MANAGER" | "STAFF";

const ALL: Permission[] = [
  "bookings:read",
  "bookings:write",
  "bookings:cancel",
  "payments:read",
  "payments:write",
  "payments:refund",
  "properties:read",
  "properties:write",
  "rates:write",
  "guests:read",
  "guests:write",
  "team:manage",
  "notifications:read",
  "notifications:send",
  "compliance:read",
  "compliance:write",
  "reports:read",
  "mcp:admin",
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ALL,
  MANAGER: [
    "bookings:read",
    "bookings:write",
    "bookings:cancel",
    "payments:read",
    "payments:write",
    "payments:refund",
    "properties:read",
    "properties:write",
    "rates:write",
    "guests:read",
    "guests:write",
    "notifications:read",
    "notifications:send",
    "compliance:read",
    "compliance:write",
    "reports:read",
  ],
  // Front-desk / housekeeping: operate the day (incl. guest lookups and Form C at the
  // desk), but no financial power (payments:write/refund) and no PII destruction (guests:write).
  // They can cancel a booking they just made / a counter cancellation (audit P1 #8).
  STAFF: [
    "bookings:read",
    "bookings:write",
    "bookings:cancel",
    "properties:read",
    "guests:read",
    "notifications:read",
    "notifications:send",
    "compliance:read",
    "compliance:write",
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export interface AccessContext {
  role: Role;
  /** Property ids this user is scoped to. OWNER has implicit access to all. */
  propertyScopes?: string[];
}

/**
 * Throws if the actor cannot perform `permission` (optionally on `propertyId`).
 * Mirrors `assert(ctx.user, "bookings:write", { propertyId })` from the spec.
 */
export function assertAccess(
  ctx: AccessContext,
  permission: Permission,
  opts?: { propertyId?: string },
): void {
  if (!can(ctx.role, permission)) {
    throw new AccessError(`Role ${ctx.role} lacks permission ${permission}`);
  }
  if (
    opts?.propertyId &&
    ctx.role !== "OWNER" &&
    ctx.propertyScopes &&
    !ctx.propertyScopes.includes(opts.propertyId)
  ) {
    throw new AccessError(`No access to property ${opts.propertyId}`);
  }
}

export class AccessError extends Error {
  readonly code = "FORBIDDEN";
  constructor(message: string) {
    super(message);
    this.name = "AccessError";
  }
}

export function permissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
