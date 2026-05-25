/**
 * StayKit demo seed — procedurally generates a large, *date-relative* dataset so a
 * demo environment can be reset on a schedule (e.g. hourly cron: `npm run db:reset`)
 * and always look live: every stay is anchored to "today", and each booking's status
 * (checked-out / in-house / arriving / future) is derived from where its dates fall
 * relative to the current date — so the tape chart, dashboard and reports stay current
 * no matter when the reset runs.
 *
 * It also deliberately seeds at scale (several properties, ~90 rooms, thousands of
 * bookings + payments + notifications) to show the app holding a realistic operating
 * load. Volume knobs are env-overridable — see SCALE below.
 *
 * Run with `npm run db:seed` (or `npm run db:reset` to wipe + re-create the schema first).
 */
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  fakerEN_IN as faker,
  fakerDE,
  fakerFR,
  fakerEN_GB,
  fakerEN_US,
  fakerJA,
  fakerIT,
  fakerRU,
  fakerZH_CN,
  fakerPT_BR,
  fakerES,
  fakerNL,
  fakerEN_AU,
} from "@faker-js/faker";
import { DEFAULT_CHANNELS, GST } from "../src/lib/config/index";

function resolveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("file:")) return url;
  const [filePart, query] = url.slice("file:".length).split("?");
  if (path.isAbsolute(filePart)) return url;
  return `file:${path.resolve(process.cwd(), filePart)}${query ? "?" + query : ""}`;
}

const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });

// ── demo size (pick the dataset that fits the audience) ──
//   small  — a 1–2 property homestay owner who'd be overwhelmed by a big dataset
//   medium — a small portfolio
//   large  — a busy multi-property operator (the stress-test box)
// Choose with `--size <small|medium|large>` (or env SEED_SIZE); defaults to large.
//   e.g.  npm run db:seed -- --size small
//         SEED_SIZE=small npm run db:reset
const SIZES = ["small", "medium", "large"] as const;
type SeedSize = (typeof SIZES)[number];
function parseSize(): SeedSize {
  const argv = process.argv.slice(2);
  let val: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--size=")) val = a.slice("--size=".length);
    else if (a === "--size") val = argv[i + 1];
  }
  val = (val ?? process.env.SEED_SIZE ?? "large").toLowerCase();
  if (!(SIZES as readonly string[]).includes(val)) {
    console.warn(`Unknown size "${val}" — using "large". Valid: ${SIZES.join(", ")}`);
    return "large";
  }
  return val as SeedSize;
}
const SIZE = parseSize();

interface SizePreset {
  properties: number; // how many of the property blueprints to use
  roomCap: number; // cap on rooms per room-type (keeps small properties small)
  guests: number; // guest CRM pool (long tail of one-timers + repeat core)
  pastDays: number; // how far back the calendar is filled
  futureDays: number; // …and forward
  maxNotifications: number;
  auditEntries: number;
}
const SIZE_PRESETS: Record<SeedSize, SizePreset> = {
  small: {
    properties: 2,
    roomCap: 3,
    guests: 250,
    pastDays: 60,
    futureDays: 45,
    maxNotifications: 200,
    auditEntries: 60,
  },
  medium: {
    properties: 4,
    roomCap: 5,
    guests: 1200,
    pastDays: 120,
    futureDays: 90,
    maxNotifications: 900,
    auditEntries: 300,
  },
  large: {
    properties: 7,
    roomCap: Infinity,
    guests: 3500,
    pastDays: 150,
    futureDays: 120,
    maxNotifications: 2200,
    auditEntries: 500,
  },
};

// ── volume knobs (size preset sets the defaults; any single knob is still
//    env-overridable for a custom box) ──
const num = (env: string, def: number) => {
  const v = Number(process.env[env]);
  return Number.isFinite(v) && v > 0 ? v : def;
};
const preset = SIZE_PRESETS[SIZE];
const SCALE = {
  properties: num("SEED_PROPERTIES", preset.properties),
  roomCap: preset.roomCap, // not env-driven (Infinity for large) — use --size
  pastDays: num("SEED_PAST_DAYS", preset.pastDays),
  futureDays: num("SEED_FUTURE_DAYS", preset.futureDays),
  guests: num("SEED_GUESTS", preset.guests),
  maxNotifications: num("SEED_MAX_NOTIFICATIONS", preset.maxNotifications),
  auditEntries: num("SEED_AUDIT_ENTRIES", preset.auditEntries),
};

// ── seeded RNG (deterministic given a seed → reproducible demo; shifts with the
//    calendar because all dates are anchored to today). Override with SEED_SEED. ──
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = num("SEED_SEED", 0xc0ffee);
const rng = mulberry32(SEED);
const rnd = () => rng();
// Seed faker off the same value so generated names/emails/phones are reproducible
// across resets too (locale instances each get their own offset so they don't all
// emit the same row index in lock-step).
faker.seed(SEED);
const randint = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const chance = (p: number) => rnd() < p;
function weighted<T>(items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of items) if ((r -= w) < 0) return v;
  return items[items.length - 1][0];
}

// ── client-side id generator (lets us bulk-insert via createMany and still wire
//    up relations) ──
let _idc = 0;
function uid(prefix: string): string {
  _idc += 1;
  return `${prefix}${_idc.toString(36).padStart(7, "0")}${Math.floor(rnd() * 1e6).toString(36)}`;
}

// ── date helpers (UTC-midnight, IST calendar day) ──
const DAY = 86_400_000;
function today(): Date {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(`${ymd}T00:00:00.000Z`);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY);
}
function eachNight(startMs: number, endMs: number): Date[] {
  const out: Date[] = [];
  for (let t = startMs; t < endMs; t += DAY) out.push(new Date(t));
  return out;
}
const T0 = today();
const T0ms = T0.getTime();
const NOW = Date.now();
const WIN_START = T0ms - SCALE.pastDays * DAY;
const WIN_END = T0ms + SCALE.futureDays * DAY;

// GST rate for a single per-night transaction value (paise) — mirrors src/lib/tax.ts.
const gstRate = (nightlyPaise: number) =>
  nightlyPaise <= GST.thresholdPaise ? GST.lowRate : GST.highRate;

// ── rate resolution (mirrors src/lib/booking/rates.ts so stored rateApplied matches
//    a live re-quote): highest-priority matching plan override wins, else base rate. ──
interface PlanLike {
  startDate: Date;
  endDate: Date;
  priority: number;
  daysOfWeek: string; // "Mon..Sun"
  overrides: { roomTypeId: string; amount: number }[];
}
function bitmaskIndex(d: Date): number {
  const js = d.getUTCDay(); // 0=Sun
  return js === 0 ? 6 : js - 1; // → 0=Mon..6=Sun
}
function resolveRate(date: Date, roomTypeId: string, baseRate: number, plans: PlanLike[]): number {
  const idx = bitmaskIndex(date);
  for (const p of [...plans].sort((a, b) => b.priority - a.priority)) {
    if (date < p.startDate || date >= p.endDate) continue;
    if (p.daysOfWeek[idx] !== "1") continue;
    const o = p.overrides.find((o) => o.roomTypeId === roomTypeId);
    if (o) return o.amount;
  }
  return baseRate;
}

