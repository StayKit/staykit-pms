# StayKit MCP server

StayKit exposes management capabilities to AI assistants (Claude.ai) over the **Model Context
Protocol**, Streamable HTTP transport, at **`/mcp`**.

## Connect from Claude.ai

1. Claude.ai → **Customize → Connectors → Add custom connector**.
2. URL: `https://<your-staykit-host>/mcp`.
3. Approve the requested scopes in the browser.

Discovery metadata (advertised so clients can find the authorization server):

- `GET /.well-known/oauth-protected-resource` (RFC 9728)
- `GET /.well-known/oauth-authorization-server` (RFC 8414; advertises PKCE `S256`)

## Authentication

Tools require an OAuth 2.1 Bearer token. Tokens are stored **hashed** (`McpAccessToken.tokenHash`),
carry a `scopes` CSV (1:1 with RBAC permissions) and a `resource` (RFC 8707). The handler
(`src/app/mcp/route.ts`) validates the token, loads the user, enforces `active` + owner match, and
records every call to `McpAuditEntry`.

> In development (`NODE_ENV!=='production'` and not `REQUIRE_LOGIN=1`) the endpoint falls back to the
> demo owner with full scopes so the MCP Inspector works without the OAuth dance. This is **off in
> production**.

## JSON-RPC methods

`initialize`, `ping`, `tools/list`, `tools/call`. Example:

```bash
curl -X POST https://host/mcp \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"get_kpis","arguments":{"from":"2026-05-01","to":"2026-05-31"}}}'
```

## Tools

| Tool | Scope | Notes |
|---|---|---|
| `list_properties`, `get_property`, `list_rooms` | `properties:read` | |
| `check_availability` | `bookings:read` | rooms free for a date range |
| `list_bookings`, `get_booking` | `bookings:read` | |
| `search_guests` | `bookings:read` | phone partially redacted |
| `get_kpis` | `reports:read` | occupancy / ADR / RevPAR |
| `create_booking` | `bookings:write` | double-booking-safe; tagged `createdViaMcp` |
| `check_in`, `check_out` | `bookings:write` | |
| `cancel_booking` | `bookings:cancel` | releases room nights |
| `get_payment_status`, `create_payment_link` | `payments:read` | link send is a real side effect |
| `initiate_refund` | `payments:refund` | **human-in-the-loop**: returns `needsConfirmation` until `confirm:true` and owner approval |

## Roadmap

- Full OAuth 2.1 Authorization Code + PKCE flow at `/api/oauth/{authorize,token,register}` with
  Client ID Metadata Documents (CIMD) and EdDSA-signed JWTs published at `/.well-known/jwks.json`.
- Drop-in `@modelcontextprotocol/sdk` for resources & prompts (`daily_briefing`, `revenue_report`,
  `guest_outreach_draft`).
