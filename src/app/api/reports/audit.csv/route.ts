import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { ymd } from "@/lib/dates";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Audit-log export for dispute resolution / compliance (audit P2 #28). */
export async function GET() {
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const rows = await prisma.auditLog.findMany({
    where: { ownerId: ctx.ownerId },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const header = ["timestamp", "actorType", "actor", "action", "entityType", "entityId", "summary"];
  const out = rows.map((r) => [
    r.createdAt.toISOString(),
    r.actorType,
    r.actorName ?? "",
    r.action,
    r.entityType ?? "",
    r.entityId ?? "",
    r.summary ?? "",
  ]);

  const csv = [header, ...out].map((r) => r.map(csvCell).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="staykit-audit-${ymd(new Date())}.csv"`,
    },
  });
}
