/** Status pills, channel chips, avatars, and the booking-state derivation. Server-safe. */
import type { ReactNode } from "react";

export type DisplayState =
  | "tentative"
  | "unpaid"
  | "partial"
  | "paid"
  | "checkedin"
  | "checkedout"
  | "cancelled"
  | "noshow"
  | "block";

export interface BookingMoneyLike {
  status: string; // BookingStatus enum
  amountPaid: number;
  totalAmount: number;
}

/** Derive the colour/label state shown on bars and pills from DB fields. */
export function deriveState(b: BookingMoneyLike): DisplayState {
  switch (b.status) {
    case "TENTATIVE":
      return "tentative";
    case "CHECKED_IN":
      return "checkedin";
    case "CHECKED_OUT":
      return "checkedout";
    case "CANCELLED":
      return "cancelled";
    case "NO_SHOW":
      return "noshow";
  }
  if (b.totalAmount > 0 && b.amountPaid >= b.totalAmount) return "paid";
  if (b.amountPaid > 0) return "partial";
  return "unpaid";
}

const STATE_LABELS: Record<string, string> = {
  tentative: "Tentative",
  unpaid: "Unpaid",
  partial: "Part-paid",
  paid: "Paid",
  checkedin: "Checked in",
  checkedout: "Checked out",
  cancelled: "Cancelled",
  noshow: "No-show",
  block: "Owner block",
};

export function statusLabel(s: string): string {
  return STATE_LABELS[s] ?? s;
}

export function bbClass(s: DisplayState): string {
  return "booking-bar bb-" + s;
}

export function StatusPill({ state, children }: { state: DisplayState; children?: ReactNode }) {
  // Map cancelled/noshow to existing pill styles.
  const cls =
    state === "cancelled" ? "checkedout" : state === "noshow" ? "unpaid" : state;
  return (
    <span className={"pill pill-" + cls}>
      <span className="swatch" />
      {children ?? statusLabel(state)}
    </span>
  );
}

export function ChannelChip({
  channelKey,
  name,
}: {
  channelKey: string;
  name: string;
}) {
  return <span className={"channel-chip " + channelKey}>{name}</span>;
}

const AVATAR_PALETTES = ["", "teal", "purple", "sky"];

export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length];
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({
  name,
  id,
  size,
  className = "",
}: {
  name: string;
  id: string;
  size?: number;
  className?: string;
}) {
  const style = size ? { width: size, height: size, fontSize: size * 0.4 } : undefined;
  return (
    <div className={`avatar ${avatarColor(id)} ${className}`} style={style}>
      {initials(name)}
    </div>
  );
}
