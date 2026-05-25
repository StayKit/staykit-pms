"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { updateMyBookingAction, requestCancellationAction } from "@/lib/actions/guest-portal";

export function GuestBookingActions({
  bookingId,
  initial,
  cancelRequested,
  cancellable,
}: Readonly<{
  bookingId: string;
  initial: { email: string; arrivalTime: string; requests: string };
  cancelRequested: boolean;
  cancellable: boolean;
}>) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function save() {
    start(async () => {
      const res = await updateMyBookingAction(bookingId, form);
      setMsg(res.message ?? null);
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function requestCancel() {
    const reason = window.prompt(
      "Tell the host why you'd like to cancel (optional). They'll contact you to confirm.",
      "",
    );
    if (reason === null) return; // user dismissed
    start(async () => {
      const res = await requestCancellationAction(bookingId, reason);
      setMsg(res.message ?? null);
      router.refresh();
    });
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        Your details
      </div>

      {editing ? (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 10,
            background: "var(--surface)",
            border: "1px solid var(--line)",
          }}
        >
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              placeholder="name@example.com"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label>Expected arrival time</label>
            <input
              placeholder="e.g. around 6 PM"
              value={form.arrivalTime}
              onChange={(e) => set("arrivalTime", e.target.value)}
            />
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label>Special requests</label>
            <textarea
              rows={3}
              placeholder="Anything we should know? (early check-in, dietary needs…)"
              value={form.requests}
              onChange={(e) => set("requests", e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" disabled={pending} onClick={save}>
              <Icon name="check" className="icon-sm" /> Save
            </button>
            <button
              className="btn btn-ghost"
              disabled={pending}
              onClick={() => {
                setForm(initial);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 10,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            fontSize: 12.5,
            lineHeight: 1.7,
          }}
        >
          <div>
            <b>Email</b> · {initial.email || "—"}
          </div>
          <div>
            <b>Arrival</b> · {initial.arrivalTime || "—"}
          </div>
          <div>
            <b>Requests</b> · {initial.requests || "—"}
          </div>
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setEditing(true)}>
            <Icon name="edit" className="icon-sm" /> Edit my details
          </button>
        </div>
      )}

      {cancelRequested ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            background: "var(--st-tentative-bg)",
            color: "#8a6516",
            fontSize: 12.5,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <Icon name="clock" className="icon-sm" />
          Cancellation requested — the host will contact you to confirm.
        </div>
      ) : (
        cancellable && (
          <button
            className="btn btn-ghost"
            style={{
              width: "100%",
              justifyContent: "center",
              marginTop: 6,
              color: "var(--st-unpaid)",
            }}
            disabled={pending}
            onClick={requestCancel}
          >
            Request to cancel
          </button>
        )
      )}

      {msg && <div className="dev-code">{msg}</div>}
    </div>
  );
}
