import { describe, it, expect } from "vitest";
import { GET as protectedResource } from "./oauth-protected-resource/route";
import { GET as authServer } from "./oauth-authorization-server/route";
import { MCP, APP } from "@/lib/config";

describe("/.well-known/oauth-protected-resource (RFC 9728)", () => {
  it("points clients at the AS and advertises the MCP scopes", async () => {
    const body = await protectedResource().json();
    expect(body.resource).toBe(`${APP.baseUrl}/mcp`);
    expect(body.authorization_servers).toEqual([APP.baseUrl]);
    expect(body.scopes_supported).toEqual(MCP.scopes);
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });
});

describe("/.well-known/oauth-authorization-server (RFC 8414)", () => {
  it("advertises PKCE S256 and the OAuth endpoints", async () => {
    const body = await authServer().json();
    expect(body.issuer).toBe(APP.baseUrl);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(body.authorization_endpoint).toContain("/api/oauth/authorize");
    expect(body.token_endpoint).toContain("/api/oauth/token");
    expect(body.grant_types_supported).toContain("authorization_code");
  });
});
