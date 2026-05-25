"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { setGuestCrmAction } from "@/lib/actions/guests";

/**
 * CRM controls on a guest (audit P2 #25): VIP, do-not-book, and free-text tags.
 * Toggles save immediately; tags are edited inline.
 */
export function GuestCrmPanel({
  guestId,
  initial,
}: Readonly<{
  guestId: string;
  initial: { vip: boolean; blacklisted: boolean; tags: string[] };
}>) {
  const router = useRouter();
  const [vip, setVip] = useState(initial.vip);
  const [blacklisted, setBlacklisted] = useState(initial.blacklisted);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagInput, setTagInput] = useState("");
  const [pending, start] = useTransition();

  function save(patch: { vip?: boolean; blacklisted?: boolean; tags?: string[] }) {
    start(async () => {
      await setGuestCrmAction(guestId, patch);
      router.refresh();
    });
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) {
      setTagInput("");
      return;
    }
    const next = [...tags, t];
    setTags(next);
    setTagInput("");
    save({ tags: next });
  }

  function removeTag(t: string) {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    save({ tags: next });
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div className="k" style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
        CRM
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          className={"chip" + (vip ? " selected" : "")}
          disabled={pending}
          onClick={() => {
            setVip(!vip);
            save({ vip: !vip });
          }}
        >
          <Icon name="sparkles" className="icon-sm" /> VIP
        </button>
        <button
          className={"chip" + (blacklisted ? " selected" : "")}
          disabled={pending}
          style={
            blacklisted ? { background: "var(--st-unpaid-bg)", color: "var(--st-unpaid)" } : {}
          }
          onClick={() => {
            setBlacklisted(!blacklisted);
            save({ blacklisted: !blacklisted });
          }}
        >
          <Icon name="lock" className="icon-sm" /> Do not book
        </button>
      </div>

      {blacklisted && (
        <div className="text-xs" style={{ color: "var(--st-unpaid)", marginTop: 8 }}>
          New bookings for this guest are blocked until you remove this flag.
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
          Tags
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {tags.map((t) => (
            <span key={t} className="pill pill-neutral" style={{ display: "inline-flex", gap: 6 }}>
              {t}
              <button
                aria-label={`Remove ${t}`}
                disabled={pending}
                onClick={() => removeTag(t)}
                style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }}
              >
                <Icon name="x" className="icon-sm" />
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            placeholder="Add tag…"
            disabled={pending}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            style={{ width: 120, padding: "4px 8px", fontSize: 13 }}
          />
        </div>
      </div>
    </div>
  );
}
