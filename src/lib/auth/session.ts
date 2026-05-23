/**
 * Session management. Sessions are opaque random tokens; only the SHA-256 hash is
 * stored. Two scopes: "staff" (a User row) and "guest" (a phone number, no User).
 * Cookies are HttpOnly + SameSite=Lax; Secure in production.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "../db";
import { SESSION } from "../config";
import type { Role } from "../rbac/policy";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const isProd = process.env.NODE_ENV === "production";

export async function createStaffSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION.staffTtlHours * 3_600_000);
  await prisma.session.create({
    data: { userId, token: hashToken(token), scope: "staff", expiresAt },
  });
  const jar = await cookies();
  jar.set(SESSION.staffCookie, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function createGuestSession(guestPhone: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION.guestTtlHours * 3_600_000);
  await prisma.session.create({
    data: { guestPhone, token: hashToken(token), scope: "guest", expiresAt },
  });
  const jar = await cookies();
  jar.set(SESSION.guestCookie, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export interface StaffSession {
  scope: "staff";
  userId: string;
  ownerId: string;
  role: Role;
  name: string;
  propertyScopes: string[];
}

export async function getStaffSession(): Promise<StaffSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION.staffCookie)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token: hashToken(token) },
  });
  if (!session || session.scope !== "staff" || !session.userId) return null;
  if (session.revokedAt || session.expiresAt < new Date()) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { propertyScopes: true },
  });
  if (!user || !user.active) return null;
  return {
    scope: "staff",
    userId: user.id,
    ownerId: user.ownerId,
    role: user.role as Role,
    name: user.name,
    propertyScopes: user.propertyScopes.map((s) => s.propertyId),
  };
}

export async function getGuestSession(): Promise<{ scope: "guest"; phone: string } | null> {
  const jar = await cookies();
  const token = jar.get(SESSION.guestCookie)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token: hashToken(token) } });
  if (!session || session.scope !== "guest" || !session.guestPhone) return null;
  if (session.revokedAt || session.expiresAt < new Date()) return null;
  return { scope: "guest", phone: session.guestPhone };
}

export async function destroySession(scope: "staff" | "guest") {
  const jar = await cookies();
  const cookieName = scope === "staff" ? SESSION.staffCookie : SESSION.guestCookie;
  const token = jar.get(cookieName)?.value;
  if (token) {
    await prisma.session
      .update({ where: { token: hashToken(token) }, data: { revokedAt: new Date() } })
      .catch(() => {});
  }
  jar.delete(cookieName);
}
