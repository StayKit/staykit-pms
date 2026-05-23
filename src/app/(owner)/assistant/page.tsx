import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { APP } from "@/lib/config";
import { TOOL_CATALOG } from "@/lib/mcp/tools";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function McpPage() {
  const ctx = (await getAppContext())!;

  const [client, token, recent] = await Promise.all([
    prisma.mcpOAuthClient.findFirst({ where: { ownerId: ctx.ownerId } }),
    prisma.mcpAccessToken.findFirst({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" } }),
    prisma.mcpAuditEntry.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);

  const endpoint = `${APP.baseUrl}/mcp`;

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22, display: "flex", alignItems: "center", gap: 10 }}>
            MCP for Claude.ai
            {token ? (
              <span className="pill pill-checkedin"><Icon name="shield-check" className="icon-sm" /> Connected</span>
            ) : (
              <span className="pill pill-tentative"><Icon name="alert" className="icon-sm" /> Not connected</span>
            )}
          </h2>
          <div className="sub">Let an AI assistant run your homestay from inside Claude.ai — securely.</div>
        </div>
        <a className="btn" href="https://claude.ai" target="_blank" rel="noreferrer">
          <Icon name="external" className="icon-sm" /> Open Claude.ai
        </a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20 }}>
        <div className="card">
          <div className="card-header"><h3>Server endpoint</h3></div>
          <div style={{ padding: "0 20px 16px" }}>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Streamable HTTP URL</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  readOnly
                  value={endpoint}
                  style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line-strong)", background: "var(--surface-2)" }}
                />
              </div>
              <div className="hint">In Claude.ai → Customize → Connectors → Add custom connector, paste this URL.</div>
            </div>

            {token && (
              <div className="field" style={{ marginTop: 12 }}>
                <label>Issued tokens</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "var(--surface-2)", borderRadius: 12 }}>
                  <div className="avatar purple" style={{ width: 32, height: 32, fontSize: 12 }}>C</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 550, fontSize: 13.5 }}>{client?.clientName ?? "Claude"}</div>
                    <div className="text-xs text-muted">
                      Last used {token.lastUsedAt ? rel(token.lastUsedAt) : "—"} · {token.scopes.split(",").length} scopes
                    </div>
                  </div>
                  <button className="btn btn-sm btn-ghost" style={{ color: "var(--st-unpaid)" }}>Revoke</button>
                </div>
              </div>
            )}
          </div>

          <div className="card-header" style={{ borderTop: "1px solid var(--line)" }}>
            <h3>Available tools</h3>
            <div className="sub" style={{ marginLeft: "auto" }}>{TOOL_CATALOG.length} tools · RBAC-enforced</div>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>Tool</th><th>OAuth scope</th><th>Behaviour</th></tr>
            </thead>
            <tbody>
              {TOOL_CATALOG.map((t) => (
                <tr key={t.name} style={{ cursor: "default" }}>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>{t.name}</td>
                  <td><span className="channel-chip">{t.scope}</span></td>
                  <td>
                    {t.requiresApproval ? (
                      <span className="pill pill-tentative"><Icon name="shield" className="icon-sm" /> Requires approval</span>
                    ) : (
                      <span className="pill pill-checkedin"><Icon name="check" className="icon-sm" /> Auto-allowed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Recent AI actions</h3>
            <div className="sub" style={{ marginLeft: "auto" }}>Audit slice</div>
          </div>
          <div style={{ padding: 8 }}>
            {recent.length === 0 && <div className="empty">No AI actions yet.</div>}
            {recent.map((a) => (
              <div key={a.id} style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: "#EEEAF7", color: "#5A4A85", display: "grid", placeItems: "center", flex: "0 0 26px" }}>
                    <Icon name="sparkles" className="icon-sm" />
                  </div>
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, fontWeight: 550 }}>{a.tool}</div>
                  <div style={{ marginLeft: "auto" }}>
                    {a.status === "OK" ? (
                      <span className="pill pill-checkedin"><Icon name="check" className="icon-sm" /> OK</span>
                    ) : (
                      <span className="pill pill-tentative"><Icon name="clock" className="icon-sm" /> {a.status}</span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginLeft: 36, marginTop: 4 }}>{a.args}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginLeft: 36, marginTop: 2 }}>{rel(a.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function rel(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
