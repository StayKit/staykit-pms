"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Toast } from "@/components/Toast";
import { INDIAN_STATES } from "@/lib/india";
import { createPropertyAction, updatePropertyAction } from "@/lib/actions/properties";

export interface PropertyFormValues {
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  checkInTime: string;
  checkOutTime: string;
  cancellationPolicy: string;
  paymentInstructions: string;
  invoicePrefix: string;
}

const EMPTY: PropertyFormValues = {
  name: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "KA",
  pincode: "",
  gstin: "",
  checkInTime: "14:00",
  checkOutTime: "11:00",
  cancellationPolicy: "",
  paymentInstructions: "",
  invoicePrefix: "INV",
};

export function PropertyForm({
  id,
  initial,
  onSaved,
  onCreated,
}: Readonly<{
  id?: string;
  initial?: Partial<PropertyFormValues>;
  onSaved?: () => void;
  /** When provided on a create form, called with the new id instead of redirecting. */
  onCreated?: (id: string) => void;
}>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<PropertyFormValues>({ ...EMPTY, ...initial });
  const [msg, setMsg] = useState<string | null>(null);

  function set<K extends keyof PropertyFormValues>(k: K, v: PropertyFormValues[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function save() {
    start(async () => {
      const res = id ? await updatePropertyAction(id, form) : await createPropertyAction(form);
      setMsg(res.message ?? (res.ok ? "Saved." : "Could not save."));
      if (res.ok) {
        onSaved?.();
        const newId = !id && res.data ? (res.data as { id: string }).id : null;
        if (newId && onCreated) {
          onCreated(newId);
          router.refresh();
        } else if (newId) {
          router.push(`/properties/${newId}/rooms`);
        } else {
          router.refresh();
        }
      }
    });
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="field-row">
        <div className="field">
          <label>Property name</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="field">
          <label>Invoice prefix</label>
          <input
            value={form.invoicePrefix}
            onChange={(e) => set("invoicePrefix", e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label>Address line 1</label>
        <input value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} />
      </div>
      <div className="field">
        <label>Address line 2 (optional)</label>
        <input value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} />
      </div>

      <div className="field-row thirds">
        <div className="field">
          <label>City</label>
          <input value={form.city} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div className="field">
          <label>State</label>
          <select value={form.state} onChange={(e) => set("state", e.target.value)}>
            {INDIAN_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Pincode</label>
          <input
            value={form.pincode}
            inputMode="numeric"
            onChange={(e) => set("pincode", e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label>GSTIN (optional)</label>
        <input
          value={form.gstin}
          placeholder="Skip if turnover < ₹20 lakh (₹10 lakh in HP/UK/NE)"
          onChange={(e) => set("gstin", e.target.value.toUpperCase())}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label>Check-in time</label>
          <input
            type="time"
            value={form.checkInTime}
            onChange={(e) => set("checkInTime", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Check-out time</label>
          <input
            type="time"
            value={form.checkOutTime}
            onChange={(e) => set("checkOutTime", e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label>Cancellation policy (shown to guests)</label>
        <textarea
          rows={3}
          value={form.cancellationPolicy}
          onChange={(e) => set("cancellationPolicy", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Payment instructions (shown to guests)</label>
        <textarea
          rows={3}
          placeholder="e.g. Pay cash at check-in, or UPI to homestay@upi / A/c 1234… IFSC ABCD0…"
          value={form.paymentInstructions}
          onChange={(e) => set("paymentInstructions", e.target.value)}
        />
        <div className="hint" style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
          Razorpay online links are optional — add valid keys in your environment to enable them.
          Otherwise StayKit is cash/manual: you confirm each payment yourself.
        </div>
      </div>

      <button className="btn btn-primary" disabled={pending || !form.name.trim()} onClick={save}>
        <Icon name="check" className="icon-sm" /> {id ? "Save changes" : "Create property"}
      </button>
      {msg && <Toast message={msg} onClose={() => setMsg(null)} />}
    </div>
  );
}
