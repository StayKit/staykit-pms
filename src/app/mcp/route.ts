/**
 * MCP Streamable HTTP endpoint (JSON-RPC 2.0 over POST). Implements the subset
 * Claude.ai needs: initialize, tools/list, tools/call, ping. OAuth 2.1 Bearer auth
 * is enforced via resolveMcpContext; every tool call is written to McpAuditEntry.
 *
 * Full spec target: MCP 2025-11-25. The official @modelcontextprotocol/sdk can be
 * dropped in later; this hand-rolled handler keeps v1 dependency-light and is enough
 * for tools/list + tools/call conformance.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { APP } from "@/lib/config";
import { prisma } from "@/lib/db";
import { TOOLS, getTool, ScopeError, type McpContext } from "@/lib/mcp/tools";
import { listResources, readResource, RESOURCE_TEMPLATES } from "@/lib/mcp/resources";
import { PROMPTS, getPrompt } from "@/lib/mcp/prompts";
import { resolveMcpContext } from "@/lib/mcp/auth";
import { enforceRateLimit, RateLimitError } from "@/lib/mcp/ratelimit";

export const dynamic = "force-dynamic";

/** Per-token key for rate limiting: hash of the bearer (shared "dev" bucket when none). */
function tokenKey(req: Request): string {
  const auth = req.headers.get("authorization") ?? "dev-fallback";
  return createHash("sha256").update(auth).digest("hex");
}

const PROTOCOL_VERSION = "2025-11-25";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}
function rpcError(id: unknown, code: number, message: string, status = 200) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status },
  );
}

function unauthorized() {
  // RFC 9728: point clients at the protected-resource metadata.
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${APP.baseUrl}/.well-known/oauth-protected-resource"`,
      },
    },
  );
}

export async function POST(req: Request) {
  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  // initialize/ping are allowed before auth so clients can negotiate.
  if (body.method === "initialize") {
    return rpcResult(body.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
        prompts: { listChanged: false },
      },
      serverInfo: { name: "StayKit", version: "0.1.0" },
    });
  }
  if (body.method === "ping") return rpcResult(body.id, {});
  if (body.method === "notifications/initialized") return new NextResponse(null, { status: 202 });

  const ctx = await resolveMcpContext(req);
  if (!ctx) return unauthorized();

  if (body.method === "tools/list") {
    return rpcResult(body.id, {
      tools: TOOLS.filter((t) => ctx.scopes.includes(t.scope)).map((t) => ({
        name: t.name,
        description: t.description + (t.requiresApproval ? " (requires human approval)" : ""),
        inputSchema: t.jsonSchema,
        annotations: { destructiveHint: t.requiresApproval ?? false },
      })),
    });
  }

  if (body.method === "tools/call") {
    const params = body.params ?? {};
    const name = String(params.name ?? "");
    const args = (params.arguments as Record<string, unknown>) ?? {};
    const tool = getTool(name);
    if (!tool) return rpcError(body.id, -32602, `Unknown tool: ${name}`);

    const started = Date.now();
    try {
      enforceRateLimit(tokenKey(req), name);
      const parsed = tool.inputSchema.parse(args);
      const result = await tool.run(parsed as Record<string, unknown>, ctx);
      await audit(ctx, name, args, "OK", Date.now() - started);
      return rpcResult(body.id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      });
    } catch (e) {
      const status =
        e instanceof RateLimitError ? "LIMITED" : e instanceof ScopeError ? "DENIED" : "ERROR";
      await audit(ctx, name, args, status, Date.now() - started);
      // Tool/scope/rate errors are always Error instances (zod, ScopeError, domain errors).
      const message = (e as Error).message;
      // Tool errors are returned as result content with isError per MCP convention.
      return rpcResult(body.id, { content: [{ type: "text", text: message }], isError: true });
    }
  }

  if (body.method === "resources/list") {
    return rpcResult(body.id, {
      resources: await listResources(ctx),
      resourceTemplates: RESOURCE_TEMPLATES,
    });
  }

  if (body.method === "resources/read") {
    const uri = String(body.params?.uri ?? "");
    try {
      enforceRateLimit(tokenKey(req), "resources/read");
      const contents = await readResource(uri, ctx);
      return rpcResult(body.id, { contents: [contents] });
    } catch (e) {
      return rpcError(body.id, -32602, (e as Error).message);
    }
  }

  if (body.method === "prompts/list") {
    return rpcResult(body.id, { prompts: PROMPTS });
  }

  if (body.method === "prompts/get") {
    const name = String(body.params?.name ?? "");
    const args = (body.params?.arguments as Record<string, unknown>) ?? {};
    try {
      return rpcResult(body.id, getPrompt(name, args));
    } catch (e) {
      return rpcError(body.id, -32602, (e as Error).message);
    }
  }

  return rpcError(body.id, -32601, `Method not found: ${body.method}`);
}

// GET is used by Streamable HTTP for the optional SSE notification stream. We don't
// push server-initiated notifications in v1, so advertise the endpoint and return 405
// on stream upgrade attempts that we don't support.
export async function GET() {
  return new NextResponse("MCP Streamable HTTP endpoint. Use POST for JSON-RPC.", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

async function audit(
  ctx: McpContext,
  tool: string,
  args: Record<string, unknown>,
  status: string,
  durationMs: number,
) {
  await prisma.mcpAuditEntry
    .create({
      data: {
        userId: ctx.userId,
        tool,
        args: redact(args),
        status,
        durationMs,
      },
    })
    .catch(() => {});
}

/** Redact obvious PII before persisting tool args. */
function redact(args: Record<string, unknown>): string {
  const clone: Record<string, unknown> = { ...args };
  for (const k of ["guestPhone", "guestEmail", "phone", "email"]) {
    if (k in clone) clone[k] = "[redacted]";
  }
  return JSON.stringify(clone);
}
