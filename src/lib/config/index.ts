/**
 * Regulatory & pricing constants. These change — keep them here so a single PR
 * updates them when government notifications or provider rate cards change.
 * See docs/compliance/* for sources.
 */

/** GST on accommodation — Notification 15/2025-Central Tax (Rate), 17 Sep 2025. */
export const GST = {
  /** Threshold (paise per unit per night) on transaction value, not declared tariff. */
  thresholdPaise: 7_500_00,
  /** ≤ threshold → 5% without ITC. */
  lowRate: 0.05,
  /** > threshold → 18% with ITC. */
  highRate: 0.18,
  /** SAC code: "Room or unit accommodation services by Hotels/INN/Guest House/Club etc." */
  sacCode: "996311",
} as const;

/** GST registration thresholds (annual turnover). General vs special-category states. */
export const GST_REGISTRATION = {
  generalThresholdPaise: 20_00_000_00, // ₹20 lakh
  specialThresholdPaise: 10_00_000_00, // ₹10 lakh (HP, UK, NE states)
  specialStates: ["HP", "UK", "AR", "AS", "MN", "ML", "MZ", "NL", "SK", "TR"],
} as const;

/** OTP policy. */
export const OTP = {
  length: 6,
  ttlMinutes: 5,
  maxVerifyAttempts: 5,
  perContactPer15Min: 3,
  perIpPerHour: 10,
} as const;

/** Sessions. */
export const SESSION = {
  staffTtlHours: 24 * 14,
  guestTtlHours: 24,
  staffCookie: "staykit_session",
  guestCookie: "staykit_guest",
} as const;

/** OAuth / MCP tokens. */
export const MCP = {
  accessTokenTtlMinutes: 15,
  refreshTokenTtlDays: 30,
  perTokenCallsPerMin: 60,
  perTokenCallsPerHour: 1000,
  sendNotificationPerHour: 10,
  // Scopes an MCP token may be granted. This is the *operational* set — the things an
  // owner does in reaction to an inbound request (see docs/mcp.md, "AI vs portal").
  // Fine-tuning permissions (rates:write, team:manage, mcp:admin) are deliberately
  // excluded: they have no MCP tools and must be done in the portal. `properties:write`
  // is included only because it gates maintenance blocks; inventory/property CRUD is UI-only.
  scopes: [
    "bookings:read",
    "bookings:write",
    "bookings:cancel",
    "payments:read",
    "payments:write",
    "payments:refund",
    "properties:read",
    "properties:write",
    "guests:read",
    "guests:write",
    "notifications:read",
    "notifications:send",
    "compliance:read",
    "compliance:write",
    "reports:read",
  ],
} as const;

/** DPDP retention. */
export const RETENTION = {
  guestIdDaysAfterCheckout: 90,
  // Statutory holds for tax records:
  gstYears: 6,
  incomeTaxYears: 8,
} as const;

export const APP = {
  name: "StayKit",
  tagline: "Run your homestay, not a spreadsheet.",
  defaultCurrency: "INR",
  timezone: "Asia/Kolkata",
  defaultLocale: "en-IN",
  /** Public base URL — used for payment callbacks and MCP resource indicators. */
  baseUrl: process.env.APP_BASE_URL || "http://localhost:3000",
} as const;

export const FRRO_FORM_C_URL = "https://indianfrro.gov.in/sform";

/** Source channels seeded for every owner. */
export const DEFAULT_CHANNELS = [
  { key: "direct", name: "Direct", color: "#1B5E5A" },
  { key: "walkin", name: "Walk-in", color: "#4A5550" },
  { key: "phone", name: "Phone", color: "#534E83" },
  { key: "instagram", name: "Instagram", color: "#9A2E76" },
  { key: "whatsapp", name: "WhatsApp", color: "#1F6B30" },
  { key: "airbnb", name: "Airbnb", color: "#BD4327" },
  { key: "booking", name: "Booking.com", color: "#29508A" },
  { key: "mmt", name: "MakeMyTrip", color: "#A36C0E" },
] as const;
