"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Toast } from "@/components/Toast";
import { createRatePlanAction, deleteRatePlanAction } from "@/lib/actions/rateplans";

function isoPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Starter templates so a first-time host isn't staring at a blank form (audit P2 #21). */
const STARTERS = [
  {
    label: "Weekend",
    name: "Weekend rate",
    priority: 20,
    from: isoPlus(0),
    to: isoPlus(120),
    minStay: 1,
  },
  {
    label: "Festive season",
    name: "Festive season",
    priority: 30,
    from: isoPlus(0),
    to: isoPlus(30),
    minStay: 2,
  },
  {
    label: "Off-season",
    name: "Off-season",
    priority: 10,
    from: isoPlus(0),
    to: isoPlus(90),
    minStay: 1,
  },
];

export interface RatePlanRow {
  id: string;
  name: string;
  priority: number;
  startDate: string;
  endDate: string;
  minStay: number;
  overrides: { typeName: string; rupees: number }[];
}

export function RatePlansManager({
  propertyId,
  plans,
  roomTypes,
}: Readonly<{
  propertyId: string;
  plans: RatePlanRow[];
  roomTypes: { id: string; name: string }[];
}>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [priority, setPriority] = useState("10");
  const [minStay, setMinStay] = useState("1");
  const [ovr, setOvr] = useState<Record<string, string>>({});

  // Priority ties make which-plan-wins ambiguous (audit P2 #21): flag them.
  const priorityCounts = new Map<number, number>();
  for (const p of plans) priorityCounts.set(p.priority, (priorityCounts.get(p.priority) ?? 0) + 1);
  const conflicts = plans.filter((p) => (priorityCounts.get(p.priority) ?? 0) > 1);

  function applyStarter(s: (typeof STARTERS)[number]) {
    setName(s.name);
    setPriority(String(s.priority));
    setStart(s.from);
    setEnd(s.to);
    setMinStay(String(s.minStay));
  }

  function create() {
    start(async () => {
      const overrides = roomTypes
        .filter((t) => ovr[t.id] && Number(ovr[t.id]) > 0)
        .map((t) => ({ roomTypeId: t.id, amountRupees: Number(ovr[t.id]) }));
      const res = await createRatePlanAction(propertyId, {
        name,
        startDate,
        endDate,
        priority: Number(priority) || 0,
        minStay: Number(minStay) || 1,
        overrides,
      });
      setMsg(res.message ?? (res.ok ? "Rate plan created." : "Could not create plan."));
      if (res.ok) {
        setName("");
        setStart("");
        setEnd("");
        setOvr({});
      }
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <h4 style={{ marginTop: 0 }}>New rate plan</h4>
      <div className="chips" style={{ marginBottom: 12 }}>
        <span className="text-xs text-muted" style={{ alignSelf: "center", marginRight: 4 }}>
          Start from:
        </span>
        {STARTERS.map((s) => (
          <button key={s.label} type="button" className="chip" onClick={() => applyStarter(s)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="field-row">
        <div className="field">
          <label>Name</label>
          <input
            value={name}
            placeholder="Diwali Special"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Priority (higher wins)</label>
          <input
            value={priority}
            inputMode="numeric"
            onChange={(e) => setPriority(e.target.value)}
          />
        </div>
      </div>
      <div className="field-row thirds">
        <div className="field">
          <label>Valid from</label>
          <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label>Valid to</label>
          <input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="field">
          <label>Min stay (nights)</label>
          <input value={minStay} inputMode="numeric" onChange={(e) => setMinStay(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Per-room-type rates (₹/night) — leave blank to use base rate</label>
        <div className="field-row thirds">
          {roomTypes.map((t) => (
            <div className="field" key={t.id}>
              <label style={{ fontWeight: 400 }}>{t.name}</label>
              <input
                value={ovr[t.id] ?? ""}
                inputMode="numeric"
                onChange={(e) => setOvr((o) => ({ ...o, [t.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </div>
      <button
        className="btn btn-primary"
        disabled={pending || !name.trim() || !startDate || !endDate}
        onClick={create}
      >
        <Icon name="plus" className="icon-sm" /> Create plan
      </button>

      {conflicts.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "var(--st-tentative-bg, var(--surface-2))",
            border: "1px solid var(--st-tentative, var(--line))",
            fontSize: 13,
          }}
        >
          <Icon name="alert" className="icon-sm" /> Two or more plans share the same priority (
          {[...new Set(conflicts.map((c) => c.priority))].join(", ")}). When ranges overlap, which
          one applies is ambiguous — give the plan you want to win a higher priority.
        </div>
      )}

      <table className="tbl" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Plan</th>
            <th>Dates</th>
            <th>Priority</th>
            <th>Overrides</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td className="text-sm">
                {p.startDate} → {p.endDate}
              </td>
              <td>
                {p.priority}
                {(priorityCounts.get(p.priority) ?? 0) > 1 && (
                  <span
                    className="pill pill-tentative"
                    style={{ marginLeft: 6 }}
                    title="Another plan shares this priority"
                  >
                    tie
                  </span>
                )}
              </td>
              <td className="text-sm">
                {p.overrides.length
                  ? p.overrides
                      .map((o) => `${o.typeName} ₹${o.rupees.toLocaleString("en-IN")}`)
                      .join(", ")
                  : "base rate"}
              </td>
              <td>
                <button
                  className="icon-btn"
                  aria-label="Delete plan"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await deleteRatePlanAction(p.id);
                      router.refresh();
                    })
                  }
                >
                  <Icon name="trash" className="icon-sm" />
                </button>
              </td>
            </tr>
          ))}
          {plans.length === 0 && (
            <tr>
              <td colSpan={5} className="empty">
                No rate plans — bookings use each room type&apos;s base rate.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {msg && <Toast message={msg} onClose={() => setMsg(null)} />}
    </div>
  );
}
