import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, string> = {
  SENT: "pill-checkedin",
  DELIVERED: "pill-checkedin",
  QUEUED: "pill-tentative",
  SENDING: "pill-tentative",
  FAILED: "pill-unpaid",
  DLQ: "pill-unpaid",
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "sent", label: "Delivered", statuses: ["SENT", "DELIVERED"] },
  { id: "pending", label: "Pending", statuses: ["QUEUED", "SENDING"] },
  { id: "failed", label: "Failed", statuses: ["FAILED", "DLQ"] },
];

function fmtTime(d: Date): string {
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function bodyOf(payload: string | null): string {
  if (!payload) return "";
  try {
    return JSON.parse(payload).body ?? "";
  } catch {
    return "";
  }
}

export default async function NotificationLogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = (await getAppContext())!;
  const { status = "all" } = await searchParams;
  const active = FILTERS.find((f) => f.id === status) ?? FILTERS[0];

  // Logs are owner-scoped via their booking's property, plus owner-template sends with
  // no booking (manual/test). NotificationLog has no template relation, so match by the
  // owner's template ids.
  const ownerTemplates = await prisma.notificationTemplate.findMany({
    where: { ownerId: ctx.ownerId },
    select: { id: true },
  });
  const where: Prisma.NotificationLogWhereInput = {
    OR: [
      { booking: { property: { ownerId: ctx.ownerId } } },
      { templateId: { in: ownerTemplates.map((t) => t.id) } },
    ],
    ...(active.statuses ? { status: { in: active.statuses as never } } : {}),
  };

  const logs = await prisma.notificationLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 150,
    include: {
      booking: { include: { guests: { where: { isPrimary: true }, include: { guest: true } } } },
    },
  });

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <Link href="/notifications" className="btn btn-sm" style={{ marginBottom: 8 }}>
            <Icon name="chevron-left" className="icon-sm" /> Notifications
          </Link>
          <h2 style={{ fontSize: 22 }}>Delivery log</h2>
          <div className="sub">Every message sent — recipient, status and content</div>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <div className="chips">
            {FILTERS.map((f) => (
              <Link
                key={f.id}
                href={f.id === "all" ? "/notifications/log" : `/notifications/log?status=${f.id}`}
                className={"chip" + (active.id === f.id ? " selected" : "")}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Message</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((n) => {
                const guest = n.booking?.guests[0]?.guest;
                const body = bodyOf(n.payload);
                return (
                  <tr key={n.id} style={{ cursor: "default" }}>
                    <td>
                      <div style={{ fontWeight: 550, fontSize: 13 }}>{guest?.name ?? "—"}</div>
                      <div className="text-muted text-xs tabular">{n.to}</div>
                    </td>
                    <td style={{ maxWidth: 380 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="channel-chip">{n.channel.toLowerCase()}</span>
                        <span className="text-xs text-muted">
                          {n.triggerKey.replaceAll("_", " ").toLowerCase()}
                        </span>
                      </div>
                      {body && (
                        <div
                          className="text-xs text-muted"
                          style={{
                            marginTop: 3,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={body}
                        >
                          {body}
                        </div>
                      )}
                      {n.lastError && (
                        <div
                          className="text-xs"
                          style={{ color: "var(--st-unpaid)", marginTop: 3 }}
                        >
                          {n.lastError}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={"pill " + (STATUS_PILL[n.status] ?? "pill-neutral")}>
                        {n.status.toLowerCase()}
                      </span>
                      {n.attempts > 1 && (
                        <div className="text-xs text-muted" style={{ marginTop: 2 }}>
                          {n.attempts} attempts
                        </div>
                      )}
                    </td>
                    <td className="text-sm text-muted">{fmtTime(n.sentAt ?? n.createdAt)}</td>
                  </tr>
                );
              })}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    No messages {active.id === "all" ? "yet" : `in "${active.label}"`}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