// ── name / content pools ──
// Foreign guests are generated from per-country faker locales (name + home city in
// that locale), so the FRRO / Form-C demo shows a believable spread of nationalities
// instead of the same dozen names. Each instance is seeded off the base SEED with an
// offset so they don't emit in lock-step.
const FOREIGN_LOCALES: { faker: typeof faker; nat: string; cc: string }[] = [
  { faker: fakerDE, nat: "German", cc: "+49" },
  { faker: fakerFR, nat: "French", cc: "+33" },
  { faker: fakerEN_GB, nat: "British", cc: "+44" },
  { faker: fakerEN_US, nat: "American", cc: "+1" },
  { faker: fakerJA, nat: "Japanese", cc: "+81" },
  { faker: fakerIT, nat: "Italian", cc: "+39" },
  { faker: fakerRU, nat: "Russian", cc: "+7" },
  { faker: fakerZH_CN, nat: "Chinese", cc: "+86" },
  { faker: fakerPT_BR, nat: "Brazilian", cc: "+55" },
  { faker: fakerES, nat: "Spanish", cc: "+34" },
  { faker: fakerNL, nat: "Dutch", cc: "+31" },
  { faker: fakerEN_AU, nat: "Australian", cc: "+61" },
];
FOREIGN_LOCALES.forEach((l, i) => l.faker.seed(SEED + i + 1));
const ROOM_NAMES = [
  "Plantation View",
  "Cardamom",
  "Hibiscus",
  "Pepper Vine",
  "Garden",
  "Bamboo",
  "Fern",
  "Ixora",
  "Coffee Blossom",
  "Western Ghats",
  "Marigold",
  "Jasmine",
  "Lotus",
  "Tulsi",
  "Neem",
  "Banyan",
  "Teak",
  "Rosewood",
  "Sandalwood",
  "Mango Grove",
  "Lemongrass",
  "Cinnamon",
  "Clove",
  "Vanilla",
  "Saffron",
  "Lily",
  "Orchid",
  "Champa",
  "Palash",
  "Gulmohar",
  "Ashoka",
  "Peepal",
] as const;
const MAINT_REASONS = [
  "Deep clean — A/C service",
  "Plumbing repair",
  "Repainting",
  "Carpentry — wardrobe fix",
  "Owner block — personal use",
  "Pest control",
  "Electrical rewiring",
  "Bathroom retiling",
] as const;
const REQUESTS = [
  "Early check-in if possible",
  "Need a baby cot",
  "Vegetarian breakfast only",
  "Quiet room away from the road",
  "Honeymoon — flowers would be lovely",
  "Extra mattress for a child",
  "Ground-floor room please",
  "Late checkout requested",
] as const;
const STAFF_NOTES = [
  "Repeat guest — give a warm welcome.",
  "Pay balance at check-in (cash).",
  "Confirmed ETA over WhatsApp.",
  "Allergic to nuts — note for kitchen.",
  "Anniversary stay — cake arranged.",
  "Group travelling together, adjacent rooms.",
] as const;
const ARRIVAL_TIMES = [
  "around 2 PM",
  "evening, ~6 PM",
  "late, after 9 PM",
  "by noon",
  "around 4 PM",
] as const;
const CANCEL_REASONS = [
  "Guest changed travel plans",
  "Found alternate accommodation",
  "Health emergency",
  "Trip postponed",
  "Double-booked by mistake",
  "Weather / travel disruption",
] as const;
const PAY_METHODS = [
  ["upi", 6],
  ["card", 3],
  ["netbanking", 2],
  ["wallet", 1],
] as const;

// ── property blueprints ──
interface RTBlueprint {
  name: string;
  color: string;
  base: number; // paise
  occ: number;
  count: number;
}
interface PropBlueprint {
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
  gstin?: string;
  prefix: string;
  cancellationPolicy: string;
  paymentInstructions: string;
  roomTypes: RTBlueprint[];
  season: { name: string; offset: number; len: number; mult: number };
}
const PROPERTIES: PropBlueprint[] = [
  {
    name: "Coorg Coffee Cottage",
    addressLine1: "Plantation Road",
    city: "Madikeri",
    state: "KA",
    pincode: "571201",
    gstin: "29ABCDE1234F1Z5",
    prefix: "CCC",
    cancellationPolicy: "Free cancellation up to 7 days before check-in.",
    paymentInstructions:
      "Pay cash at check-in, or UPI to coorgcoffee@upi. We'll confirm once received.",
    roomTypes: [
      { name: "Deluxe Cottage", color: "#1B5E5A", base: 6300_00, occ: 3, count: 4 },
      { name: "Standard Room", color: "#3D5A80", base: 4200_00, occ: 2, count: 4 },
      { name: "Family Suite", color: "#E07A5F", base: 7000_00, occ: 4, count: 3 },
    ],
    season: { name: "Diwali Special", offset: 20, len: 10, mult: 1.35 },
  },
  {
    name: "Backwaters Verandah",
    addressLine1: "Finishing Point",
    city: "Alleppey",
    state: "KL",
    pincode: "688013",
    prefix: "BWV",
    cancellationPolicy: "Free cancellation up to 3 days before check-in.",
    paymentInstructions: "Pay cash on arrival, or bank transfer — ask the host for details.",
    roomTypes: [
      { name: "Premium Houseboat", color: "#29508A", base: 9500_00, occ: 4, count: 4 },
      { name: "Deluxe Houseboat", color: "#3D5A80", base: 7200_00, occ: 3, count: 4 },
    ],
    season: { name: "Onam Peak", offset: 35, len: 9, mult: 1.3 },
  },
  {
    name: "Himalayan Pine Retreat",
    addressLine1: "Old Manali Road",
    city: "Manali",
    state: "HP",
    pincode: "175131",
    gstin: "02PQRSX6789K1Z3",
    prefix: "HPR",
    cancellationPolicy: "50% refund up to 5 days before check-in; non-refundable thereafter.",
    paymentInstructions: "Advance of 30% confirms the booking. UPI: pineretreat@upi.",
    roomTypes: [
      { name: "Valley View Suite", color: "#534E83", base: 8800_00, occ: 3, count: 5 },
      { name: "Pine Room", color: "#3D5A80", base: 5200_00, occ: 2, count: 7 },
      { name: "Family Chalet", color: "#BD4327", base: 11500_00, occ: 5, count: 3 },
    ],
    season: { name: "New Year Peak", offset: 15, len: 7, mult: 1.5 },
  },
  {
    name: "Goa Sunset Villas",
    addressLine1: "Ozran Beach Road",
    city: "Anjuna",
    state: "GA",
    pincode: "403509",
    gstin: "30LMNOP4321Q1Z9",
    prefix: "GSV",
    cancellationPolicy: "Free cancellation up to 10 days before check-in.",
    paymentInstructions: "Full payment via Razorpay link, or UPI to goasunset@upi.",
    roomTypes: [
      { name: "Sea View Villa", color: "#BD4327", base: 12500_00, occ: 4, count: 4 },
      { name: "Garden Studio", color: "#1B5E5A", base: 5800_00, occ: 2, count: 6 },
      { name: "Pool Suite", color: "#9A2E76", base: 9200_00, occ: 3, count: 4 },
    ],
    season: { name: "Christmas Rush", offset: 10, len: 12, mult: 1.45 },
  },
  {
    name: "Udaipur Lake Haveli",
    addressLine1: "Lal Ghat",
    city: "Udaipur",
    state: "RJ",
    pincode: "313001",
    gstin: "08RJUDA1234H1Z2",
    prefix: "ULH",
    cancellationPolicy: "Free cancellation up to 7 days before check-in.",
    paymentInstructions: "Advance of 50% confirms the booking. UPI: lakehaveli@upi.",
    roomTypes: [
      { name: "Lake View Mahal", color: "#534E83", base: 14000_00, occ: 3, count: 4 },
      { name: "Heritage Room", color: "#A36C0E", base: 6500_00, occ: 2, count: 8 },
      { name: "Royal Suite", color: "#9A2E76", base: 18000_00, occ: 4, count: 3 },
      { name: "Courtyard Room", color: "#3D5A80", base: 4800_00, occ: 2, count: 4 },
    ],
    season: { name: "Wedding Season", offset: 25, len: 10, mult: 1.4 },
  },
  {
    name: "Munnar Tea Bungalow",
    addressLine1: "Pothamedu Viewpoint",
    city: "Munnar",
    state: "KL",
    pincode: "685612",
    prefix: "MTB",
    cancellationPolicy: "Free cancellation up to 5 days before check-in.",
    paymentInstructions: "Pay on arrival, or UPI to teabungalow@upi.",
    roomTypes: [
      { name: "Tea Estate Cottage", color: "#1B5E5A", base: 6800_00, occ: 3, count: 5 },
      { name: "Hilltop Room", color: "#3D5A80", base: 4500_00, occ: 2, count: 5 },
    ],
    season: { name: "Misty Hills Festival", offset: 18, len: 8, mult: 1.25 },
  },
  {
    name: "Rishikesh Ganga Stay",
    addressLine1: "Laxman Jhula Road",
    city: "Rishikesh",
    state: "UK",
    pincode: "249302",
    gstin: "05UKRSH5678G1Z7",
    prefix: "RGS",
    cancellationPolicy: "Free cancellation up to 4 days before check-in.",
    paymentInstructions: "Advance of 25% confirms the booking. UPI: gangastay@upi.",
    roomTypes: [
      { name: "Riverside Deluxe", color: "#29508A", base: 5500_00, occ: 2, count: 6 },
      { name: "Yoga Suite", color: "#534E83", base: 7300_00, occ: 2, count: 4 },
      { name: "Ganga View Room", color: "#3D5A80", base: 4900_00, occ: 2, count: 4 },
    ],
    season: { name: "Yoga Festival", offset: 12, len: 9, mult: 1.3 },
  },
];

