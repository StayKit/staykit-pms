import { getAppContext } from "@/lib/auth/context";
import { getKpis, sourceMix } from "@/lib/reports";
import { today, addDays } from "@/lib/dates";
import { inr } from "@/lib/money";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const ctx = (await getAppContext())!;
  const t0 = today();

  const [todayK, weekK, monthK, quarterK, mix] = await Promise.all([
    getKpis(ctx.ownerId, t0, addDays(t0, 1)),
    getKpis(ctx.ownerId, addDays(t0, -7), addDays(t0, 1)),
    getKpis(ctx.ownerId, addDays(t0, -30), addDays(t0, 1)),
    getKpis(ctx.ownerId, addDays(t0, -90), addDays(t0, 1)),
    sourceMix(ctx.ownerId, addDays(t0, -90), addDays(t0, 30)),
  ]);

  const cards = [
    { label: "Today", k: todayK },
    { label: "Last 7 days", k: weekK },
    { label: "Last 30 days", k: monthK },
    { label: "Last 90 days", k: quarterK },
  ];

  return (
    <div className="page" style={{ paddingTop: 16 }}>
      <div className="section-head" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: 22 }}>Reports</h2>
          <div className="sub">Performance and tax-ready summaries</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn">
            <Icon name="calendar" className="icon-sm" /> This month
          </button>
          <button className="btn">
            <Icon name="external" className="icon-sm" /> Export
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        {cards.map((c) => (
          <div key={c.label} className="kpi" style={{ cursor: "default" }}>
            <div className="label">
              <span className="dot" />
              {c.label}
            </div>
            <div className="value">
              <span
                style={{ fontSize: 20, color: "var(--muted)", marginRight: 2, fontWeight: 500 }}
              >
                ₹
              </span>
              <span className="tabular">{inr(c.k.roomRevenuePaise, false)}</span>
            </div>
            <div className="delta">
              Occupancy {c.k.occupancyPct}% · ADR {inr(c.k.adrPaise)}
            </div>
            <div className="accent-bar" />
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginTop: 24 }}>
        <div className="card card-padded">
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Key metrics (last 30 days)</h3>
          <div className="sub text-muted text-sm" style={{ marginTop: 2 }}>
            Plain definitions in tooltips
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 16,
              marginTop: 22,
            }}
          >
            <Metric
              label="Occupancy"
              value={`${monthK.occupancyPct}%`}
              hint="Room-nights sold ÷ available"
            />
            <Metric label="ADR" value={inr(monthK.adrPaise)} hint="Average price per room sold" />
            <Metric
              label="RevPAR"
              value={inr(monthK.revparPaise)}
              hint="Revenue per available room"
            />
            <Metric
              label="Room-nights sold"
              value={String(monthK.roomNightsSold)}
              hint="Across all properties"
            />
            <Metric
              label="Available"
              value={String(monthK.roomNightsAvailable)}
              hint="Room-nights on offer"
            />
            <Metric
              label="Room revenue"
              value={inr(monthK.roomRevenuePaise)}
              hint="Sum of nightly rates"
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Source mix</h3>
          </div>
          <div style={{ padding: "8px 20px 20px" }}>
            {mix.length === 0 && <div className="empty">No bookings in range.</div>}
            {mix.map((s) => (
              <div
                key={s.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                <div style={{ flex: 1, fontSize: 13.5 }}>{s.name}</div>
                <div
                  style={{
                    flex: "0 0 120px",
                    background: "var(--surface-2)",
                    height: 6,
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      background: s.color,
                      width: `${Math.min(100, s.pct * 2.5)}%`,
                      height: "100%",
                    }}
                  />
                </div>
                <div
                  className="tabular"
                  style={{ fontSize: 13, fontWeight: 550, width: 40, textAlign: "right" }}
                >
                  {s.pct}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="checklist-card" style={{ marginTop: 24 }}>
        <div className="icon-wrap">
          <Icon name="shield-check" className="icon" />
        </div>
        <div className="text">
          <div className="title">GST-ready revenue report</div>
          <div className="sub">
            5% GST on rooms ≤ ₹ 7,500/night · 18% above (SAC 996311). Email a copy to your CA.
          </div>
        </div>
        <button className="btn btn-primary">Email to CA</button>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div title={hint}>
      <div className="text-xs text-muted" style={{ fontWeight: 550 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 4 }}>
        {value}
      </div>
      <div className="text-xs text-muted" style={{ marginTop: 2 }}>
        {hint}
      </div>
    </div>
  );
}
