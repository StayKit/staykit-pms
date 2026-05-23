import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { resolveMcpContext } from "./auth";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic();
});
afterEach(() => vi.unstubAllEnvs());

function req(bearer?: string) {
  return new Request("http://localhost:3000/mcp", {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });
}

async function mintToken(token: string, over: Record<string, unknown> = {}) {
  const client = await prisma.mcpOAuthClient.create({
    data: {
      ownerId: fx.owner.id,
      clientId: "c_" + Math.random().toString(36).slice(2),
      clientName: "Claude",
      redirectUris: "[]",
      scopes: "bookings:read",
    },
  });
  return prisma.mcpAccessToken.create({
    data: {
      clientId: client.id,
      userId: fx.user.id,
      scopes: "bookings:read,reports:read",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60_000),
      resource: "http://localhost:3000/mcp",
      ...over,
    },
  });
}

describe("resolveMcpContext — bearer token", () => {
  it("resolves a valid token to its user with the token's scopes", async () => {
    await mintToken("good");
    const ctx = await resolveMcpContext(req("good"));
    expect(ctx).toMatchObject({ ownerId: fx.owner.id, userId: fx.user.id });
    expect(ctx?.scopes).toEqual(["bookings:read", "reports:read"]);
    // OWNER ⇒ no property restriction
    expect(ctx?.propertyScopes).toEqual([]);
    // last-used is stamped
    const tok = await prisma.mcpAccessToken.findFirst();
    expect(tok?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("restricts a non-owner token to its assigned property scopes", async () => {
    const mgr = await prisma.user.create({
      data: { ownerId: fx.owner.id, name: "Rakesh", phone: "+919800002002", role: "MANAGER" },
    });
    await prisma.propertyScope.create({ data: { userId: mgr.id, propertyId: fx.property.id, permissions: "" } });
    await mintToken("mgr", { userId: mgr.id });
    const ctx = await resolveMcpContext(req("mgr"));
    expect(ctx?.propertyScopes).toEqual([fx.property.id]);
  });

  it("returns null for an unknown / revoked / expired token", async () => {
    expect(await resolveMcpContext(req("unknown"))).toBeNull();
    await mintToken("revoked", { revokedAt: new Date() });
    expect(await resolveMcpContext(req("revoked"))).toBeNull();
    await mintToken("expired", { expiresAt: new Date(Date.now() - 1000) });
    expect(await resolveMcpContext(req("expired"))).toBeNull();
  });

  it("returns null when the token's user is inactive", async () => {
    await mintToken("ok");
    await prisma.user.update({ where: { id: fx.user.id }, data: { active: false } });
    expect(await resolveMcpContext(req("ok"))).toBeNull();
  });
});

describe("resolveMcpContext — no token", () => {
  it("falls back to the demo owner with full scopes in development", async () => {
    const ctx = await resolveMcpContext(req());
    expect(ctx?.ownerId).toBe(fx.owner.id);
    expect(ctx?.scopes).toContain("bookings:write");
  });

  it("returns null in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await resolveMcpContext(req())).toBeNull();
  });

  it("returns null when REQUIRE_LOGIN=1", async () => {
    vi.stubEnv("REQUIRE_LOGIN", "1");
    expect(await resolveMcpContext(req())).toBeNull();
  });

  it("returns null when there is no owner to fall back to", async () => {
    await resetDb();
    expect(await resolveMcpContext(req())).toBeNull();
  });
});
