import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { ChannelsManager } from "@/components/owner/manage/ChannelsManager";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const ctx = (await getAppContext())!;
  const channels = await prisma.channelSource.findMany({
    where: { ownerId: ctx.ownerId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Source channels</h2>
          <div className="sub">
            How you attribute each booking. Manual attribution, not OTA sync — by design.
          </div>
        </div>
      </div>
      <ChannelsManager
        channels={channels.map((c) => ({
          id: c.id,
          key: c.key,
          name: c.name,
          color: c.color,
          active: c.active,
        }))}
      />
    </div>
  );
}
