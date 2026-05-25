"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import {
  createChannelAction,
  toggleChannelAction,
  updateChannelAction,
} from "@/lib/actions/channels";

export interface ChannelRow {
  id: string;
  key: string;
  name: string;
  color: string;
  active: boolean;
}

export function ChannelsManager({ channels }: Readonly<{ channels: ChannelRow[] }>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3D5A80");
  const [msg, setMsg] = useState<string | null>(null);

  function add() {
    start(async () => {
      const res = await createChannelAction({ name, color });
      setMsg(res.message ?? (res.ok ? "Channel added." : "Could not add channel."));
      if (res.ok) setName("");
      router.refresh();
    });
  }

  return (
    <div className="card">
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>New channel</label>
          <input
            value={name}
            placeholder="e.g. Trip Advisor"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field" style={{ width: 130 }}>
          <label>Colour</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: 40, height: 34, padding: 2 }}
            />
            <span className="text-xs tabular text-muted">{color.toUpperCase()}</span>
          </div>
        </div>
        <button className="btn btn-primary" disabled={pending || !name.trim()} onClick={add}>
          <Icon name="plus" className="icon-sm" /> Add
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Channel</th>
              <th>Key</th>
              <th>Status</th>
              <th style={{ width: 110 }}></th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id}>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="color"
                      value={c.color}
                      title="Click to change this channel's colour"
                      disabled={pending}
                      style={{
                        width: 22,
                        height: 22,
                        padding: 0,
                        border: "1px solid var(--line)",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                      onChange={(e) =>
                        start(async () => {
                          await updateChannelAction(c.id, { name: c.name, color: e.target.value });
                          router.refresh();
                        })
                      }
                    />
                    {c.name}
                  </span>
                </td>
                <td className="text-sm tabular">{c.key}</td>
                <td>
                  {c.active ? (
                    <span className="pill pill-brand">Active</span>
                  ) : (
                    <span className="pill pill-neutral">Hidden</span>
                  )}
                </td>
                <td>
                  <button
                    className="btn btn-sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await toggleChannelAction(c.id);
                        router.refresh();
                      })
                    }
                  >
                    {c.active ? "Hide" : "Show"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && (
        <div className="dev-code" style={{ margin: 14 }}>
          {msg}
        </div>
      )}
    </div>
  );
}
