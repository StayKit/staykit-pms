"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

const GO_TO: Record<string, string> = {
  d: "/dashboard",
  o: "/overview",
  c: "/calendar",
  b: "/bookings",
  u: "/guests", // "users"
  r: "/reports",
  n: "/notifications",
};

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "n", label: "New booking" },
  { keys: "/", label: "Focus search" },
  { keys: "g then d", label: "Go to Dashboard" },
  { keys: "g then o", label: "Go to Overview" },
  { keys: "g then c", label: "Go to Calendar" },
  { keys: "g then b", label: "Go to Bookings" },
  { keys: "g then u", label: "Go to Guests" },
  { keys: "g then r", label: "Go to Reports" },
  { keys: "g then n", label: "Go to Notifications" },
  { keys: "?", label: "Show this help" },
];

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const awaitingGo = useRef(false);
  const goTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }

      // Second key of a "g" sequence.
      if (awaitingGo.current) {
        awaitingGo.current = false;
        if (goTimer.current) clearTimeout(goTimer.current);
        const dest = GO_TO[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
        return;
      }

      if (e.key === "g") {
        awaitingGo.current = true;
        goTimer.current = setTimeout(() => (awaitingGo.current = false), 1200);
        return;
      }
      if (e.key === "n") {
        e.preventDefault();
        router.push("?new=1");
      } else if (e.key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          'input[type="search"], .search input, input[placeholder*="Search"]',
        );
        if (search) {
          e.preventDefault();
          search.focus();
        }
      } else if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((o) => !o);
      } else if (e.key === "Escape") {
        setHelpOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  if (!helpOpen) return null;
  return (
    <>
      <button className="scrim open" aria-label="Close" onClick={() => setHelpOpen(false)} />
      <div
        className="modal open"
        role="dialog"
        aria-label="Keyboard shortcuts"
        style={{ width: 420 }}
      >
        <div className="modal-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Keyboard shortcuts</h3>
            <button className="icon-btn" onClick={() => setHelpOpen(false)} aria-label="Close">
              <Icon name="x" className="icon-sm" />
            </button>
          </div>
        </div>
        <div className="modal-body">
          {SHORTCUTS.map((s) => (
            <div
              key={s.keys}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 0",
              }}
            >
              <span style={{ fontSize: 13.5 }}>{s.label}</span>
              <kbd className="kbd">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
