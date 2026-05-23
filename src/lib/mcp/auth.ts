/**
 * Resolve the MCP request context from the OAuth 2.1 Bearer token. Tokens are
 * stored hashed in McpAccessToken; scopes come from the token (1:1 with RBAC).
 *
 * Dev convenience: when no token is presented and NODE_ENV!=='production', we fall
 * back to the demo owner with full scopes so the MCP Inspector and Claude.ai work
 * locally before the OAuth flow is wired. Set REQUIRE_LOGIN=1 to disable.
 */
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { MCP } from "../config";
import type { McpContext } from "./tools";

export async function resolveMcpContext(req: Request): Promise<McpContext | null> {
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;

  if (bearer) {
    const tokenHash = createHash("sha256").update(bearer).digest("hex");
    const token = await prisma.mcpAccessToken.findUnique({
      where: { tokenHash },
      include: { client: true },
    });
    if (token && !token.revokedAt && token.expiresAt > new Date()) {
      const user = await prisma.user.findUnique({
        where: { id: token.userId },
        include: { propertyScopes: true },
      });
      if (user?.active) {
        await prisma.mcpAccessToken.update({
          where: { id: token.id },
          data: { lastUsedAt: new Date() },
        });
        return {
          ownerId: user.ownerId,
          userId: user.id,
          name: user.name,
          scopes: token.scopes.split(",").map((s) => s.trim()),
          propertyScopes: user.role === "OWNER" ? [] : user.propertyScopes.map((s) => s.propertyId),
        };
      }
    }
    return null;
  }

  // Dev fallback.
  if (process.env.NODE_ENV !== "production" && process.env.REQUIRE_LOGIN !== "1") {
    const user = await prisma.user.findFirst({
      where: { role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    if (user) {
      return {
        ownerId: user.ownerId,
        userId: user.id,
        name: user.name,
        scopes: [...MCP.scopes],
        propertyScopes: [],
      };
    }
  }
  return null;
}
