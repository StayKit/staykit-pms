"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import {
  createRoomTypeAction,
  createRoomAction,
  deleteRoomAction,
  deleteRoomTypeAction,
  setCleanlinessAction,
} from "@/lib/actions/rooms";

export interface RoomTypeRow {
  id: string;
  name: string;
  baseRateRupees: number;
  maxOccupancy: number;
  roomCount: number;
}
export interface RoomRow {
  id: string;
  name: string;
  number: string;
  typeName: string;
  active: boolean;
  cleanliness: string;
  occupant: { guestName: string; bookingId: string; checkedIn: boolean } | null;
}

const CLEAN_LABEL: Record<string, string> = {
  CLEAN: "Clean",
  DIRTY: "Dirty",
  IN_PROGRESS: "Cleaning",
  OUT_OF_ORDER: "Out of order",
};

export function RoomsManager({
  propertyId,
  roomTypes,
  rooms,
}: Readonly<{ propertyId: string; roomTypes: RoomTypeRow[]; rooms: RoomRow[] }>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // room type form
  const [tName, setTName] = useState("");
  const [tRate, setTRate] = useState("");
  const [tOcc, setTOcc] = useState("2");
  // room form
  const [rName, setRName] = useState("");
  const [rNum, setRNum] = useState("");
  const [rType, setRType] = useState(roomTypes[0]?.id ?? "");

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, okMsg?: string) {
    start(async () => {
      const res = await fn();
      setMsg(res.message ?? (res.ok ? (okMsg ?? "Done.") : "Something went wrong."));
      router.refresh();
    });
  }

  return (
    <>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h4 style={{ marginTop: 0 }}>Room types</h4>
        <div className="field-row thirds" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label>Type name</label>
            <input
              value={tName}
              placeholder="Deluxe Cottage"
              onChange={(e) => setTName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Base rate (₹/night)</label>
            <input value={tRate} inputMode="numeric" onChange={(e) => setTRate(e.target.value)} />
          </div>
          <div className="field">
            <label>Max occupancy</label>
            <input value={tOcc} inputMode="numeric" onChange={(e) => setTOcc(e.target.value)} />
          </div>
        </div>
        <button
          className="btn btn-primary"
          disabled={pending || !tName.trim() || !tRate}
          onClick={() =>
            run(async () => {
              const res = await createRoomTypeAction(propertyId, {
                name: tName,
                baseRateRupees: Number(tRate),
                maxOccupancy: Number(tOcc) || 2,
              });
              if (res.ok) {
                setTName("");
                setTRate("");
              }
              return res;
            }, "Room type added.")
          }
        >
          <Icon name="plus" className="icon-sm" /> Add type
        </button>

        <table className="tbl" style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Base rate</th>
              <th>Max</th>
              <th>Rooms</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {roomTypes.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="tabular">₹ {t.baseRateRupees.toLocaleString("en-IN")}</td>
                <td>{t.maxOccupancy}</td>
                <td>{t.roomCount}</td>
                <td>
                  <button
                    className="icon-btn"
                    aria-label="Delete type"
                    disabled={pending}
                    onClick={() => run(() => deleteRoomTypeAction(t.id), "Type removed.")}
                  >
                    <Icon name="trash" className="icon-sm" />
                  </button>
                </td>
              </tr>
            ))}
            {roomTypes.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  Add a room type to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginTop: 0 }}>Rooms</h4>
        <div className="field-row thirds" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label>Room name</label>
            <input
              value={rName}
              placeholder="Cottage 1"
              onChange={(e) => setRName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Number</label>
            <input value={rNum} placeholder="101" onChange={(e) => setRNum(e.target.value)} />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={rType} onChange={(e) => setRType(e.target.value)}>
              {roomTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          className="btn btn-primary"
          disabled={pending || !rName.trim() || !rType}
          onClick={() =>
            run(async () => {
              const res = await createRoomAction(propertyId, {
                name: rName,
                number: rNum,
                roomTypeId: rType,
              });
              if (res.ok) {
                setRName("");
                setRNum("");
              }
              return res;
            }, "Room added.")
          }
        >
          <Icon name="plus" className="icon-sm" /> Add room
        </button>

        <table className="tbl" style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>Room</th>
              <th>Type</th>
              <th>Tonight</th>
              <th>Housekeeping</th>
              <th>Status</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.number ? `${r.number} — ` : ""}
                  {r.name}
                </td>
                <td className="text-sm">{r.typeName}</td>
                <td>
                  {r.occupant ? (
                    <Link
                      href={`/bookings/${r.occupant.bookingId}`}
                      className="pill pill-brand"
                      style={{ textDecoration: "none" }}
                      title="View booking"
                    >
                      <Icon name={r.occupant.checkedIn ? "key" : "user"} className="icon-sm" />
                      {r.occupant.guestName}
                    </Link>
                  ) : (
                    <span className="pill pill-neutral">Vacant</span>
                  )}
                </td>
                <td>
                  <select
                    value={r.cleanliness}
                    disabled={pending}
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
                  {r.active ? (
                    <span className="pill pill-brand">Active</span>
                  ) : (
                    <span className="pill pill-neutral">Inactive</span>
                  )}
                </td>
                <td>
                  <button
                    className="icon-btn"
                    aria-label="Delete room"
                    disabled={pending}
                    onClick={() => run(() => deleteRoomAction(r.id), "Room removed.")}
                  >
                    <Icon name="trash" className="icon-sm" />
                  </button>
                </td>
              </tr>
            ))}
            {rooms.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No rooms yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && (
        <div className="dev-code" style={{ marginTop: 14 }}>
          {msg}
        </div>
      )}
    </>
  );
}