// ── notification templates (logical templates across channels) ──
const TEMPLATES: {
  channel: "SMS" | "EMAIL" | "WHATSAPP";
  triggerKey: string;
  name: string;
  subject?: string;
  body: string;
  dlt?: string;
  wa?: string;
}[] = [
  {
    channel: "SMS",
    triggerKey: "BOOKING_CONFIRMED",
    name: "Booking confirmation",
    body: "Hi {{guest.name}}, your booking {{booking.ref}} at {{property.name}} is confirmed for {{booking.checkIn|date}}.",
    dlt: "DLT_BK_CONF",
  },
  {
    channel: "EMAIL",
    triggerKey: "BOOKING_CONFIRMED",
    name: "Booking confirmation",
    subject: "Your stay at {{property.name}} is confirmed",
    body: "Dear {{guest.name}},\n\nYour booking {{booking.ref}} is confirmed.\nCheck-in: {{booking.checkIn|date}} at {{property.checkInTime}}.",
  },
  {
    channel: "WHATSAPP",
    triggerKey: "BOOKING_CONFIRMED",
    name: "Booking confirmation",
    body: "Namaste {{guest.name}}! Booking {{booking.ref}} confirmed. See you on {{booking.checkIn|date}}.",
    wa: "booking_confirmed_v1",
  },
  {
    channel: "WHATSAPP",
    triggerKey: "BOOKING_TENTATIVE",
    name: "Tentative hold",
    body: "Hi {{guest.name}}, we've held {{booking.ref}} for you. Confirm with an advance to lock it in.",
    wa: "booking_tentative_v1",
  },
  {
    channel: "SMS",
    triggerKey: "PAYMENT_LINK_SENT",
    name: "Payment link",
    body: "{{guest.name}}, please pay {{amount.due|inr}} for {{booking.ref}}: {{paymentLink.url}}",
    dlt: "DLT_PAY_LINK",
  },
  {
    channel: "WHATSAPP",
    triggerKey: "PAYMENT_LINK_SENT",
    name: "Payment link",
    body: "Pay {{amount.due|inr}} securely for booking {{booking.ref}}: {{paymentLink.url}}",
    wa: "payment_link_v1",
  },
  {
    channel: "SMS",
    triggerKey: "PAYMENT_RECEIVED",
    name: "Payment received",
    body: "Thank you {{guest.name}}! We received your payment for {{booking.ref}}.",
    dlt: "DLT_PAY_RCVD",
  },
  {
    channel: "EMAIL",
    triggerKey: "PAYMENT_RECEIVED",
    name: "Payment received",
    subject: "Payment received — {{booking.ref}}",
    body: "We have received your payment. Your GST invoice is attached.",
  },
  {
    channel: "WHATSAPP",
    triggerKey: "PRE_ARRIVAL_24H",
    name: "Check-in reminder",
    body: "See you tomorrow, {{guest.name}}! Check-in from {{property.checkInTime}} at {{property.name}}.",
    wa: "pre_arrival_v1",
  },
  {
    channel: "EMAIL",
    triggerKey: "POST_CHECKOUT_THANKS",
    name: "Post-stay thank you",
    subject: "Thank you for staying with us",
    body: "Dear {{guest.name}}, thank you for staying at {{property.name}}. We hope to host you again!",
  },
  {
    channel: "WHATSAPP",
    triggerKey: "POST_CHECKOUT_THANKS",
    name: "Post-stay thank you",
    body: "Thanks for staying with us, {{guest.name}}! A small review would mean a lot.",
    wa: "post_stay_v1",
  },
  {
    channel: "SMS",
    triggerKey: "CANCELLED",
    name: "Cancellation notice",
    body: "Your booking {{booking.ref}} has been cancelled. Refund (if any) will be processed shortly.",
    dlt: "DLT_CANCEL",
  },
  {
    channel: "EMAIL",
    triggerKey: "CANCELLED",
    name: "Cancellation notice",
    subject: "Booking {{booking.ref}} cancelled",
    body: "Your booking has been cancelled as requested.",
  },
  {
    channel: "WHATSAPP",
    triggerKey: "FORM_C_REMINDER",
    name: "Form C reminder",
    body: "{{guest.name}}, kindly share a clear photo of your passport & visa for FRRO Form C compliance.",
    wa: "form_c_v1",
  },
];

// status helpers
type BStatus = "TENTATIVE" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "NO_SHOW";
function deriveStatus(checkInMs: number, checkOutMs: number): BStatus {
  if (checkOutMs <= T0ms) {
    const r = rnd();
    if (r < 0.88) return "CHECKED_OUT";
    if (r < 0.95) return "NO_SHOW";
    return "CANCELLED";
  }
  if (checkInMs < T0ms) return "CHECKED_IN"; // started before today, still in-house
  if (checkInMs === T0ms) {
    const r = rnd();
    if (r < 0.55) return "CHECKED_IN";
    if (r < 0.92) return "CONFIRMED";
    return "TENTATIVE";
  }
  const r = rnd(); // future
  if (r < 0.74) return "CONFIRMED";
  if (r < 0.88) return "TENTATIVE";
  return "CANCELLED";
}

