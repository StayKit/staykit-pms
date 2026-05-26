"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/Icon";
import { BookingDetailView, type BookingDetailData } from "./BookingDetailView";
import { fetchBookingDetailAction } from "@/lib/actions/booking-detail";

interface SidebarContextValue {
  openBooking: (id: string) => void;
  closeBooking: () => void;
  /** Re-fetch the currently open booking (used after in-sidebar actions). */
  refreshBooking: () => void;
}

const BookingSidebarContext = createContext<SidebarContextValue | null>(null);

export function useBookingSidebar(): SidebarContextValue {
  const ctx = useContext(BookingSidebarContext);
  if (!ctx) throw new Error("useBookingSidebar must be used within <BookingSidebarProvider>");
  return ctx;
}

/** Non-throwing variant: returns null if rendered outside the provider. */
export function useBookingSidebarOptional(): SidebarContextValue | null {
  return useContext(BookingSidebarContext);
}

/**
 * Global right-side drawer for booking details. Lets booking IDs open in place
 * instead of routing to /bookings/[id], so returning closes the panel and
 * preserves the underlying page (e.g. /reports/payments).
 */
export function BookingSidebarProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [data, setData] = useState<BookingDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startLoad] = useTransition();
  const path = usePathname();
  // Sequence guard against stale fetches: only the latest open() wins.
  const seq = useRef(0);

  const openBooking = useCallback((id: string) => {
    const mine = ++seq.current;
    setOpenId(id);
    setError(null);
    setData(null);
    startLoad(async () => {
      const res = await fetchBookingDetailAction(id);
      if (seq.current !== mine) return;
      if (res.ok) setData(res.data);
      else setError(res.message);
    });
  }, []);

  const closeBooking = useCallback(() => {
    seq.current++;
    setOpenId(null);
    setData(null);
    setError(null);
  }, []);

  const refreshBooking = useCallback(() => {
    if (!openId) return;
    const id = openId;
    const mine = ++seq.current;
    startLoad(async () => {
      const res = await fetchBookingDetailAction(id);
      if (seq.current !== mine) return;
      if (res.ok) setData(res.data);
      else setError(res.message);
    });
  }, [openId]);

  // Close the panel if the user navigates to a new route (e.g. clicks a non-booking nav link).
  useEffect(() => {
    closeBooking();
    // We intentionally re-run only on path change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Escape closes the panel.
  useEffect(() => {
    if (!openId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeBooking();
    }
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [openId, closeBooking]);

  const isOpen = openId !== null;
  const value = useMemo(
    () => ({ openBooking, closeBooking, refreshBooking }),
    [openBooking, closeBooking, refreshBooking],
  );

  let panelContent: React.ReactNode;
  if (data) {
    panelContent = (
      <BookingDetailView data={data} inSidebar onRefresh={refreshBooking} onClose={closeBooking} />
    );
  } else if (error) {
    panelContent = (
      <SidebarMessage
        icon="alert"
        title="Could not load booking"
        sub={error}
        onClose={closeBooking}
      />
    );
  } else if (isOpen) {
    panelContent = <SidebarMessage icon="clock" title="Loading booking…" onClose={closeBooking} />;
  } else {
    panelContent = null;
  }

  return (
    <BookingSidebarContext.Provider value={value}>
      {children}
      <button
        type="button"
        className={"scrim " + (isOpen ? "open" : "")}
        onClick={closeBooking}
        aria-label="Close booking details"
        aria-hidden={!isOpen}
        tabIndex={isOpen ? 0 : -1}
      />
      <aside
        className={"sheet booking-sheet " + (isOpen ? "open" : "")}
        role="dialog"
        aria-label="Booking details"
        aria-hidden={!isOpen}
      >
        <div className="sheet-body">{panelContent}</div>
      </aside>
    </BookingSidebarContext.Provider>
  );
}

function SidebarMessage({
  icon,
  title,
  sub,
  onClose,
}: Readonly<{ icon: string; title: string; sub?: string; onClose: () => void }>) {
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="x" className="icon-sm" />
        </button>
      </div>
      <div className="empty-state">
        <Icon name={icon} className="icon" />
        <div className="empty-title">{title}</div>
        {sub && <div className="empty-sub">{sub}</div>}
      </div>
    </div>
  );
}
