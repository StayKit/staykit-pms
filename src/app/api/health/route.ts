import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, unknown> = {};
  let ok = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {
    checks.db = "error";
    ok = false;
  }
  try {
    checks.jobQueueDepth = await prisma.job.count({ where: { status: "QUEUED" } });
  } catch {
    checks.jobQueueDepth = null;
  }
  return NextResponse.json(
    { ok, time: new Date().toISOString(), checks },
    { status: ok ? 200 : 503 },
  );
}
