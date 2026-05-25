import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { Icon } from "@/components/Icon";
import { AccountForm } from "@/components/owner/settings/AccountForm";

export const dynamic = "force-dynamic";

export default async function SettingsAccountPage() {
  const ctx = (await getAppContext())!;
  const owner = await prisma.owner.findUnique({ where: { id: ctx.ownerId } });
  const isOwner = ctx.role === "OWNER";

  return (
    <>
      <div>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Account</h3>
        <div className="sub">
          Your workspace profile and the session you&apos;re signed in with.
        </div>
      </div>

      <div className="card card-padded">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="avatar">
            {ctx.name
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0])
              .join("")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{ctx.name}</div>
            <div className="text-sm text-muted" style={{ textTransform: "capitalize" }}>
              {ctx.role.toLowerCase()}
              {ctx.demo ? " · demo session" : ""}
            </div>
          </div>
          <Link className="btn btn-sm" href="/signin">
            <Icon name="log-out" className="icon-sm" /> Sign out
          </Link>
        </div>
      </div>

      {!isOwner && (
        <div className="dev-code">
          Only the workspace owner can edit these details. You&apos;re signed in as{" "}
          {ctx.role.toLowerCase()}.
        </div>
      )}

      <AccountForm
        disabled={!isOwner}
        initial={{
          name: owner?.name ?? "",
          email: owner?.email ?? "",
          phone: owner?.phone ?? "",
        }}
      />
    </>
  );
}
