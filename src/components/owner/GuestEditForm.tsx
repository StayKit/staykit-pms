"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { updateGuestAction } from "@/lib/actions/guests";

export function GuestEditForm({
  guestId,
  initial,
}: Readonly<{
  guestId: string;
  initial: { name: string; email: string; city: string; notes: string };
}>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        <Icon name="edit" className="icon-sm" /> Edit details
      </button>
    );
  }

  return (
    <div>
      <h4 style={{ marginTop: 0 }}>Edit details</h4>
      <div className="field">
        <label>Name</label>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            placeholder="name@example.com"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div className="field">
          <label>City</label>
          <input value={form.city} onChange={(e) => set("city", e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          className="btn btn-primary"
          disabled={pending || !form.name.trim()}
          onClick={() =>
            start(async () => {
              const res = await updateGuestAction(guestId, form);
              setMsg(res.message ?? null);
              if (res.ok) {
                setOpen(false);
                router.refresh();
              }
            })
          }
        >
          <Icon name="check" className="icon-sm" /> Save
        </button>
        <button
          className="btn btn-ghost"
          disabled={pending}
          onClick={() => {
            setForm(initial);
            setOpen(false);
            setMsg(null);
          }}
        >
          Cancel
        </button>
      </div>
      {msg && (
        <div className="error-text" style={{ marginTop: 8 }}>
          {msg}
        </div>
      )}
    </div>
  );
}
