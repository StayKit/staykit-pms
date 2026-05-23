import { NextResponse } from "next/server";
import { APP, MCP } from "@/lib/config";

// RFC 9728 — Protected Resource Metadata. Points MCP clients at the AS.
export function GET() {
  return NextResponse.json({
    resource: `${APP.baseUrl}/mcp`,
    authorization_servers: [APP.baseUrl],
    scopes_supported: MCP.scopes,
    bearer_methods_supported: ["header"],
    resource_documentation: `${APP.baseUrl}/docs/mcp`,
  });
}
