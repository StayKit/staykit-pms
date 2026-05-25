"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Toast } from "@/components/Toast";
import {
  toggleMarketingConsentAction,
  eraseGuestAction,
  uploadGuestIdAction,
} from "@/lib/actions/guests";

export function GuestActions({
  guestId,
  marketingConsent,
  hasIdDoc,
}: Readonly<{ guestId: string; marketingConsent: boolean; hasIdDoc: boolean }>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [idType, setIdType] = useState("AADHAAR");
  const [idLast4, setIdLast4] = useState("");

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMsg("Choose a file first.");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    form.set("idType", idType);
    form.set("idLast4", idLast4);
    start(async () => {
      const res = await uploadGuestIdAction(guestId, form);
      setMsg(res.message ?? null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="field">
        <label>ID document (encrypted at rest)</label>
        <div className="field-row thirds" style={{ alignItems: "flex-end" }}>
          <div className="field">
            <label style={{ fontWeight: 400 }}>Type</label>
            <select value={idType} onChange={(e) => setIdType(e.target.value)}>
              <option value="AADHAAR">Aadhaar</option>
              <option value="PASSPORT">Passport</option>
              <option value="DRIVING_LICENSE">Driving licence</option>
              <option value="VOTER_ID">Voter ID</option>
            </select>
          </div>
          <div className="field">
            <label style={{ fontWeight: 400 }}>Last 4</label>
            <input
              value={idLast4}
              inputMode="numeric"
              onChange={(e) => setIdLast4(e.target.value)}
            />
          </div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button className="btn" disabled={pending} onClick={upload}>
            <Icon name="image" className="icon-sm" /> Upload ID
          </button>
          {hasIdDoc && (
            <a
              className="btn"
              href={`/guests/${guestId}/id-document`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="external" className="icon-sm" /> View ID (audited)
            </a>
          )}
        </div>
      </div>
      <button
        className={"btn " + (marketingConsent ? "btn-primary" : "")}
        disabled={pending}
        onClick={() =>
          start(async () => {
            await toggleMarketingConsentAction(guestId);
            router.refresh();
          })
        }
      >
        <Icon name={marketingConsent ? "check" : "bell"} className="icon-sm" />
        {marketingConsent ? "Marketing: opted in" : "Marketing: opted out"}
      </button>

      <button
        className="btn btn-ghost"
        style={{ color: "var(--st-unpaid)" }}
        disabled={pending}
        onClick={() => {
          if (
            confirm(
              "Erase this guest's personal data? Booking/tax records are kept as required by law (GST 6y, Income Tax 8y).",
            )
          ) {
            start(async () => {
              const res = await eraseGuestAction(guestId);
              setMsg(res.message ?? null);
              if (res.ok && !res.message?.includes("retained")) router.push("/guests");
              else router.refresh();
            });
          }
        }}
      >
        <Icon name="trash" className="icon-sm" /> Erase personal data (DPDP)
      </button>
      {msg && <Toast message={msg} onClose={() => setMsg(null)} />}
    </div>
  );
}
