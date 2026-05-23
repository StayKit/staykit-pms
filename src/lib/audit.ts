/**
 * Immutable audit log. Every meaningful state change writes a row; MCP-initiated
 * actions are tagged actorType="MCP" so the audit viewer can filter human vs AI.
 * The dashboard activity feed is a deduplicated view of these rows.
 */
import { prisma } from "./db";

export interface AuditInput {
  ownerId: string;
  actorType: "USER" | "MCP" | "SYSTEM" | "GUEST";
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  diff?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function writeAudit(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      ownerId: input.ownerId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      summary: input.summary ?? null,
      diff: input.diff ? JSON.stringify(input.diff) : null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function recentActivity(ownerId: string, limit = 8) {
  return prisma.auditLog.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