// per-booking guest descriptor (drives notifications + audit)
interface GuestRec {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  isForeign: boolean;
}

async function main() {
  const started = Date.now();
  console.log(
    `Seeding StayKit demo [size: ${SIZE}] — ${SCALE.properties} propert${SCALE.properties === 1 ? "y" : "ies"}, window ${SCALE.pastDays}d back … ${SCALE.futureDays}d ahead (anchor ${T0.toISOString().slice(0, 10)})`,
  );

  // ── wipe (FK-safe leaf → root) ──
  console.log("Resetting data…");
  await prisma.$transaction([
    prisma.mcpAuditEntry.deleteMany(),
    prisma.mcpAccessToken.deleteMany(),
    prisma.mcpOAuthClient.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.notificationLog.deleteMany(),
    prisma.notificationAutomation.deleteMany(),
    prisma.notificationTemplate.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.paymentLink.deleteMany(),
    prisma.bookingRoom.deleteMany(),
    prisma.bookingGuest.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.maintenanceBlock.deleteMany(),
    prisma.ratePlanOverride.deleteMany(),
    prisma.ratePlan.deleteMany(),
    prisma.dailyOccupancy.deleteMany(),
    prisma.room.deleteMany(),
    prisma.roomType.deleteMany(),
    prisma.propertyScope.deleteMany(),
    prisma.property.deleteMany(),
    prisma.channelSource.deleteMany(),
    prisma.guest.deleteMany(),
    prisma.webhookEvent.deleteMany(),
    prisma.fileUpload.deleteMany(),
    prisma.job.deleteMany(),
    prisma.session.deleteMany(),
    prisma.otpRequest.deleteMany(),
    prisma.user.deleteMany(),
    prisma.owner.deleteMany(),
  ]);

  // ── Owner + staff ──
  const ownerId = uid("own");
  await prisma.owner.create({
    data: {
      id: ownerId,
      name: "Priya Raghavan",
      email: "priya@example.in",
      phone: "+919800014782",
    },
  });

  const users: Prisma.UserCreateManyInput[] = [
    {
      id: uid("usr"),
      ownerId,
      name: "Priya R.",
      email: "priya@example.in",
      phone: "+919800014782",
      role: "OWNER",
    },
    { id: uid("usr"), ownerId, name: "Rakesh", phone: "+919800022001", role: "MANAGER" },
    { id: uid("usr"), ownerId, name: "Anjali", phone: "+919800033002", role: "STAFF" },
    { id: uid("usr"), ownerId, name: "Suresh", phone: "+919800044003", role: "MANAGER" },
    { id: uid("usr"), ownerId, name: "Lakshmi", phone: "+919800055004", role: "STAFF" },
  ];
  await prisma.user.createMany({ data: users });
  const ownerUser = users[0];
  const managers = users.filter((u) => u.role === "OWNER" || u.role === "MANAGER");
  const staffNames = users.map((u) => u.name);

  // ── Channels ──
  const channels: Prisma.ChannelSourceCreateManyInput[] = DEFAULT_CHANNELS.map((c) => ({
    id: uid("chn"),
    ownerId,
    key: c.key,
    name: c.name,
    color: c.color,
  }));
  await prisma.channelSource.createMany({ data: channels });
  // weight: direct + word-of-mouth heavier than OTAs
  const channelWeights: [string, number][] = [
    ["direct", 9],
    ["whatsapp", 7],
    ["phone", 6],
    ["instagram", 4],
    ["booking", 5],
    ["airbnb", 4],
    ["mmt", 3],
    ["walkin", 3],
  ];
  const channelIdByKey = Object.fromEntries(channels.map((c) => [c.key, c.id!]));

  // ── Guests (CRM pool) ──
  const guests: Prisma.GuestCreateManyInput[] = [];
  const guestRecs: GuestRec[] = [];
  // phone is @@unique([ownerId, phone]); guard against the (vanishingly rare) faker
  // collision by regenerating — faker stays deterministic, so this is reproducible.
  const usedPhones = new Set<string>();
  const uniquePhone = (gen: () => string): string => {
    let p = gen();
    while (usedPhones.has(p)) p = gen();
    usedPhones.add(p);
    return p;
  };
  // faker's EN_IN city set has a few mangled "…Urban Agglomeration…" entries — skip them.
  const cleanCity = (gen: () => string): string => {
    let c = gen();
    while (/agglomeration/i.test(c)) c = gen();
    return c;
  };
  for (let i = 0; i < SCALE.guests; i++) {
    const id = uid("gst");
    const foreign = chance(0.08);
    let name: string, phone: string, city: string, nationality: string | null, email: string | null;
    if (foreign) {
      const loc = pick(FOREIGN_LOCALES);
      name = loc.faker.person.fullName();
      nationality = loc.nat;
      city = cleanCity(() => loc.faker.location.city());
      phone = uniquePhone(
        () =>
          `${loc.cc} ${loc.faker.string.numeric({ length: { min: 8, max: 10 }, allowLeadingZeros: false })}`,
      );
      email = chance(0.9) ? loc.faker.internet.email().toLowerCase() : null;
    } else {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      name = `${firstName} ${lastName}`;
      nationality = null;
      city = cleanCity(() => faker.location.city());
      // normalize faker's mixed IN formats (dashes/spacing) to a uniform +91XXXXXXXXXX
      phone = uniquePhone(() => `+91${faker.phone.number().replace(/\D/g, "").slice(-10)}`);
      email = chance(0.9) ? faker.internet.email({ firstName, lastName }).toLowerCase() : null;
    }
    guests.push({
      id,
      ownerId,
      name,
      phone,
      email,
      city,
      isForeign: foreign,
      nationality,
      idType: foreign
        ? "PASSPORT"
        : weighted([
            ["AADHAAR", 7],
            ["DRIVING_LICENSE", 2],
            ["VOTER_ID", 1],
          ]),
      idLast4: String(randint(1000, 9999)),
      marketingConsent: chance(0.6),
      dpdpConsentAt: chance(0.85) ? new Date(NOW - randint(1, 720) * DAY) : null,
      createdAt: new Date(NOW - randint(1, 720) * DAY),
    });
    guestRecs.push({ id, name, phone, email, isForeign: foreign });
  }
  await chunkedCreateMany(guests, (d) => prisma.guest.createMany({ data: d }));
  // a "frequent" core (front of the pool) repeats; the long tail are mostly one-time guests
  const frequentCount = Math.max(1, Math.floor(SCALE.guests * 0.15));
  const pickGuest = (): GuestRec =>
    chance(0.4) ? guestRecs[randint(0, frequentCount - 1)] : pick(guestRecs);

  // ── Notification templates ──
  const templateRows: Prisma.NotificationTemplateCreateManyInput[] = TEMPLATES.map((t) => ({
    id: uid("ntpl"),
    ownerId,
    channel: t.channel,
    triggerKey: t.triggerKey,
    name: t.name,
    subject: t.subject,
    body: t.body,
    dltTemplateId: t.dlt,
    whatsappTemplateName: t.wa,
  }));
  await prisma.notificationTemplate.createMany({ data: templateRows });
  const templateIdBy = (channel: string, trigger: string) =>
    templateRows.find((t) => t.channel === channel && t.triggerKey === trigger)?.id ?? null;
  const templatesForTrigger = (trigger: string) =>
    TEMPLATES.filter((t) => t.triggerKey === trigger);

  // pre-arrival, payment-link and post-checkout automations
  const automations: Prisma.NotificationAutomationCreateManyInput[] = [
    {
      id: uid("auto"),
      ownerId,
      triggerKey: "PRE_ARRIVAL_24H",
      templateId: templateIdBy("WHATSAPP", "PRE_ARRIVAL_24H")!,
      delayMinutes: -1440,
    },
    {
      id: uid("auto"),
      ownerId,
      triggerKey: "POST_CHECKOUT_THANKS",
      templateId: templateIdBy("WHATSAPP", "POST_CHECKOUT_THANKS")!,
      delayMinutes: 720,
    },
    {
      id: uid("auto"),
      ownerId,
      triggerKey: "BOOKING_CONFIRMED",
      templateId: templateIdBy("WHATSAPP", "BOOKING_CONFIRMED")!,
      delayMinutes: 0,
    },
  ];
  await prisma.notificationAutomation.createMany({ data: automations });

  // ── accumulators for everything generated per-property ──
  const properties: Prisma.PropertyCreateManyInput[] = [];
  const roomTypeRows: Prisma.RoomTypeCreateManyInput[] = [];
  const roomRows: Prisma.RoomCreateManyInput[] = [];
  const ratePlanRows: Prisma.RatePlanCreateManyInput[] = [];
  const overrideRows: Prisma.RatePlanOverrideCreateManyInput[] = [];
  const maintRows: Prisma.MaintenanceBlockCreateManyInput[] = [];
  const bookingRows: Prisma.BookingCreateManyInput[] = [];
  const bookingRoomRows: Prisma.BookingRoomCreateManyInput[] = [];
  const bookingGuestRows: Prisma.BookingGuestCreateManyInput[] = [];
  const linkRows: Prisma.PaymentLinkCreateManyInput[] = [];
  const paymentRows: Prisma.PaymentCreateManyInput[] = [];
  const refundRows: Prisma.RefundCreateManyInput[] = [];
  const notifRows: Prisma.NotificationLogCreateManyInput[] = [];

  // booking descriptors for the activity feed
  interface BkRec {
    id: string;
    ref: string;
    status: BStatus;
    checkInMs: number;
    checkOutMs: number;
    guest: GuestRec;
    propName: string;
    roomName: string;
    total: number;
    paid: number;
  }
  const bkRecs: BkRec[] = [];

  // daily occupancy accumulator (past nights only): key `${propId}|${dateMs}`
  const occByPropDate = new Map<string, { sold: number; rev: number }>();

  let refSeq = 0;

  const activeProperties = PROPERTIES.slice(0, SCALE.properties);
  for (const bp of activeProperties) {
    const propId = uid("prop");
    properties.push({
      id: propId,
      ownerId,
      name: bp.name,
      addressLine1: bp.addressLine1,
      city: bp.city,
      state: bp.state,
      pincode: bp.pincode,
      gstin: bp.gstin,
      cancellationPolicy: bp.cancellationPolicy,
      paymentInstructions: bp.paymentInstructions,
      invoicePrefix: bp.prefix,
    });
    const hasGstin = !!bp.gstin;

    // room types + rooms
    interface RoomRec {
      id: string;
      roomTypeId: string;
      base: number;
      occ: number;
      name: string;
    }
    const propRooms: RoomRec[] = [];
    const rtByBase: { roomTypeId: string; base: number }[] = [];
    let nameIdx = 0;
    bp.roomTypes.forEach((rt, ti) => {
      const roomTypeId = uid("rt");
      roomTypeRows.push({
        id: roomTypeId,
        propertyId: propId,
        name: rt.name,
        color: rt.color,
        baseRate: rt.base,
        maxOccupancy: rt.occ,
        sortOrder: ti,
      });
      rtByBase.push({ roomTypeId, base: rt.base });
      const roomCount = Math.min(rt.count, SCALE.roomCap);
      for (let i = 0; i < roomCount; i++) {
        const roomId = uid("room");
        const roomName = ROOM_NAMES[nameIdx % ROOM_NAMES.length];
        const cleanliness = weighted<"CLEAN" | "DIRTY" | "IN_PROGRESS" | "OUT_OF_ORDER">([
          ["CLEAN", 80],
          ["DIRTY", 10],
          ["IN_PROGRESS", 7],
          ["OUT_OF_ORDER", 3],
        ]);
        roomRows.push({
          id: roomId,
          propertyId: propId,
          roomTypeId,
          name: roomName,
          number: String(101 + nameIdx),
          cleanliness,
        });
        propRooms.push({ id: roomId, roomTypeId, base: rt.base, occ: rt.occ, name: roomName });
        nameIdx++;
      }
    });

    // rate plans: a whole-window "Weekend Rates" plan (Fri+Sat uplift) + a seasonal peak.
    const plans: PlanLike[] = [];
    const weekendId = uid("rp");
    const weekendPlan: PlanLike = {
      startDate: new Date(WIN_START),
      endDate: new Date(WIN_END),
      priority: 1,
      daysOfWeek: "0000110", // Fri, Sat
      overrides: rtByBase.map((r) => ({
        roomTypeId: r.roomTypeId,
        amount: Math.round(r.base * 1.18),
      })),
    };
    plans.push(weekendPlan);
    ratePlanRows.push({
      id: weekendId,
      propertyId: propId,
      name: "Weekend Rates",
      priority: 1,
      startDate: weekendPlan.startDate,
      endDate: weekendPlan.endDate,
      daysOfWeek: "0000110",
    });
    for (const o of weekendPlan.overrides)
      overrideRows.push({
        id: uid("rpo"),
        ratePlanId: weekendId,
        roomTypeId: o.roomTypeId,
        amount: o.amount,
      });

    const seasonId = uid("rp");
    const seasonStart = addDays(T0, bp.season.offset);
    const seasonEnd = addDays(seasonStart, bp.season.len);
    const seasonPlan: PlanLike = {
      startDate: seasonStart,
      endDate: seasonEnd,
      priority: 10,
      daysOfWeek: "1111111",
      overrides: rtByBase.map((r) => ({
        roomTypeId: r.roomTypeId,
        amount: Math.round(r.base * bp.season.mult),
      })),
    };
    plans.push(seasonPlan);
    ratePlanRows.push({
      id: seasonId,
      propertyId: propId,
      name: bp.season.name,
      priority: 10,
      startDate: seasonStart,
      endDate: seasonEnd,
      daysOfWeek: "1111111",
    });
    for (const o of seasonPlan.overrides)
      overrideRows.push({
        id: uid("rpo"),
        ratePlanId: seasonId,
        roomTypeId: o.roomTypeId,
        amount: o.amount,
      });

    // maintenance blocks: ~15% of rooms get a 1–4 night block somewhere in the window.
    const blocksByRoom = new Map<string, { start: number; end: number }[]>();
    const blockCount = Math.max(1, Math.round(propRooms.length * 0.15));
    for (let i = 0; i < blockCount; i++) {
      const room = pick(propRooms);
      const startMs = T0ms + randint(-Math.floor(SCALE.pastDays / 3), SCALE.futureDays) * DAY;
      const len = randint(1, 4);
      const endMs = startMs + len * DAY;
      const list = blocksByRoom.get(room.id) ?? [];
      list.push({ start: startMs, end: endMs });
      blocksByRoom.set(room.id, list);
      maintRows.push({
        id: uid("mnt"),
        propertyId: propId,
        roomId: room.id,
        startDate: new Date(startMs),
        endDate: new Date(endMs),
        reason: pick(MAINT_REASONS),
        createdById: pick(managers).id!,
      });
    }

    // ── fill each room's calendar with stays (sequential per room → no (roomId,date)
    //    collisions; gap distribution targets ~70% occupancy) ──
    for (const room of propRooms) {
      const blocks = (blocksByRoom.get(room.id) ?? []).sort((a, b) => a.start - b.start);
      const inBlock = (ms: number) => blocks.find((b) => ms >= b.start && ms < b.end);
      const nextBlock = (ms: number) => blocks.find((b) => b.start >= ms);
      const gapBias = weighted([
        [0.8, 3],
        [1, 4],
        [1.5, 2],
        [2.2, 1],
      ]); // some rooms run emptier

      let cursor = WIN_START;
      while (cursor < WIN_END) {
        const blk = inBlock(cursor);
        if (blk) {
          cursor = blk.end;
          continue;
        }
        const len = weighted([
          [1, 18],
          [2, 32],
          [3, 22],
          [4, 12],
          [5, 8],
          [6, 4],
          [7, 4],
        ]);
        let endMs = Math.min(cursor + len * DAY, WIN_END);
        const nb = nextBlock(cursor);
        if (nb && nb.start < endMs) endMs = nb.start;
        const nights = Math.round((endMs - cursor) / DAY);
        if (nights < 1) {
          cursor += DAY;
          continue;
        }

        const checkInMs = cursor;
        const checkOutMs = endMs;
        const status = deriveStatus(checkInMs, checkOutMs);
        const nightDates = eachNight(checkInMs, checkOutMs);
        const rates = nightDates.map((d) => resolveRate(d, room.roomTypeId, room.base, plans));
        const subtotal = rates.reduce((a, b) => a + b, 0);
        const tax = hasGstin ? rates.reduce((a, r) => a + Math.round(r * gstRate(r)), 0) : 0;
        const total = subtotal + tax;

        const guest = pickGuest();
        const channelKey = weighted(channelWeights);
        const bookingId = uid("bk");
        refSeq += 1;
        const ref = `SK-${(100_000 + refSeq).toString(36).toUpperCase()}`;
        const adults = Math.max(1, randint(1, room.occ));
        const children = adults < room.occ && chance(0.25) ? randint(1, room.occ - adults) : 0;

        // payment plan → amountPaid (kept == sum of CAPTURED payments)
        const payState: "full" | "part" | "none" =
          status === "CHECKED_OUT"
            ? weighted([
                ["full", 12],
                ["part", 1],
                ["none", 0],
              ])
            : status === "CHECKED_IN"
              ? weighted([
                  ["full", 5],
                  ["part", 4],
                  ["none", 1],
                ])
              : status === "CONFIRMED"
                ? weighted([
                    ["full", 3],
                    ["part", 4.5],
                    ["none", 2.5],
                  ])
                : status === "TENTATIVE"
                  ? weighted([
                      ["part", 1.5],
                      ["none", 8.5],
                    ])
                  : status === "CANCELLED"
                    ? weighted([
                        ["part", 4],
                        ["none", 6],
                      ])
                    : "none"; // NO_SHOW
        let paid = 0;
        if (payState === "full") paid = total;
        else if (payState === "part") {
          const frac =
            status === "CHECKED_OUT"
              ? pick([0.8, 0.9])
              : status === "CANCELLED"
                ? pick([0.2, 0.3, 0.5])
                : status === "TENTATIVE"
                  ? 0.25
                  : pick([0.25, 0.3, 0.4, 0.5, 0.6]);
          paid = Math.round(total * frac);
        }

        const bookedAhead = randint(1, 40);
        const createdAtMs = Math.min(checkInMs - bookedAhead * DAY, NOW - randint(0, 120) * 60_000);
        const checkedInAt =
          status === "CHECKED_IN" || status === "CHECKED_OUT"
            ? new Date(checkInMs + 14 * 3_600_000 + 30 * 60_000)
            : null;
        const checkedOutAt =
          status === "CHECKED_OUT" ? new Date(checkOutMs + 11 * 3_600_000) : null;
        const filesForm =
          guest.isForeign && checkedInAt ? new Date(checkInMs + 16 * 3_600_000) : null;
        const cancelledAt =
          status === "CANCELLED" ? new Date(Math.min(NOW, checkInMs) - randint(1, 10) * DAY) : null;

        bookingRows.push({
          id: bookingId,
          ref,
          propertyId: propId,
          channelId: channelIdByKey[channelKey],
          status,
          checkIn: new Date(checkInMs),
          checkOut: new Date(checkOutMs),
          adults,
          children,
          subtotal,
          taxAmount: tax,
          totalAmount: total,
          amountPaid: paid,
          notes: chance(0.18) ? pick(STAFF_NOTES) : null,
          arrivalTime:
            (status === "CONFIRMED" || status === "CHECKED_IN") && chance(0.3)
              ? pick(ARRIVAL_TIMES)
              : null,
          guestRequests: chance(0.2) ? pick(REQUESTS) : null,
          cancelledAt,
          cancelRequestedAt:
            cancelledAt && chance(0.5)
              ? new Date(cancelledAt.getTime() - randint(2, 48) * 3_600_000)
              : null,
          cancellationReason: cancelledAt ? pick(CANCEL_REASONS) : null,
          checkedInAt,
          checkedOutAt,
          formCFiledAt: filesForm,
          createdById: pick(users).id,
          createdViaMcp: chance(0.12),
          createdAt: new Date(createdAtMs),
        });
        bookingGuestRows.push({ id: uid("bg"), bookingId, guestId: guest.id, isPrimary: true });

        // CANCELLED / NO_SHOW release inventory → no BookingRoom rows (matches the app).
        const holdsInventory = status !== "CANCELLED" && status !== "NO_SHOW";
        if (holdsInventory) {
          nightDates.forEach((d, i) => {
            bookingRoomRows.push({
              id: uid("br"),
              bookingId,
              roomId: room.id,
              date: d,
              rateApplied: rates[i],
            });
            // tally past-night occupancy for DailyOccupancy snapshots
            if (
              d.getTime() < T0ms &&
              (status === "CONFIRMED" || status === "CHECKED_IN" || status === "CHECKED_OUT")
            ) {
              const key = `${propId}|${d.getTime()}`;
              const cur = occByPropDate.get(key) ?? { sold: 0, rev: 0 };
              cur.sold += 1;
              cur.rev += rates[i];
              occByPropDate.set(key, cur);
            }
          });
        }

        // payment link + captured payment (and refunds for some cancellations)
        if (paid > 0) {
          const linkId = uid("plink");
          linkRows.push({
            id: linkId,
            bookingId,
            razorpayLinkId: `plink_${ref}`,
            shortUrl: `https://rzp.io/i/${ref}`,
            amount: total,
            status: paid >= total ? "PAID" : "PARTIALLY_PAID",
            paidAt: new Date(createdAtMs + randint(1, 72) * 3_600_000),
            createdAt: new Date(createdAtMs),
          });
          const payId = uid("pay");
          paymentRows.push({
            id: payId,
            bookingId,
            paymentLinkId: linkId,
            razorpayPaymentId: `pay_${ref}`,
            amount: paid,
            status: "CAPTURED",
            method: weighted(PAY_METHODS),
            capturedAt: new Date(createdAtMs + randint(1, 72) * 3_600_000),
            createdAt: new Date(createdAtMs),
          });
          if (status === "CANCELLED" && chance(0.7)) {
            const refundAmt = Math.round(paid * pick([0.5, 1.0]));
            refundRows.push({
              id: uid("rfnd"),
              bookingId,
              paymentId: payId,
              razorpayRefundId: `rfnd_${ref}`,
              amount: refundAmt,
              speed: chance(0.3) ? "optimum" : "normal",
              reason: "Cancellation refund",
              status: "PROCESSED",
              initiatedById: pick(managers).id!,
              createdAt: cancelledAt ?? new Date(createdAtMs),
              processedAt: cancelledAt
                ? new Date(cancelledAt.getTime() + randint(1, 48) * 3_600_000)
                : new Date(),
            });
          }
        } else if ((status === "CONFIRMED" || status === "TENTATIVE") && chance(0.5)) {
          // link sent but not yet paid
          linkRows.push({
            id: uid("plink"),
            bookingId,
            razorpayLinkId: `plink_${ref}`,
            shortUrl: `https://rzp.io/i/${ref}`,
            amount: total,
            status: "CREATED",
            createdAt: new Date(createdAtMs),
          });
        }

        bkRecs.push({
          id: bookingId,
          ref,
          status,
          checkInMs,
          checkOutMs,
          guest,
          propName: bp.name,
          roomName: room.name,
          total,
          paid,
        });

        cursor =
          endMs +
          Math.round(
            weighted([
              [0, 40],
              [1, 30],
              [2, 18],
              [3, 8],
              [4, 4],
            ]) * gapBias,
          ) *
            DAY;
      }
    }
  }

  // ── insert structural + booking data (FK-safe order) ──
  await prisma.property.createMany({ data: properties });
  await prisma.roomType.createMany({ data: roomTypeRows });
  await chunkedCreateMany(roomRows, (d) => prisma.room.createMany({ data: d }));
  await prisma.ratePlan.createMany({ data: ratePlanRows });
  await chunkedCreateMany(overrideRows, (d) => prisma.ratePlanOverride.createMany({ data: d }));

  // property scopes — spread staff across the new portfolio
  const propIds = properties.map((p) => p.id!);
  // [userIndex, propertyIndex, permissions] — filtered to whatever properties the
  // chosen size actually created, so smaller demos don't reference missing props.
  const scopeDefs: [number, number, string][] = [
    [1, 0, "bookings:write,payments:refund,reports:read"],
    [2, 0, "bookings:write"],
    [3, 1, "bookings:write,reports:read"],
    [1, 2, "bookings:write,reports:read"],
    [3, 3, "bookings:write,payments:refund,reports:read"],
    [3, 4, "bookings:write,reports:read"],
    [4, 5, "bookings:write"],
    [4, 6, "bookings:write"],
  ];
  const scopes: Prisma.PropertyScopeCreateManyInput[] = scopeDefs
    .filter(([, pi]) => propIds[pi] !== undefined)
    .map(([ui, pi, permissions]) => ({
      userId: users[ui].id!,
      propertyId: propIds[pi],
      permissions,
    }));
  await prisma.propertyScope.createMany({ data: scopes });

  await chunkedCreateMany(maintRows, (d) => prisma.maintenanceBlock.createMany({ data: d }));
  await chunkedCreateMany(bookingRows, (d) => prisma.booking.createMany({ data: d }));
  await chunkedCreateMany(bookingRoomRows, (d) => prisma.bookingRoom.createMany({ data: d }));
  await chunkedCreateMany(bookingGuestRows, (d) => prisma.bookingGuest.createMany({ data: d }));
  await chunkedCreateMany(linkRows, (d) => prisma.paymentLink.createMany({ data: d }));
  await chunkedCreateMany(paymentRows, (d) => prisma.payment.createMany({ data: d }));
  await chunkedCreateMany(refundRows, (d) => prisma.refund.createMany({ data: d }));

  // ── Notification log (derived from bookings; capped) ──
  const notifStatus = (): "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "FAILED" | "DLQ" =>
    weighted([
      ["DELIVERED", 70],
      ["SENT", 15],
      ["QUEUED", 6],
      ["SENDING", 2],
      ["FAILED", 5],
      ["DLQ", 2],
    ]);
  function addNotif(rec: BkRec, trigger: string, scheduledForMs: number) {
    if (notifRows.length >= SCALE.maxNotifications) return;
    const opts = templatesForTrigger(trigger);
    if (opts.length === 0) return;
    const t = pick(opts);
    const status = notifStatus();
    const to = t.channel === "EMAIL" ? (rec.guest.email ?? rec.guest.phone) : rec.guest.phone;
    const sent = status === "SENT" || status === "DELIVERED";
    notifRows.push({
      id: uid("nlog"),
      bookingId: rec.id,
      channel: t.channel,
      to,
      templateId: templateIdBy(t.channel, trigger),
      triggerKey: trigger,
      status,
      attempts: status === "FAILED" || status === "DLQ" ? randint(2, 5) : 1,
      lastError: status === "FAILED" || status === "DLQ" ? "Provider timeout (gateway 504)" : null,
      providerMessageId: sent ? uid("msg") : null,
      payload: JSON.stringify({ body: t.body.slice(0, 80), name: rec.guest.name }),
      scheduledFor: new Date(scheduledForMs),
      sentAt: sent ? new Date(scheduledForMs + randint(1, 30) * 60_000) : null,
      deliveredAt:
        status === "DELIVERED" ? new Date(scheduledForMs + randint(31, 120) * 60_000) : null,
      createdAt: new Date(scheduledForMs - randint(1, 10) * 60_000),
    });
  }
  for (const rec of bkRecs) {
    if (notifRows.length >= SCALE.maxNotifications) break;
    if (!chance(0.3)) continue;
    addNotif(
      rec,
      rec.status === "TENTATIVE" ? "BOOKING_TENTATIVE" : "BOOKING_CONFIRMED",
      rec.checkInMs - randint(1, 30) * DAY,
    );
    if (rec.paid < rec.total && chance(0.6))
      addNotif(rec, "PAYMENT_LINK_SENT", rec.checkInMs - randint(1, 20) * DAY);
    if (rec.paid > 0 && chance(0.4))
      addNotif(rec, "PAYMENT_RECEIVED", rec.checkInMs - randint(0, 15) * DAY);
    if (rec.checkInMs > T0ms && rec.checkInMs - T0ms <= 2 * DAY)
      addNotif(rec, "PRE_ARRIVAL_24H", rec.checkInMs - DAY);
    if (rec.status === "CHECKED_OUT" && chance(0.5))
      addNotif(rec, "POST_CHECKOUT_THANKS", rec.checkOutMs + 12 * 3_600_000);
    if (rec.status === "CANCELLED") addNotif(rec, "CANCELLED", rec.checkInMs - randint(1, 5) * DAY);
    if (
      rec.guest.isForeign &&
      (rec.status === "CHECKED_IN" || rec.status === "CONFIRMED") &&
      chance(0.6)
    )
      addNotif(rec, "FORM_C_REMINDER", rec.checkInMs - randint(0, 2) * DAY);
  }
  await chunkedCreateMany(notifRows, (d) => prisma.notificationLog.createMany({ data: d }));

  // ── Activity feed (AuditLog) — recent, spread over the last ~14 days ──
  const recent = bkRecs.filter((r) => Math.abs(r.checkInMs - T0ms) < 30 * DAY);
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  const inr = (paise: number) => `₹ ${(paise / 100).toLocaleString("en-IN")}`;
  for (let i = 0; i < SCALE.auditEntries; i++) {
    const rec = pick(recent.length ? recent : bkRecs);
    const minutesAgo = randint(1, 14 * 24 * 60);
    const kind = weighted([
      ["BOOKING_CREATED", 5],
      ["PAYMENT_CAPTURED", 4],
      ["CHECKED_IN", 3],
      ["CHECKED_OUT", 3],
      ["ROOM_STATUS", 2],
      ["BOOKING_MODIFIED", 2],
      ["PAYMENT_LINK_SENT", 3],
      ["CANCELLED", 1],
    ]);
    let actorType = weighted([
      ["USER", 6],
      ["MCP", 2],
      ["SYSTEM", 2],
      ["GUEST", 1],
    ]);
    let actorName =
      actorType === "USER"
        ? pick(staffNames)
        : actorType === "MCP"
          ? "Claude (AI)"
          : actorType === "SYSTEM"
            ? "System"
            : rec.guest.name;
    let summary: string;
    switch (kind) {
      case "BOOKING_CREATED":
        summary = `created booking ${rec.ref} for ${rec.guest.name}`;
        break;
      case "PAYMENT_CAPTURED":
        actorType = "SYSTEM";
        actorName = "System";
        summary = `received ${inr(Math.max(1, rec.paid))} from ${rec.guest.name}`;
        break;
      case "CHECKED_IN":
        summary = `checked in ${rec.guest.name} — ${rec.roomName}`;
        break;
      case "CHECKED_OUT":
        summary = `checked out ${rec.guest.name} — ${rec.roomName}`;
        break;
      case "ROOM_STATUS":
        summary = `marked ${rec.roomName} as ${pick(["clean", "dirty", "in progress"])}`;
        break;
      case "BOOKING_MODIFIED":
        summary = `modified stay dates for ${rec.guest.name} — ${rec.ref}`;
        break;
      case "PAYMENT_LINK_SENT":
        summary = `sent payment link to ${rec.guest.name}`;
        break;
      default:
        summary = `cancelled booking ${rec.ref} (${rec.guest.name})`;
    }
    auditRows.push({
      id: uid("aud"),
      ownerId,
      actorType,
      actorName,
      action: kind,
      entityType: "Booking",
      entityId: rec.id,
      summary,
      createdAt: new Date(NOW - minutesAgo * 60_000),
    });
  }
  await chunkedCreateMany(auditRows, (d) => prisma.auditLog.createMany({ data: d }));

  // ── MCP OAuth client + token + audit entries ──
  const clientId = uid("mcpc");
  await prisma.mcpOAuthClient.create({
    data: {
      id: clientId,
      ownerId,
      clientId: "cimd_claude_ai",
      clientName: "Claude — Priya's workspace",
      redirectUris: JSON.stringify(["https://claude.ai/api/mcp/auth_callback"]),
      scopes:
        "bookings:read,bookings:write,payments:read,notifications:send,properties:read,reports:read,bookings:cancel,payments:refund",
    },
  });
  await prisma.mcpAccessToken.create({
    data: {
      id: uid("mcpt"),
      clientId,
      userId: ownerUser.id!,
      scopes:
        "bookings:read,bookings:write,payments:read,notifications:send,properties:read,reports:read",
      tokenHash: uid("tokhash"),
      expiresAt: new Date(NOW + 15 * 60_000),
      resource: "https://coorgcoffee.staykit.app/mcp",
      lastUsedAt: new Date(NOW - 4 * 60_000),
    },
  });
  const mcpTools: [string, "OK" | "DENIED" | "ERROR"][] = [
    ["list_bookings", "OK"],
    ["get_kpis", "OK"],
    ["send_notification", "OK"],
    ["create_booking", "OK"],
    ["modify_booking", "OK"],
    ["get_availability", "OK"],
    ["send_payment_link", "OK"],
    ["initiate_refund", "DENIED"],
    ["list_guests", "OK"],
    ["get_booking", "OK"],
    ["check_in_guest", "OK"],
    ["mark_room_clean", "OK"],
  ];
  const mcpRows: Prisma.McpAuditEntryCreateManyInput[] = [];
  for (let i = 0; i < 30; i++) {
    const [tool, status] = pick(mcpTools);
    const rec = pick(bkRecs);
    mcpRows.push({
      id: uid("mcpa"),
      userId: ownerUser.id!,
      clientId,
      tool,
      args: JSON.stringify({ ref: rec.ref }),
      durationMs: 50 + Math.floor(rnd() * 400),
      status,
      result: status === "OK" ? JSON.stringify({ ok: true }) : null,
      createdAt: new Date(NOW - randint(1, 5 * 24 * 60) * 60_000),
    });
  }
  await prisma.mcpAuditEntry.createMany({ data: mcpRows });

  // ── DailyOccupancy snapshots for past nights (pre-populated so analytics jobs have history) ──
  const occRows: Prisma.DailyOccupancyCreateManyInput[] = [];
  const roomsPerProp = new Map<string, number>();
  for (const r of roomRows)
    roomsPerProp.set(r.propertyId, (roomsPerProp.get(r.propertyId) ?? 0) + 1);
  for (const p of properties) {
    const total = roomsPerProp.get(p.id!) ?? 0;
    for (let t = WIN_START; t < T0ms; t += DAY) {
      const cur = occByPropDate.get(`${p.id}|${t}`);
      occRows.push({
        id: uid("occ"),
        propertyId: p.id!,
        date: new Date(t),
        roomsTotal: total,
        roomsSold: cur?.sold ?? 0,
        revenue: cur?.rev ?? 0,
      });
    }
  }
  await chunkedCreateMany(occRows, (d) => prisma.dailyOccupancy.createMany({ data: d }));

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log("\nSeed complete:");
  console.log(`  Owner:        Priya Raghavan (+919800014782)`);
  console.log(`  Properties:   ${properties.length}`);
  console.log(`  Rooms:        ${roomRows.length}`);
  console.log(`  Guests:       ${guests.length}`);
  console.log(`  Bookings:     ${bookingRows.length}  (room-nights: ${bookingRoomRows.length})`);
  console.log(
    `  Payments:     ${paymentRows.length}  links: ${linkRows.length}  refunds: ${refundRows.length}`,
  );
  console.log(
    `  Notifications:${notifRows.length}  Audit: ${auditRows.length}  Occupancy snapshots: ${occRows.length}`,
  );
  console.log(`  Done in ${elapsed}s`);
}

/** createMany in chunks to stay well under SQLite's bound-parameter limit. */
async function chunkedCreateMany<T>(
  rows: T[],
  run: (slice: T[]) => Promise<unknown>,
  size = 400,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) await run(rows.slice(i, i + size));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
