/**
 * OAuth 2.1 token endpoint. Supports authorization_code (with mandatory PKCE) and
 * refresh_token (with rotation). Issues opaque tokens stored hashed in McpAccessToken;
 * resolveMcpContext validates them on each MCP call.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { APP, MCP } from "@/lib/config";
import { verifyAuthCode, verifyPkce, newOpaqueToken, hashToken } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

function oauthError(error: string, description?: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status });
}

async function readParams(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await req.json()) as Record<string, string>;
  }
  const form = await req.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

async function issueTokens(clientRowId: string, userId: string, scopes: string, resource: string) {
  const access = newOpaqueToken();
  const refresh = newOpaqueToken();
  const now = Date.now();
  await prisma.mcpAccessToken.create({
    data: {
      clientId: clientRowId,
      userId,
      scopes,
      tokenHash: access.hash,
      refreshHash: refresh.hash,
      expiresAt: new Date(now + MCP.accessTokenTtlMinutes * 60_000),
      refreshExpiresAt: new Date(now + MCP.refreshTokenTtlDays * 86_400_000),
      resource,
    },
  });
  return {
    access_token: access.token,
    token_type: "Bearer",
    expires_in: MCP.accessTokenTtlMinutes * 60,
    refresh_token: refresh.token,
    scope: scopes.split(",").join(" "),
  };
}

export async function POST(req: Request) {
  let params: Record<string, string>;
  try {
    params = await readParams(req);
  } catch {
    return oauthError("invalid_request", "Unparseable body");
  }

  const grantType = params.grant_type;

  if (grantType === "authorization_code") {
    const { code, code_verifier, redirect_uri, client_id } = params;
    if (!code || !code_verifier || !client_id) return oauthError("invalid_request");
    const payload = verifyAuthCode(code);
    if (!payload) return oauthError("invalid_grant", "Code expired or invalid");
    if (payload.clientId !== client_id) return oauthError("invalid_grant", "Client mismatch");
    if (redirect_uri && payload.redirectUri !== redirect_uri) {
      return oauthError("invalid_grant", "redirect_uri mismatch");
    }
    if (!verifyPkce(code_verifier, payload.codeChallenge)) {
      return oauthError("invalid_grant", "PKCE verification failed");
    }
    const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId: client_id } });
    if (!client || client.revokedAt) return oauthError("invalid_client");
    return NextResponse.json(
      await issueTokens(client.id, payload.userId, payload.scopes, payload.resource),
    );
  }

  if (grantType === "refresh_token") {
    const { refresh_token } = params;
    if (!refresh_token) return oauthError("invalid_request");
    const existing = await prisma.mcpAccessToken.findUnique({
      where: { refreshHash: hashToken(refresh_token) },
    });
    if (
      !existing ||
      existing.revokedAt ||
      !existing.refreshExpiresAt ||
      existing.refreshExpiresAt < new Date()
    ) {
      return oauthError("invalid_grant", "Refresh token expired or invalid");
    }
    // Rotate: revoke the old token, issue a fresh pair.
    await prisma.mcpAccessToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json(
      await issueTokens(
        existing.clientId,
        existing.userId,
        existing.scopes,
        existing.resource || `${APP.baseUrl}/mcp`,
      ),
    );
  }

  return oauthError("unsupported_grant_type");
}
