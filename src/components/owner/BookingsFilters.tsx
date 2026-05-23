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
];

export function BookingsFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const filter = sp.get("filter") ?? "all";
  const [q, setQ] = useState(sp.get("q") ?? "");

  function apply(next: { filter?: string; q?: string }) {
    const params = new URLSearchParams(sp.toString());
    if (next.filter !== undefined) {
      if (next.filter === "all") params.delete("filter");
      else params.set("filter", next.filter);
    }
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    router.push("/bookings?" + params.toString());
  }

  return (
    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
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
    </div>
  );
}
