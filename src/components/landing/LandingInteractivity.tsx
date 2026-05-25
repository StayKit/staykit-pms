"use client";

import { useEffect } from "react";

/**
 * Progressive enhancement for the landing page:
 *  - toggles `.scrolled` on the sticky nav once the page is scrolled
 *  - turns the native <details> FAQ into an accordion (opening one closes the rest)
 * Renders nothing; everything works without JS, this just adds polish.
 */
export function LandingInteractivity() {
  useEffect(() => {
    const nav = document.getElementById("lp-nav");
    const onScroll = () => {
      if (!nav) return;
      nav.classList.toggle("scrolled", window.scrollY > 12);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const items = Array.from(document.querySelectorAll<HTMLDetailsElement>(".lp .faq-item"));
    const cleanups = items.map((item) => {
      const onToggle = () => {
        if (item.open) {
          for (const other of items) if (other !== item) other.open = false;
        }
      };
      item.addEventListener("toggle", onToggle);
      return () => item.removeEventListener("toggle", onToggle);
    });

    return () => {
      window.removeEventListener("scroll", onScroll);
      for (const fn of cleanups) fn();
    };
  }, []);

  return null;
}
