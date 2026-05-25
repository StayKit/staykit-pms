"use client";

import { useEffect } from "react";
import { Icon } from "@/components/Icon";

/**
 * Friendly confirmation toast (audit P2 #16). Replaces the old monospace `.dev-code`
 * box that looked like a debug/error dump to a non-technical owner. Auto-dismisses;
 * `tone` switches the accent for errors.
 */
export function Toast({
  message,
  onClose,
  tone = "ok",
  timeout = 4000,
}: Readonly<{
  message: string;
  onClose: () => void;
  tone?: "ok" | "error";
  timeout?: number;
}>) {
  useEffect(() => {
    const t = setTimeout(onClose, timeout);
    return () => clearTimeout(t);
  }, [message, onClose, timeout]);

  const error = tone === "error";
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: "min(92vw, 460px)",
        padding: "12px 14px",
        borderRadius: 12,
        background: "var(--surface)",
        border: `1px solid ${error ? "var(--st-unpaid)" : "var(--line)"}`,
        boxShadow: "var(--shadow-2, 0 8px 30px rgba(0,0,0,0.18))",
        fontSize: 13.5,
        color: "var(--ink)",
      }}
    >
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 22,
          height: 22,
          borderRadius: "50%",
          flex: "0 0 22px",
          background: error ? "var(--st-unpaid-bg)" : "var(--brand-tint)",
          color: error ? "var(--st-unpaid)" : "var(--brand)",
        }}
      >
        <Icon name={error ? "alert" : "check"} className="icon-sm" />
      </span>
      <span style={{ flex: 1 }}>{message}</span>
      <button className="icon-btn" onClick={onClose} aria-label="Dismiss">
        <Icon name="x" className="icon-sm" />
      </button>
    </div>
  );
}
