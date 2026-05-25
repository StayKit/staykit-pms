"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Toast } from "@/components/Toast";
import {
  createRoomTypeAction,
  updateRoomTypeAction,
  createRoomAction,
  updateRoomAction,
  deleteRoomAction,
  deleteRoomTypeAction,
  setCleanlinessAction,
} from "@/lib/actions/rooms";

export interface RoomTypeRow {
  id: string;
  name: string;
  baseRateRupees: number;
  maxOccupancy: number;
  color: string;
  description: string;
  roomCount: number;
}
export interface RoomRow {
  id: string;
  name: string;
  number: string;
  typeName: string;
  roomTypeId: string;
  active: boolean;
  cleanliness: string;
  amenities: string[];
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
  const [editType, setEditType] = useState<string | null>(null);
  const [editRoom, setEditRoom] = useState<string | null>(null);

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
              <th>Colour</th>
              <th>Rooms</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {roomTypes.map((t) =>
              editType === t.id ? (
                <tr key={t.id}>
                  <td colSpan={6}>
                    <RoomTypeEditor
                      type={t}
                      pending={pending}
                      onCancel={() => setEditType(null)}
                      onSave={(patch) =>
                        run(async () => {
                          const res = await updateRoomTypeAction(t.id, patch);
                          if (res.ok) setEditType(null);
                          return res;
                        }, "Room type updated.")
                      }
                    />
                  </td>
                </tr>
              ) : (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="tabular">₹ {t.baseRateRupees.toLocaleString("en-IN")}</td>
                  <td>{t.maxOccupancy}</td>
                  <td>
                    <span
                      title={t.color}
                      style={{
                        display: "inline-block",
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: t.color,
                        border: "1px solid var(--line)",
                        verticalAlign: "middle",
                      }}
                    />
                  </td>
                  <td>{t.roomCount}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="icon-btn"
                      aria-label="Edit type"
                      disabled={pending}
                      onClick={() => setEditType(t.id)}
                    >
                      <Icon name="edit" className="icon-sm" />
                    </button>
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
              ),
            )}
            {roomTypes.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
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
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) =>
              editRoom === r.id ? (
                <tr key={r.id}>
                  <td colSpan={6}>
                    <RoomEditor
                      room={r}
                      roomTypes={roomTypes}
                      pending={pending}
                      onCancel={() => setEditRoom(null)}
                      onSave={(patch) =>
                        run(async () => {
                          const res = await updateRoomAction(r.id, patch);
                          if (res.ok) setEditRoom(null);
                          return res;
                        }, "Room updated.")
                      }
                    />
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td>
                    {r.number ? `${r.number} — ` : ""}
                    {r.name}
                    {r.amenities.length > 0 && (
                      <div className="text-xs text-muted">{r.amenities.join(" · ")}</div>
                    )}
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
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="icon-btn"
                      aria-label="Edit room"
                      disabled={pending}
                      onClick={() => setEditRoom(r.id)}
                    >
                      <Icon name="edit" className="icon-sm" />
                    </button>
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
              ),
            )}
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

      {msg && <Toast message={msg} onClose={() => setMsg(null)} />}
    </>
  );
}

function RoomTypeEditor({
  type,
  pending,
  onSave,
  onCancel,
}: Readonly<{
  type: RoomTypeRow;
  pending: boolean;
  onSave: (patch: {
    name: string;
    baseRateRupees: number;
    maxOccupancy: number;
    color: string;
    description: string;
  }) => void;
  onCancel: () => void;
}>) {
  const [name, setName] = useState(type.name);
  const [rate, setRate] = useState(String(type.baseRateRupees));
  const [occ, setOcc] = useState(String(type.maxOccupancy));
  const [color, setColor] = useState(type.color);
  const [description, setDescription] = useState(type.description);

  return (
    <div style={{ padding: "4px 0" }}>
      <div className="field-row thirds" style={{ alignItems: "flex-end" }}>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Base rate (₹)</label>
          <input value={rate} inputMode="numeric" onChange={(e) => setRate(e.target.value)} />
        </div>
        <div className="field">
          <label>Max occupancy</label>
          <input value={occ} inputMode="numeric" onChange={(e) => setOcc(e.target.value)} />
        </div>
      </div>
      <div className="field-row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ maxWidth: 120 }}>
          <label>Calendar colour</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div className="field">
          <label>Description (optional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          disabled={pending || !name.trim()}
          onClick={() =>
            onSave({
              name,
              baseRateRupees: Number(rate) || 0,
              maxOccupancy: Number(occ) || 1,
              color,
              description,
            })
          }
        >
          <Icon name="check" className="icon-sm" /> Save
        </button>
        <button className="btn btn-ghost btn-sm" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RoomEditor({
  room,
  roomTypes,
  pending,
  onSave,
  onCancel,
}: Readonly<{
  room: RoomRow;
  roomTypes: RoomTypeRow[];
  pending: boolean;
  onSave: (patch: {
    name: string;
    number: string;
    roomTypeId: string;
    amenities: string[];
    active: boolean;
  }) => void;
  onCancel: () => void;
}>) {
  const [name, setName] = useState(room.name);
  const [number, setNumber] = useState(room.number);
  const [roomTypeId, setRoomTypeId] = useState(room.roomTypeId);
  const [amenities, setAmenities] = useState(room.amenities.join(", "));
  const [active, setActive] = useState(room.active);

  return (
    <div style={{ padding: "4px 0" }}>
      <div className="field-row thirds" style={{ alignItems: "flex-end" }}>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Number</label>
          <input value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div className="field">
          <label>Type</label>
          <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)}>
            {roomTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>
          Amenities <span className="hint">(comma-separated, e.g. AC, WiFi, Balcony)</span>
        </label>
        <input value={amenities} onChange={(e) => setAmenities(e.target.value)} />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active (bookable)
      </label>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          disabled={pending || !name.trim()}
          onClick={() =>
            onSave({
              name,
              number,
              roomTypeId,
              amenities: amenities
                .split(",")
                .map((a) => a.trim())
                .filter(Boolean),
              active,
            })
          }
        >
          <Icon name="check" className="icon-sm" /> Save
        </button>
        <button className="btn btn-ghost btn-sm" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
