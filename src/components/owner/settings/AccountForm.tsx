"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { updateAccountAction } from "@/lib/actions/settings";

export interface AccountValues {
  name: string;
  email: string;
  phone: string;
}

export function AccountForm({
  initial,
  disabled = false,
}: Readonly<{ initial: AccountValues; disabled?: boolean }>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<AccountValues>(initial);
  const [msg, setMsg] = useState<string | null>(null);

  function set<K extends keyof AccountValues>(k: K, v: AccountValues[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function save() {
    start(async () => {
      const res = await updateAccountAction(form);
      setMsg(res.message ?? (res.ok ? "Saved." : "Could not save."));
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="field">
        <label>Owner / business name</label>
        <input
          value={form.name}
          disabled={disabled}
          onChange={(e) => set("name", e.target.value)}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Contact mobile</label>
          <input
            value={form.phone}
            disabled={disabled}
            placeholder="+9198…"
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Email (optional)</label>
          <input
            type="email"
            value={form.email}
            disabled={disabled}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
      </div>
      <button
        className="btn btn-primary"
        disabled={disabled || pending || !form.name.trim() || !form.phone.trim()}
        onClick={save}
      >
        <Icon name="check" className="icon-sm" /> Save changes
      </button>
      {msg && (
        <div className="dev-code" style={{ marginTop: 12 }}>
          {msg}
        </div>
      )}
    </div>
  );
}
