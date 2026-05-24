import { NextResponse } from "next/server";
import { APP, MCP } from "@/lib/config";

// RFC 8414 — Authorization Server Metadata (OAuth 2.1 + PKCE). The
// /api/oauth/{register,authorize,token} endpoints implement Dynamic Client
// Registration, the PKCE-mandatory authorization-code flow, and refresh rotation.
// We issue opaque tokens (validated by RS-internal lookup), so no jwks_uri is published.
export function GET() {
  return NextResponse.json({
    issuer: APP.baseUrl,
    authorization_endpoint: `${APP.baseUrl}/api/oauth/authorize`,
    token_endpoint: `${APP.baseUrl}/api/oauth/token`,
    registration_endpoint: `${APP.baseUrl}/api/oauth/register`,
    scopes_supported: MCP.scopes,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
