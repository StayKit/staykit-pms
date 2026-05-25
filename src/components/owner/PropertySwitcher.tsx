"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { setActivePropertyAction } from "@/lib/actions/property";
import type { PropertyOption } from "@/lib/property/active";

export function PropertySwitcher({
  activeId,
  properties,
}: {
  activeId: string;
  properties: PropertyOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = properties.find((p) => p.id === activeId) ?? properties[0];

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // A single property can't be switched — render the static label, as before.
  if (properties.length <= 1) {
    return (
      <div className="property-switch-wrap">
        <div className="property-switch static" aria-disabled>
          <div>
            <div className="label">PROPERTY</div>
            <div className="val">{active?.name}</div>
          </div>
        </div>
      </div>
    );
  }

  async function select(id: string) {
    setOpen(false);
    if (id === activeId) return;
    await setActivePropertyAction(id);
    router.refresh();
  }

  return (
    <div className="property-switch-wrap" ref={ref}>
      <button
        type="button"
        className="property-switch"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div>
          <div className="label">PROPERTY</div>
          <div className="val">{active?.name}</div>
        </div>
        <Icon name="chevron-down" className="icon-sm" />
      </button>
      {open && (
        <div className="property-menu" role="listbox">
          {properties.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={p.id === activeId}
              className={"property-menu-item" + (p.id === activeId ? " active" : "")}
              onClick={() => select(p.id)}
            >
              <span>{p.name}</span>
              {p.id === activeId && <Icon name="check" className="icon-sm" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
