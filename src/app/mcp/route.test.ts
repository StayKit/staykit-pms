import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { POST, GET } from "./route";
import { prisma } from "@/lib/db";
import { resetDb, seedBasic, type Fixture } from "../../../test/factories";

let fx: Fixture;
beforeEach(async () => {
  await resetDb();
  fx = await seedBasic({ gstin: null });
});
afterEach(() => vi.unstubAllEnvs());

function rpc(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost:3000/mcp", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...headers },
    }),
  );
}

describe("MCP route — unauthenticated negotiation", () => {
  it("handles initialize without auth", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize" });
    const body = await res.json();
    expect(body.result.protocolVersion).toBe("2025-11-25");
    expect(body.result.serverInfo.name).toBe("StayKit");
  });

  it("answers ping and accepts the initialized notification", async () => {
    expect((await (await rpc({ jsonrpc: "2.0", id: 2, method: "ping" })).json()).result).toEqual({});
    const note = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(note.status).toBe(202);
  });

  it("returns a parse error for invalid JSON", async () => {
    const res = await POST(new Request("http://localhost:3000/mcp", { method: "POST", body: "{bad" }));
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
  });

  it("GET advertises the endpoint", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/Streamable HTTP/);
  });

  it("defaults a missing request id to null in the response", async () => {
    const res = await rpc({ jsonrpc: "2.0", method: "initialize" }); // no id
    const body = await res.json();
    expect(body.id).toBeNull();
  });
});

describe("MCP route — authorized via the dev fallback", () => {
  it("lists tools the caller is scoped for", async () => {
    const body = await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" })).json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("get_kpis");
    expect(names).toContain("create_booking");
  });

  it("calls a tool and returns structured content", async () => {
    const body = await (await rpc({
      jsonrpc: "2.0", id: 4, method: "tools/call",
      params: { name: "get_kpis", arguments: {} },
    })).json();
    expect(body.result.structuredContent).toHaveProperty("occupancyPct");
  });

  it("returns an isError result for a tool that throws", async () => {
    const body = await (await rpc({
      jsonrpc: "2.0", id: 5, method: "tools/call",
      params: { name: "get_payment_status", arguments: { bookingId: "nope" } },
    })).json();
    expect(body.result.isError).toBe(true);
    const audit = await prisma.mcpAuditEntry.findFirst({ where: { tool: "get_payment_status" } });
    expect(audit?.status).toBe("ERROR");
  });

  it("rejects unknown tools and unknown methods", async () => {
    expect((await (await rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "ghost" } })).json()).error.code).toBe(-32602);
    expect((await (await rpc({ jsonrpc: "2.0", id: 7, method: "frobnicate" })).json()).error.code).toBe(-32601);
  });

  it("redacts guest PII in the audit log", async () => {
    await rpc({
      jsonrpc: "2.0", id: 8, method: "tools/call",
      params: { name: "create_booking", arguments: {
        propertyId: fx.property.id, roomId: fx.room.id, checkIn: "2026-09-01", checkOut: "2026-09-02",
        channel: "direct", guestName: "Sameer", guestPhone: "+919812300000",
      } },
    });
    const audit = await prisma.mcpAuditEntry.findFirst({ where: { tool: "create_booking" } });
    expect(audit?.args).toContain("[redacted]");
    expect(audit?.args).not.toContain("+919812300000");
  });
});

describe("MCP route — auth enforcement", () => {
  it("returns 401 with a WWW-Authenticate header when unauthenticated in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await rpc({ jsonrpc: "2.0", id: 9, method: "tools/list" });
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("resource_metadata");
  });

  it("filters tools/list to the token's scopes", async () => {
    const client = await prisma.mcpOAuthClient.create({
      data: { ownerId: fx.owner.id, clientId: "c_ro", clientName: "RO", redirectUris: "[]", scopes: "reports:read" },
    });
    await prisma.mcpAccessToken.create({
      data: {
        clientId: client.id, userId: fx.user.id, scopes: "reports:read",
        tokenHash: createHash("sha256").update("ro").digest("hex"),
        expiresAt: new Date(Date.now() + 60_000), resource: "x",
      },
    });
    const body = await (await rpc({ jsonrpc: "2.0", id: 11, method: "tools/list" }, { authorization: "Bearer ro" })).json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(["get_kpis"]); // only the reports:read tool
  });

  it("records DENIED when a tool is called outside the token's scope", async () => {
    const client = await prisma.mcpOAuthClient.create({
      data: { ownerId: fx.owner.id, clientId: "c1", clientName: "Claude", redirectUris: "[]", scopes: "reports:read" },
    });
    await prisma.mcpAccessToken.create({
      data: {
        clientId: client.id, userId: fx.user.id, scopes: "reports:read",
        tokenHash: createHash("sha256").update("limited").digest("hex"),
        expiresAt: new Date(Date.now() + 60_000), resource: "http://localhost:3000/mcp",
      },
    });
    const body = await (await rpc(
      { jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "create_booking", arguments: {
        propertyId: fx.property.id, roomId: fx.room.id, checkIn: "2026-09-03", checkOut: "2026-09-04",
        channel: "direct", guestName: "X", guestPhone: "+910000000000",
      } } },
      { authorization: "Bearer limited" },
    )).json();
    expect(body.result.isError).toBe(true);
    const audit = await prisma.mcpAuditEntry.findFirst({ where: { tool: "create_booking", status: "DENIED" } });
    expect(audit).toBeTruthy();
  });
});
