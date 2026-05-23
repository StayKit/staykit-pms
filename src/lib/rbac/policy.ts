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
  | "payments:refund"
  | "properties:read"
  | "properties:write"
  | "rates:write"
  | "team:manage"
  | "notifications:send"
  | "reports:read"
  | "mcp:admin";

export type Role = "OWNER" | "MANAGER" | "STAFF";

const ALL: Permission[] = [
  "bookings:read",
  "bookings:write",
  "bookings:cancel",
  "payments:read",
  "payments:refund",
  "properties:read",
  "properties:write",
  "rates:write",
  "team:manage",
  "notifications:send",
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
    "payments:refund",
    "properties:read",
    "properties:write",
    "rates:write",
    "notifications:send",
    "reports:read",
  ],
  // Front-desk / housekeeping: operate the day, but no financial or config power.
  STAFF: ["bookings:read", "bookings:write", "properties:read", "notifications:send"],
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
