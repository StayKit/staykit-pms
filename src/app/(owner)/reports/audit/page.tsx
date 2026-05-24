import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string; actorType?: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "USER", label: "Staff", actorType: "USER" },
  { key: "MCP", label: "Claude (AI)", actorType: "MCP" },
  { key: "SYSTEM", label: "System", actorType: "SYSTEM" },
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string }>;
}) {
  const ctx = (await getAppContext())!;
  const { actor = "all" } = await searchParams;
  const filter = FILTERS.find((f) => f.key === actor) ?? FILTERS[0];

  const rows = await prisma.auditLog.findMany({
    where: { ownerId: ctx.ownerId, ...(filter.actorType ? { actorType: filter.actorType } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Audit log</h2>
          <div className="sub">Every state change, attributed to a person, the system, or AI.</div>
        </div>
      </div>

      <div className="chips" style={{ marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/reports/audit?actor=${f.key}`}
            className={"chip" + (f.key === filter.key ? " selected" : "")}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Who</th>
              <th>What</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>
                  <span
                    className="activity-dot"
                    style={{
                      background: a.actorType === "MCP" ? "#7565B0" : "var(--brand)",
                      width: 26,
                      height: 26,
                    }}
                  >
                    <Icon name={a.actorType === "MCP" ? "sparkles" : "user"} className="icon-sm" />
                  </span>
                </td>
                <td>
                  <div className="name">{a.actorName ?? a.actorType}</div>
                  <div className="sub">{a.actorType}</div>
                </td>
                <td className="text-sm">{a.summary ?? a.action}</td>
                <td className="text-sm text-muted tabular">
                  {a.createdAt.toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  No activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
