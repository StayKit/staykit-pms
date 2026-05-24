/**
 * OAuth 2.1 authorization endpoint (RFC 9700 / MCP 2025-11-25). PKCE is mandatory.
 * The owner must be signed in (staff session); in non-production we fall back to the
 * demo owner so the flow works locally, matching the rest of the app (REQUIRE_LOGIN=1
 * disables the fallback). On success we issue a short-lived stateless auth code and
 * 302 back to the client's redirect_uri.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { APP } from "@/lib/config";
import { getStaffSession } from "@/lib/auth/session";
import { signAuthCode, narrowScopes } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

function errorRedirect(redirectUri: string, error: string, state: string | null) {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  if (state) u.searchParams.set("state", state);
  return NextResponse.redirect(u.toString());
}

async function subjectUserId(ownerId: string): Promise<string | null> {
  // cookies() throws if there's no request scope (e.g. unit tests calling the handler
  // directly) — treat that as "no session" and fall through to the dev fallback.
  const session = await getStaffSession().catch(() => null);
  if (session && session.ownerId === ownerId) return session.userId;
  if (process.env.NODE_ENV !== "production" && process.env.REQUIRE_LOGIN !== "1") {
    const owner = await prisma.user.findFirst({
      where: { ownerId, role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    return owner?.id ?? null;
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const responseType = p.get("response_type");
  const clientId = p.get("client_id");
  const redirectUri = p.get("redirect_uri");
  const state = p.get("state");
  const codeChallenge = p.get("code_challenge");
  const codeChallengeMethod = p.get("code_challenge_method");
  const resource = p.get("resource") ?? `${APP.baseUrl}/mcp`;

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId } });
  if (!client || client.revokedAt) {
    return NextResponse.json({ error: "unauthorized_client" }, { status: 400 });
  }
  // Validate redirect_uri against the registered set BEFORE redirecting errors back.
  let registered: string[] = [];
  try {
    registered = JSON.parse(client.redirectUris);
  } catch {
    registered = [];
  }
  if (!registered.includes(redirectUri)) {
    return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }

  if (responseType !== "code")
    return errorRedirect(redirectUri, "unsupported_response_type", state);
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return errorRedirect(redirectUri, "invalid_request", state); // PKCE S256 required
  }

  const scopes = narrowScopes(p.get("scope"), client.scopes);
  if (!scopes) return errorRedirect(redirectUri, "invalid_scope", state);

  const userId = await subjectUserId(client.ownerId);
  if (!userId) {
    // Send the owner to sign in, then back to this exact authorize request.
    const signin = new URL("/signin", APP.baseUrl);
    signin.searchParams.set("next", url.pathname + url.search);
    return NextResponse.redirect(signin.toString());
  }

  const code = signAuthCode({
    clientId: client.clientId,
    userId,
    scopes,
    redirectUri,
    codeChallenge,
    resource,
  });
  const back = new URL(redirectUri);
  back.searchParams.set("code", code);
  if (state) back.searchParams.set("state", state);
  return NextResponse.redirect(back.toString());
}
