/**
 * The six (+refund) default notification templates pre-seeded for an owner (J1 step 5).
 * Bodies use the {{var|filter}} syntax understood by lib/notify/template.ts. SMS bodies
 * are kept short; real DLT/WhatsApp template IDs are added by the owner per provider.
 */
import type { NotificationChannel } from "@prisma/client";

export interface DefaultTemplate {
  channel: NotificationChannel;
  triggerKey: string;
  name: string;
  subject?: string;
  body: string;
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    channel: "SMS",
    triggerKey: "BOOKING_CONFIRMED",
    name: "Booking confirmed (SMS)",
    body: "Hi {{guest.name}}, your booking {{booking.ref}} at {{property.name}} is confirmed for {{booking.checkIn|date}}. See you soon!",
  },
  {
    channel: "EMAIL",
    triggerKey: "BOOKING_CONFIRMED",
    name: "Booking confirmed (Email)",
    subject: "Your booking at {{property.name}} is confirmed",
    body: "Dear {{guest.name}},\n\nYour booking {{booking.ref}} is confirmed.\nCheck-in: {{booking.checkIn|date}} from {{property.checkInTime}}\nCheck-out: {{booking.checkOut|date}}\n\nWe look forward to hosting you.",
  },
  {
    channel: "SMS",
    triggerKey: "PAYMENT_LINK_SENT",
    name: "Payment link (SMS)",
    body: "Hi {{guest.name}}, please pay {{amount.due|inr}} for {{booking.ref}}: {{paymentLink.url}}",
  },
  {
    channel: "EMAIL",
    triggerKey: "PAYMENT_LINK_SENT",
    name: "Payment link (Email)",
    subject: "Payment link for your stay at {{property.name}}",
    body: "Dear {{guest.name}},\n\n{{amount.due|inr}} is still to pay for booking {{booking.ref}}.\nPay securely here: {{paymentLink.url}}",
  },
  {
    channel: "SMS",
    triggerKey: "PAYMENT_RECEIVED",
    name: "Payment received (SMS)",
    body: "Thank you {{guest.name}}! We've received your payment for {{booking.ref}}.",
  },
  {
    channel: "SMS",
    triggerKey: "PRE_ARRIVAL_24H",
    name: "Day-before reminder (SMS)",
    body: "Hi {{guest.name}}, looking forward to welcoming you tomorrow at {{property.name}}. Check-in from {{property.checkInTime}}.",
  },
  {
    channel: "EMAIL",
    triggerKey: "POST_CHECKOUT_THANKS",
    name: "Post-stay thank you (Email)",
    subject: "Thank you for staying with us",
    body: "Dear {{guest.name}},\n\nThank you for staying at {{property.name}}. We'd love to host you again!",
  },
  {
    channel: "SMS",
    triggerKey: "CANCELLED",
    name: "Cancellation (SMS)",
    body: "Hi {{guest.name}}, your booking {{booking.ref}} has been cancelled. Contact us with any questions.",
  },
  {
    channel: "SMS",
    triggerKey: "REFUND_PROCESSED",
    name: "Refund processed (SMS)",
    body: "Hi {{guest.name}}, your refund for {{booking.ref}} has been processed. It may take 5–7 working days to reflect.",
  },
];
