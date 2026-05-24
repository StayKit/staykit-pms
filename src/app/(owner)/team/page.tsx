import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { TeamManager } from "@/components/owner/manage/TeamManager";
import type { Role } from "@/lib/rbac/policy";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const ctx = (await getAppContext())!;
  const [users, properties] = await Promise.all([
    prisma.user.findMany({
      where: { ownerId: ctx.ownerId },
      orderBy: { createdAt: "asc" },
      include: { propertyScopes: true },
    }),
    prisma.property.findMany({ where: { ownerId: ctx.ownerId }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Team</h2>
          <div className="sub">Owners, managers and front-desk staff. Login is by mobile OTP.</div>
        </div>
      </div>
      <TeamManager
        members={users.map((u) => ({
          id: u.id,
          name: u.name,
          phone: u.phone,
          role: u.role as Role,
          active: u.active,
          scopeIds: u.propertyScopes.map((s) => s.propertyId),
          isSelf: u.id === ctx.userId,
        }))}
        properties={properties.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  );
}
