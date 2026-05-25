"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "today", label: "Arriving today" },
  { id: "unpaid", label: "Unpaid" },
  { id: "tentative", label: "Tentative" },
  { id: "checkedin", label: "Checked in" },
  { id: "foreign", label: "Foreign guests" },
  { id: "cancelreq", label: "Cancellation requests" },
];

export function BookingsFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const filter = sp.get("filter") ?? "all";
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  function apply(next: { filter?: string; q?: string; from?: string; to?: string }) {
    const params = new URLSearchParams(sp.toString());
    if (next.filter !== undefined) {
      if (next.filter === "all") params.delete("filter");
      else params.set("filter", next.filter);
    }
    for (const key of ["q", "from", "to"] as const) {
      const v = next[key];
      if (v === undefined) continue;
      if (v) params.set(key, v);
      else params.delete(key);
    }
    // Any filter/search change invalidates the current page offset.
    params.delete("page");
    router.push("/bookings?" + params.toString());
  }

  return (
    <div
      style={{
        padding: "14px 16px",
        borderBottom: "1px solid var(--line)",
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q });
        }}
      >
        <Icon name="search" className="icon" />
        <input
          placeholder="Search by guest, phone, or booking ID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>
      <div className="chips" style={{ marginLeft: 4 }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={"chip" + (filter === f.id ? " selected" : "")}
            onClick={() => apply({ filter: f.id })}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div
        style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}
        title="Filter by check-in date"
      >
        <span className="text-xs text-muted">Check-in</span>
        <input
          type="date"
          className="date-input"
          value={from}
          max={to || undefined}
          onChange={(e) => {
            setFrom(e.target.value);
            apply({ from: e.target.value });
          }}
        />
        <span className="text-xs text-muted">→</span>
        <input
          type="date"
          className="date-input"
          value={to}
          min={from || undefined}
          onChange={(e) => {
            setTo(e.target.value);
            apply({ to: e.target.value });
          }}
        />
        {(from || to) && (
          <button
            className="link-btn"
            onClick={() => {
              setFrom("");
              setTo("");
              apply({ from: "", to: "" });
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
