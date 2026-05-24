"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import {
  createMaintenanceBlockAction,
  deleteMaintenanceBlockAction,
} from "@/lib/actions/rateplans";

export interface BlockRow {
  id: string;
  roomName: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export function MaintenanceManager({
  propertyId,
  blocks,
  rooms,
}: Readonly<{
  propertyId: string;
  blocks: BlockRow[];
  rooms: { id: string; label: string }[];
}>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [reason, setReason] = useState("");

  function create() {
    start(async () => {
      const res = await createMaintenanceBlockAction(propertyId, {
        roomId,
        startDate,
        endDate,
        reason,
      });
      setMsg(res.message ?? (res.ok ? "Block created." : "Could not block."));
      if (res.ok) {
        setStart("");
        setEnd("");
        setReason("");
      }
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <h4 style={{ marginTop: 0 }}>Block a room</h4>
      <div className="field-row thirds">
        <div className="field">
          <label>Room</label>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>From</label>
          <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label>To</label>
          <input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Reason</label>
        <input
          value={reason}
          placeholder="Repainting / owner use"
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <button
        className="btn btn-primary"
        disabled={pending || !roomId || !startDate || !endDate || !reason.trim()}
        onClick={create}
      >
        <Icon name="plus" className="icon-sm" /> Block room
      </button>

      <table className="tbl" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Room</th>
            <th>Dates</th>
            <th>Reason</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((b) => (
            <tr key={b.id}>
              <td>{b.roomName}</td>
              <td className="text-sm">
                {b.startDate} → {b.endDate}
              </td>
              <td className="text-sm">{b.reason}</td>
              <td>
                <button
                  className="icon-btn"
                  aria-label="Unblock"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await deleteMaintenanceBlockAction(b.id);
                      router.refresh();
                    })
                  }
                >
                  <Icon name="trash" className="icon-sm" />
                </button>
              </td>
            </tr>
          ))}
          {blocks.length === 0 && (
            <tr>
              <td colSpan={4} className="empty">
                No blocks. Rooms are available unless booked or blocked.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {msg && (
        <div className="dev-code" style={{ marginTop: 12 }}>
          {msg}
        </div>
      )}
    </div>
  );
}
