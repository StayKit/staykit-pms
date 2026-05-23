import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const { jar } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    jar: {
      store,
      get: (n: string) => (store.has(n) ? { value: store.get(n)! } : undefined),
      set: (n: string, v: string) => store.set(n, v),
      delete: (n: string) => store.delete(n),
    },
  };
});
vi.mock("next/headers", () => ({ cookies: async () => jar }));

import {
  createStaffSession,
  getStaffSession,
  createGuestSession,
  getGuestSession,
  destroySession,
  cookieName,
} from "./session";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  jar.store.clear();
  fx = await seedBasic();
});
afterEach(() => vi.unstubAllEnvs());

describe("cookieName", () => {
  it("uses the bare name in dev and the __Host- prefix in production", () => {
    expect(cookieName("staykit_session")).toBe("staykit_session");
    vi.stubEnv("NODE_ENV", "production");
    expect(cookieName("staykit_session")).toBe("__Host-staykit_session");
  });
});

describe("staff sessions", () => {
  it("creates a hashed session and resolves it back to the user", async () => {
    await createStaffSession(fx.user.id);
    // The raw token is in the cookie; the DB stores only its hash.
    const raw = jar.store.get("staykit_session")!;
    const row = await prisma.session.findFirst();
    expect(row?.token).not.toBe(raw);
    expect(row?.scope).toBe("staff");

    const session = await getStaffSession();
    expect(session).toMatchObject({ userId: fx.user.id, ownerId: fx.owner.id, role: "OWNER", scope: "staff" });
  });

  it("returns null when no cookie is present", async () => {
    expect(await getStaffSession()).toBeNull();
  });

  it("returns null for an unknown token", async () => {
    jar.store.set("staykit_session", "bogus");
    expect(await getStaffSession()).toBeNull();
  });

  it("returns null when the session is revoked or expired", async () => {
    await createStaffSession(fx.user.id);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getStaffSession()).toBeNull();
  });

  it("returns null when the user is inactive", async () => {
    await createStaffSession(fx.user.id);
    await prisma.user.update({ where: { id: fx.user.id }, data: { active: false } });
    expect(await getStaffSession()).toBeNull();
  });

  it("does not resolve a guest cookie as a staff session", async () => {
    await createGuestSession("+919812300000");
    expect(await getStaffSession()).toBeNull();
  });
});

describe("guest sessions", () => {
  it("creates and resolves a guest session by phone", async () => {
    await createGuestSession("+919812300000");
    expect(await getGuestSession()).toEqual({ scope: "guest", phone: "+919812300000" });
  });

  it("returns null without a cookie and for revoked sessions", async () => {
    expect(await getGuestSession()).toBeNull();
    await createGuestSession("+919812300000");
    await prisma.session.updateMany({ data: { revokedAt: new Date() } });
    expect(await getGuestSession()).toBeNull();
  });

  it("returns null when the guest session has expired by time", async () => {
    await createGuestSession("+919812300000");
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await getGuestSession()).toBeNull();
  });

  it("returns null for a bogus token, a non-guest scope, or a missing phone", async () => {
    const { createHash } = await import("node:crypto");
    const hash = (t: string) => createHash("sha256").update(t).digest("hex");
    // bogus token → no session row
    jar.store.set("staykit_guest", "bogus");
    expect(await getGuestSession()).toBeNull();
    // a staff-scoped session presented on the guest cookie
    await prisma.session.create({ data: { token: hash("staffish"), scope: "staff", userId: fx.user.id, expiresAt: new Date(Date.now() + 60000) } });
    jar.store.set("staykit_guest", "staffish");
    expect(await getGuestSession()).toBeNull();
    // a guest-scoped session with no phone recorded
    await prisma.session.create({ data: { token: hash("nophone"), scope: "guest", expiresAt: new Date(Date.now() + 60000) } });
    jar.store.set("staykit_guest", "nophone");
    expect(await getGuestSession()).toBeNull();
  });
});

describe("destroySession", () => {
  it("revokes the session row and clears the cookie", async () => {
    await createStaffSession(fx.user.id);
    await destroySession("staff");
    const row = await prisma.session.findFirst();
    expect(row?.revokedAt).toBeInstanceOf(Date);
    expect(jar.store.has("staykit_session")).toBe(false);
  });

  it("is a no-op-safe when there is no cookie", async () => {
    await expect(destroySession("guest")).resolves.toBeUndefined();
  });
});
