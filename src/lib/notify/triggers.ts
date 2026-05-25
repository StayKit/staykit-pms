/**
 * Lifecycle triggers and channels shared by the notifications UI and server actions.
 * A "template group" is one trigger across up to three channels (SMS / Email / WhatsApp).
 */

export type NotifyChannel = "SMS" | "EMAIL" | "WHATSAPP";

export const CHANNELS: NotifyChannel[] = ["SMS", "EMAIL", "WHATSAPP"];

export const CHANNEL_LABEL: Record<NotifyChannel, string> = {
  SMS: "SMS",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
};

/** CSS modifier on .channel-chip for each channel's colour. */
export const CHANNEL_TAG: Record<NotifyChannel, string> = {
  SMS: "phone",
  EMAIL: "direct",
  WHATSAPP: "whatsapp",
};

export const CHANNEL_ICON: Record<NotifyChannel, string> = {
  SMS: "phone",
  EMAIL: "mail",
  WHATSAPP: "message-circle",
};

export interface TriggerDef {
  key: string;
  label: string;
  /** One-line description of when this event fires, shown in the editor. */
  when: string;
}

/** The lifecycle triggers wired into the app (see lib/notify/dispatch + booking engine). */
export const TRIGGERS: TriggerDef[] = [
  { key: "BOOKING_CONFIRMED", label: "Booking confirmed", when: "When a booking is confirmed." },
  {
    key: "BOOKING_TENTATIVE",
    label: "Booking held (tentative)",
    when: "When a room is held without payment.",
  },
  { key: "PAYMENT_LINK_SENT", label: "Payment link sent", when: "When you share a payment link." },
  { key: "PAYMENT_RECEIVED", label: "Payment received", when: "When a payment is recorded." },
  { key: "PRE_ARRIVAL_24H", label: "Day before arrival", when: "A day before the guest arrives." },
  {
    key: "CHECK_IN_INSTRUCTIONS",
    label: "Check-in instructions",
    when: "With check-in details for the guest.",
  },
  {
    key: "POST_CHECKOUT_THANKS",
    label: "After check-out (thanks)",
    when: "After the guest checks out.",
  },
  { key: "CANCELLED", label: "Booking cancelled", when: "When a booking is cancelled." },
  { key: "REFUND_PROCESSED", label: "Refund processed", when: "When a refund is processed." },
  { key: "NO_SHOW", label: "No-show", when: "When a guest is marked no-show." },
  {
    key: "OWNER_NEW_BOOKING",
    label: "Owner: new booking alert",
    when: "Alerts you when a new booking comes in.",
  },
];

export const TRIGGER_LABEL: Record<string, string> = Object.fromEntries(
  TRIGGERS.map((t) => [t.key, t.label]),
);

export const TRIGGER_WHEN: Record<string, string> = Object.fromEntries(
  TRIGGERS.map((t) => [t.key, t.when]),
);

/** Order index for a trigger key (unknown keys sort last). */
export function triggerOrder(key: string): number {
  const i = TRIGGERS.findIndex((t) => t.key === key);
  return i === -1 ? TRIGGERS.length : i;
}
