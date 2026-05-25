import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { Icon } from "@/components/Icon";
import { ChannelsManager } from "@/components/owner/manage/ChannelsManager";

export const dynamic = "force-dynamic";

const OTA_KEYS = new Set(["airbnb", "booking", "mmt"]);

export default async function ChannelsPage() {
  const ctx = (await getAppContext())!;
  const channels = await prisma.channelSource.findMany({
    where: { ownerId: ctx.ownerId },
    orderBy: { name: "asc" },
  });
  const usesOta = channels.some((c) => c.active && OTA_KEYS.has(c.key));

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

      {usesOta && (
        <div
          className="card"
          style={{
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            background: "var(--st-tentative-bg, var(--surface-2))",
            border: "1px solid var(--st-tentative, var(--line))",
          }}
        >
          <Icon name="alert" className="icon" />
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <strong>Overbooking risk:</strong> StayKit does <em>not</em> sync availability with
            Airbnb, Booking.com or MakeMyTrip. When you take a booking here, block the same dates on
            those platforms (and vice-versa) yourself — otherwise the same room can be sold twice.
          </div>
        </div>
      )}

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
