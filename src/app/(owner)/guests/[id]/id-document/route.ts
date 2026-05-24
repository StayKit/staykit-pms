/**
 * Serve a guest's decrypted ID document. Sensitive: requires the team:manage
 * permission and writes an AuditLog row on every view (§A.4 guest profile). Full
 * step-up OTP re-auth is a documented future hardening.
 */
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { can } from "@/lib/rbac/policy";
import { readStoredFile } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAppContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  if (!can(ctx.role, "team:manage")) return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const guest = await prisma.guest.findFirst({ where: { id, ownerId: ctx.ownerId } });
  if (!guest?.idFileId) return new Response("No document on file", { status: 404 });

  const file = await prisma.fileUpload.findUnique({ where: { id: guest.idFileId } });
  if (!file) return new Response("Not found", { status: 404 });

  const bytes = await readStoredFile(file.id, ctx.ownerId);
  await writeAudit({
    ownerId: ctx.ownerId,
    actorType: "USER",
    actorId: ctx.userId,
    actorName: ctx.name,
    action: "GUEST_ID_VIEWED",
    entityType: "Guest",
    entityId: id,
    summary: `viewed ID document for ${guest.name}`,
  });

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": file.mime, "cache-control": "no-store" },
  });
}
