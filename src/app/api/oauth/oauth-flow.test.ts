import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { POST as register } from "./register/route";
import { GET as authorize } from "./authorize/route";
import { POST as token } from "./token/route";
import { POST as mcp } from "@/app/mcp/route";
import { resetDb, seedBasic } from "../../../../test/factories";

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "verifier-0123456789-abcdefghijklmnopqrstuvwxyz";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

beforeEach(async () => {
  await resetDb();
  await seedBasic({ gstin: null });
});

function jsonReq(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function registerClient() {
  const res = await register(
    jsonReq("http://localhost:3000/api/oauth/register", {
      client_name: "Claude",
      redirect_uris: [REDIRECT],
    }),
  );
  expect(res.status).toBe(201);
  return (await res.json()).client_id as string;
}

function authorizeUrl(clientId: string, extra: Record<string, string> = {}) {
  const u = new URL("http://localhost:3000/api/oauth/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", REDIRECT);
  u.searchParams.set("code_challenge", CHALLENGE);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("scope", "bookings:read reports:read");
  u.searchParams.set("state", "xyz");
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.toString();
}

async function getCode(clientId: string): Promise<string> {
  const res = await authorize(new Request(authorizeUrl(clientId)));
  expect(res.status).toBe(307);
  const loc = new URL(res.headers.get("location")!);
  expect(loc.searchParams.get("state")).toBe("xyz");
  return loc.searchParams.get("code")!;
}

describe("OAuth 2.1 + PKCE flow", () => {
  it("register → authorize → token → call MCP with the access token", async () => {
    const clientId = await registerClient();
    const code = await getCode(clientId);
    expect(code).toBeTruthy();

    const tokRes = await token(
      jsonReq("http://localhost:3000/api/oauth/token", {
        grant_type: "authorization_code",
        code,
        code_verifier: VERIFIER,
        client_id: clientId,
        redirect_uri: REDIRECT,
      }),
    );
    expect(tokRes.status).toBe(200);
    const tok = await tokRes.json();
    expect(tok.token_type).toBe("Bearer");
    expect(tok.access_token).toBeTruthy();
    expect(tok.refresh_token).toBeTruthy();
    expect(tok.scope).toContain("reports:read");

    // The access token authorizes an MCP call, scoped to the granted scopes.
    const listed = await (
      await mcp(
        new Request("http://localhost:3000/mcp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${tok.access_token}`,
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        }),
      )
    ).json();
    const names = listed.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("get_kpis"); // reports:read
    expect(names).not.toContain("create_booking"); // bookings:write not granted
  });

  it("rejects a bad PKCE verifier", async () => {
    const clientId = await registerClient();
    const code = await getCode(clientId);
    const res = await token(
      jsonReq("http://localhost:3000/api/oauth/token", {
        grant_type: "authorization_code",
        code,
        code_verifier: "wrong-verifier",
        client_id: clientId,
        redirect_uri: REDIRECT,
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("rotates refresh tokens", async () => {
    const clientId = await registerClient();
    const code = await getCode(clientId);
    const first = await (
      await token(
        jsonReq("http://localhost:3000/api/oauth/token", {
          grant_type: "authorization_code",
          code,
          code_verifier: VERIFIER,
          client_id: clientId,
          redirect_uri: REDIRECT,
        }),
      )
    ).json();

    const refreshed = await token(
      jsonReq("http://localhost:3000/api/oauth/token", {
        grant_type: "refresh_token",
        refresh_token: first.refresh_token,
      }),
    );
    expect(refreshed.status).toBe(200);
    const r = await refreshed.json();
    expect(r.access_token).toBeTruthy();
    expect(r.access_token).not.toBe(first.access_token);

    // The old refresh token is now revoked.
    const reuse = await token(
      jsonReq("http://localhost:3000/api/oauth/token", {
        grant_type: "refresh_token",
        refresh_token: first.refresh_token,
      }),
    );
    expect(reuse.status).toBe(400);
  });

  it("rejects an unregistered redirect_uri and unknown client", async () => {
    const clientId = await registerClient();
    const bad = await authorize(
      new Request(authorizeUrl(clientId, { redirect_uri: "https://evil.test/cb" })),
    );
    expect(bad.status).toBe(400);
    const unknown = await authorize(new Request(authorizeUrl("nope")));
    expect(unknown.status).toBe(400);
  });

  it("rejects authorize without PKCE", async () => {
    const clientId = await registerClient();
    const u = new URL(authorizeUrl(clientId));
    u.searchParams.delete("code_challenge");
    const res = await authorize(new Request(u.toString()));
    // Redirects back to the client with error=invalid_request.
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("invalid_request");
  });

  it("register rejects missing redirect_uris", async () => {
    const res = await register(
      jsonReq("http://localhost:3000/api/oauth/register", { client_name: "X" }),
    );
    expect(res.status).toBe(400);
  });
});
