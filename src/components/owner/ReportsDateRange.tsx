"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";

export function ReportsDateRange() {
  const router = useRouter();
  const sp = useSearchParams();
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";

  function apply(next: { from?: string; to?: string }) {
    const params = new URLSearchParams(sp.toString());
    for (const key of ["from", "to"] as const) {
      const v = next[key];
      if (v === undefined) continue;
      if (v) params.set(key, v);
      else params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? "/reports?" + qs : "/reports");
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }} title="Custom reporting range">
      <input
        type="date"
        className="date-input"
        value={from}
        max={to || undefined}
        onChange={(e) => apply({ from: e.target.value })}
      />
      <span className="text-xs text-muted">→</span>
      <input
        type="date"
        className="date-input"
        value={to}
        min={from || undefined}
        onChange={(e) => apply({ to: e.target.value })}
      />
      {(from || to) && (
        <button className="link-btn" onClick={() => apply({ from: "", to: "" })}>
          <Icon name="x" className="icon-sm" /> Clear
        </button>
      )}
    </div>
  );
}
