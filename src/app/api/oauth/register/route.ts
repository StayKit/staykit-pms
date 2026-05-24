/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591). Public clients (PKCE, no secret).
 * Used by Claude.ai when an owner adds the custom connector. The new client is bound
 * to the demo/first owner for a self-hosted deployment.
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { MCP } from "@/lib/config";
import { narrowScopes } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: {
    client_name?: string;
    redirect_uris?: string[];
    scope?: string;
    token_endpoint_auth_method?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (redirectUris.length === 0 || !redirectUris.every((u) => /^https?:\/\//.test(u))) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris must be absolute URLs" },
      { status: 400 },
    );
  }

  // Bind to the first owner (single-owner self-host).
  const owner = await prisma.owner.findFirst({ orderBy: { createdAt: "asc" } });
  if (!owner) return NextResponse.json({ error: "server_error" }, { status: 500 });

  const scopes = narrowScopes(body.scope ?? null, MCP.scopes.join(","));
  const clientId = `mcp_${randomBytes(12).toString("hex")}`;
  const client = await prisma.mcpOAuthClient.create({
    data: {
      ownerId: owner.id,
      clientId,
      clientName: body.client_name?.slice(0, 120) || "MCP Client",
      redirectUris: JSON.stringify(redirectUris),
      scopes: scopes || MCP.scopes.join(","),
    },
  });

  return NextResponse.json(
    {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: client.scopes.split(",").join(" "),
    },
    { status: 201 },
  );
}
