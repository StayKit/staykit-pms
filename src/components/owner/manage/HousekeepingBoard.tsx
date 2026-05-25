"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Toast } from "@/components/Toast";
import { setCleanlinessAction, assignHousekeeperAction } from "@/lib/actions/rooms";

export interface HousekeepingRoom {
  id: string;
  name: string;
  number: string;
  typeName: string;
  cleanliness: string;
  cleanedAt: string | null;
  cleanedBy: string | null;
  housekeeperId: string | null;
  occupant: { guestName: string; bookingId: string; checkedIn: boolean } | null;
  departing: boolean;
  arriving: boolean;
}

const CLEAN_LABEL: Record<string, string> = {
  CLEAN: "Clean",
  DIRTY: "Dirty",
  IN_PROGRESS: "Cleaning",
  OUT_OF_ORDER: "Out of order",
};

const CLEAN_PILL: Record<string, string> = {
  CLEAN: "pill-checkedin",
  DIRTY: "pill-unpaid",
  IN_PROGRESS: "pill-tentative",
  OUT_OF_ORDER: "pill-neutral",
};

export function HousekeepingBoard({
  rooms,
  team,
}: Readonly<{
  rooms: HousekeepingRoom[];
  team: { id: string; name: string }[];
}>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, okMsg: string) {
    start(async () => {
      const res = await fn();
      setMsg(res.message ?? (res.ok ? okMsg : "Something went wrong."));
      router.refresh();
    });
  }

  // The morning turn: dirty rooms and rooms a guest is leaving today come first.
  const priority = [...rooms].sort((a, b) => score(b) - score(a));

  return (
    <>
      <div className="card" style={{ overflow: "hidden" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Room</th>
              <th>Tonight</th>
              <th>Cleanliness</th>
              <th>Assigned to</th>
              <th>Last cleaned</th>
            </tr>
          </thead>
          <tbody>
            {priority.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 550 }}>
                    {r.number ? `${r.number} — ` : ""}
                    {r.name}
                  </div>
                  <div className="text-xs text-muted">{r.typeName}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    {r.departing && <span className="pill pill-tentative">Departing</span>}
                    {r.arriving && <span className="pill pill-brand">Arriving</span>}
                  </div>
                </td>
                <td>
                  {r.occupant ? (
                    <Link
                      href={`/bookings/${r.occupant.bookingId}`}
                      className="pill pill-brand"
                      style={{ textDecoration: "none" }}
                    >
                      <Icon name={r.occupant.checkedIn ? "key" : "user"} className="icon-sm" />
                      {r.occupant.guestName}
                    </Link>
                  ) : (
                    <span className="pill pill-neutral">Vacant</span>
                  )}
                </td>
                <td>
                  <span className={"pill " + (CLEAN_PILL[r.cleanliness] ?? "pill-neutral")}>
                    {CLEAN_LABEL[r.cleanliness] ?? r.cleanliness}
                  </span>
                  <select
                    value={r.cleanliness}
                    disabled={pending}
                    style={{ marginTop: 6, display: "block" }}
                    onChange={(e) =>
                      run(
                        () =>
                          setCleanlinessAction(
                            r.id,
                            e.target.value as "CLEAN" | "DIRTY" | "IN_PROGRESS" | "OUT_OF_ORDER",
                          ),
                        "Housekeeping updated.",
                      )
                    }
                  >
                    {Object.entries(CLEAN_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={r.housekeeperId ?? ""}
                    disabled={pending}
                    onChange={(e) =>
                      run(
                        () => assignHousekeeperAction(r.id, e.target.value || null),
                        "Assignment updated.",
                      )
                    }
                  >
                    <option value="">Unassigned</option>
                    {team.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-sm text-muted">
                  {r.cleanedAt ? (
                    <>
                      {r.cleanedAt}
                      {r.cleanedBy ? <div className="text-xs">by {r.cleanedBy}</div> : null}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {rooms.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No rooms yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {msg && <Toast message={msg} onClose={() => setMsg(null)} />}
    </>
  );
}

function score(r: HousekeepingRoom): number {
  let s = 0;
  if (r.cleanliness === "DIRTY") s += 4;
  if (r.cleanliness === "IN_PROGRESS") s += 2;
  if (r.departing) s += 3;
  if (r.arriving) s += 1;
  return s;
}
