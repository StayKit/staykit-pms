/**
 * Seed data mirroring the design prototype (design/data.js). Bookings are placed
 * relative to "today" so the tape chart always looks live. Run with `npm run db:seed`.
 */
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function resolveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("file:")) return url;
  const [filePart, query] = url.slice("file:".length).split("?");
  if (path.isAbsolute(filePart)) return url;
  return `file:${path.resolve(process.cwd(), filePart)}${query ? "?" + query : ""}`;
}

const prisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });

// ── date helpers (UTC-midnight, IST calendar day) ──
function today(): Date {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(`${ymd}T00:00:00.000Z`);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function eachNight(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let d = new Date(start); d < end; d = addDays(d, 1)) out.push(new Date(d));
  return out;
}
const T0 = today();

// inclusive total (paise) → {subtotal, tax} assuming 5% GST inclusive
function split5(totalPaise: number) {
  const subtotal = Math.round(totalPaise / 1.05);
  return { subtotal, tax: totalPaise - subtotal };
}

const DEFAULT_CHANNELS = [
  { key: "direct", name: "Direct", color: "#1B5E5A" },
  { key: "walkin", name: "Walk-in", color: "#4A5550" },
  { key: "phone", name: "Phone", color: "#534E83" },
  { key: "instagram", name: "Instagram", color: "#9A2E76" },
  { key: "whatsapp", name: "WhatsApp", color: "#1F6B30" },
  { key: "airbnb", name: "Airbnb", color: "#BD4327" },
  { key: "booking", name: "Booking.com", color: "#29508A" },
  { key: "mmt", name: "MakeMyTrip", color: "#A36C0E" },
];

async function main() {
  console.log("Resetting data…");
  // Order matters for FK constraints; deleteMany on leaf tables first.
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
    prisma.room.deleteMany(),
    prisma.roomType.deleteMany(),
    prisma.channelSource.deleteMany(),
    prisma.guest.deleteMany(),
    prisma.propertyScope.deleteMany(),
    prisma.property.deleteMany(),
    prisma.user.deleteMany(),
    prisma.session.deleteMany(),
    prisma.otpRequest.deleteMany(),
    prisma.owner.deleteMany(),
  ]);

  // ── Owner + staff ──
  const owner = await prisma.owner.create({
    data: { name: "Priya Raghavan", email: "priya@example.in", phone: "+919800014782" },
  });

  const priya = await prisma.user.create({
    data: {
      ownerId: owner.id,
      name: "Priya R.",
      email: owner.email,
      phone: owner.phone,
      role: "OWNER",
    },
  });
  const rakesh = await prisma.user.create({
    data: { ownerId: owner.id, name: "Rakesh", phone: "+919800022001", role: "MANAGER" },
  });
  const anjali = await prisma.user.create({
    data: { ownerId: owner.id, name: "Anjali", phone: "+919800033002", role: "STAFF" },
  });

  // ── Channels ──
  for (const c of DEFAULT_CHANNELS) {
    await prisma.channelSource.create({ data: { ownerId: owner.id, ...c } });
  }
  const channelByKey = Object.fromEntries(
    (await prisma.channelSource.findMany({ where: { ownerId: owner.id } })).map((c) => [c.key, c]),
  );

  // ── Property 1: Coorg Coffee Cottage ──
  const p1 = await prisma.property.create({
    data: {
      ownerId: owner.id,
      name: "Coorg Coffee Cottage",
      addressLine1: "Plantation Road",
      city: "Madikeri",
      state: "KA",
      pincode: "571201",
      gstin: "29ABCDE1234F1Z5",
      cancellationPolicy: "Free cancellation up to 7 days before check-in.",
      invoicePrefix: "CCC",
    },
  });

  const rtDeluxe = await prisma.roomType.create({
    data: {
      propertyId: p1.id,
      name: "Deluxe Cottage",
      color: "#1B5E5A",
      baseRate: 6300_00,
      maxOccupancy: 3,
      sortOrder: 0,
    },
  });
  const rtStandard = await prisma.roomType.create({
    data: {
      propertyId: p1.id,
      name: "Standard Room",
      color: "#3D5A80",
      baseRate: 4200_00,
      maxOccupancy: 2,
      sortOrder: 1,
    },
  });
  const rtSuite = await prisma.roomType.create({
    data: {
      propertyId: p1.id,
      name: "Family Suite",
      color: "#E07A5F",
      baseRate: 7000_00,
      maxOccupancy: 4,
      sortOrder: 2,
    },
  });

  const roomDefs = [
    { key: "r-101", number: "101", name: "Plantation View", type: rtDeluxe.id, clean: "CLEAN" },
    { key: "r-102", number: "102", name: "Cardamom", type: rtDeluxe.id, clean: "DIRTY" },
    { key: "r-103", number: "103", name: "Hibiscus", type: rtDeluxe.id, clean: "CLEAN" },
    { key: "r-201", number: "201", name: "Garden Room", type: rtStandard.id, clean: "CLEAN" },
    { key: "r-202", number: "202", name: "Bamboo", type: rtStandard.id, clean: "IN_PROGRESS" },
    { key: "r-301", number: "301", name: "Coffee Suite", type: rtSuite.id, clean: "CLEAN" },
    { key: "r-302", number: "302", name: "Western Ghats", type: rtSuite.id, clean: "CLEAN" },
  ] as const;

  const roomByKey: Record<string, string> = {};
  for (const r of roomDefs) {
    const room = await prisma.room.create({
      data: {
        propertyId: p1.id,
        roomTypeId: r.type,
        name: r.name,
        number: r.number,
        cleanliness: r.clean,
      },
    });
    roomByKey[r.key] = room.id;
  }

  // A seasonal rate plan (Diwali Special) — higher deluxe rate on a date window.
  await prisma.ratePlan.create({
    data: {
      propertyId: p1.id,
      name: "Diwali Special",
      priority: 10,
      startDate: addDays(T0, 20),
      endDate: addDays(T0, 30),
      overrides: { create: [{ roomTypeId: rtDeluxe.id, amount: 8500_00 }] },
    },
  });

  // ── Property 2: Backwaters Verandah (no bookings; for the switcher) ──
  const p2 = await prisma.property.create({
    data: {
      ownerId: owner.id,
      name: "Backwaters Verandah",
      addressLine1: "Finishing Point",
      city: "Alleppey",
      state: "KL",
      pincode: "688013",
      cancellationPolicy: "Free cancellation up to 3 days before check-in.",
      invoicePrefix: "BWV",
    },
  });
  const rtHouseboat = await prisma.roomType.create({
    data: {
      propertyId: p2.id,
      name: "Houseboat",
      color: "#3D5A80",
      baseRate: 9500_00,
      maxOccupancy: 4,
    },
  });
  for (let i = 1; i <= 5; i++) {
    await prisma.room.create({
      data: {
        propertyId: p2.id,
        roomTypeId: rtHouseboat.id,
        name: `Houseboat ${i}`,
        number: String(i),
      },
    });
  }

  // Property scopes: Rakesh→p1 only; Anjali→p1 limited.
  await prisma.propertyScope.create({
    data: {
      userId: rakesh.id,
      propertyId: p1.id,
      permissions: "bookings:write,payments:refund,reports:read",
    },
  });
  await prisma.propertyScope.create({
    data: { userId: anjali.id, propertyId: p1.id, permissions: "bookings:write" },
  });

  // ── Guests ──
  const guestDefs = [
    {
      key: "g1",
      name: "Sameer Khan",
      phone: "+919800014782",
      email: "sameer.k@gmail.com",
      city: "Bengaluru",
    },
    {
      key: "g2",
      name: "Anika Mehta",
      phone: "+919800088301",
      email: "anika.mehta@outlook.com",
      city: "Mumbai",
    },
    {
      key: "g3",
      name: "Rohan Iyer",
      phone: "+919900030217",
      email: "rohan@iyer.in",
      city: "Chennai",
    },
    {
      key: "g4",
      name: "Priyanka Joshi",
      phone: "+919800071109",
      email: "p.joshi@gmail.com",
      city: "Pune",
    },
    {
      key: "g5",
      name: "Daniel Müller",
      phone: "+4915245670000",
      email: "d.mueller@web.de",
      city: "Berlin",
      foreign: true,
      nationality: "German",
    },
    {
      key: "g6",
      name: "Vikram Singh",
      phone: "+919800041023",
      email: "vik.singh@yahoo.in",
      city: "Delhi",
    },
    {
      key: "g7",
      name: "Meera Krishnan",
      phone: "+919900080921",
      email: "meera.k@gmail.com",
      city: "Kochi",
    },
    {
      key: "g8",
      name: "Arjun Reddy",
      phone: "+919800055619",
      email: "arjun.r@hotmail.com",
      city: "Hyderabad",
    },
    {
      key: "g9",
      name: "Catherine Wong",
      phone: "+6591230000",
      email: "cwong@gmail.com",
      city: "Singapore",
      foreign: true,
      nationality: "Singaporean",
    },
  ] as const;

  const guestByKey: Record<string, string> = {};
  for (const g of guestDefs) {
    const guest = await prisma.guest.create({
      data: {
        ownerId: owner.id,
        name: g.name,
        phone: g.phone,
        email: g.email,
        city: g.city,
        isForeign: "foreign" in g ? g.foreign : false,
        nationality: "nationality" in g ? g.nationality : null,
        marketingConsent: true,
        dpdpConsentAt: new Date(),
        idType: "foreign" in g && g.foreign ? "PASSPORT" : "AADHAAR",
        idLast4: String(1000 + Math.floor(Math.random() * 8999)),
      },
    });
    guestByKey[g.key] = guest.id;
  }

  // ── Bookings (offsets relative to today) ──
  const bookingDefs = [
    {
      ref: "SK-CO2401",
      room: "r-101",
      guest: "g3",
      start: -4,
      end: -1,
      src: "direct",
      total: 18900,
      paid: 18900,
      status: "CHECKED_OUT",
    },
    {
      ref: "SK-CO2402",
      room: "r-201",
      guest: "g4",
      start: -3,
      end: 0,
      src: "phone",
      total: 11400,
      paid: 11400,
      status: "CHECKED_IN",
      adults: 2,
      children: 1,
    },
    {
      ref: "SK-CO2403",
      room: "r-103",
      guest: "g1",
      start: 0,
      end: 3,
      src: "direct",
      total: 18900,
      paid: 9450,
      status: "CONFIRMED",
    },
    {
      ref: "SK-CO2404",
      room: "r-202",
      guest: "g2",
      start: 0,
      end: 2,
      src: "airbnb",
      total: 8400,
      paid: 8400,
      status: "CONFIRMED",
    },
    {
      ref: "SK-CO2405",
      room: "r-302",
      guest: "g5",
      start: 0,
      end: 5,
      src: "booking",
      total: 39750,
      paid: 0,
      status: "CONFIRMED",
    },
    {
      ref: "SK-CO2406",
      room: "r-301",
      guest: "g6",
      start: -1,
      end: 2,
      src: "direct",
      total: 24300,
      paid: 24300,
      status: "CHECKED_IN",
      adults: 2,
      children: 2,
    },
    {
      ref: "SK-CO2407",
      room: "r-102",
      guest: "g7",
      start: 1,
      end: 4,
      src: "phone",
      total: 16800,
      paid: 0,
      status: "TENTATIVE",
    },
    {
      ref: "SK-CO2408",
      room: "r-101",
      guest: "g8",
      start: 2,
      end: 6,
      src: "mmt",
      total: 22400,
      paid: 11200,
      status: "CONFIRMED",
    },
    {
      ref: "SK-CO2409",
      room: "r-201",
      guest: "g9",
      start: 3,
      end: 7,
      src: "booking",
      total: 14000,
      paid: 14000,
      status: "CONFIRMED",
      adults: 1,
    },
    {
      ref: "SK-CO2410",
      room: "r-202",
      guest: "g4",
      start: 4,
      end: 8,
      src: "whatsapp",
      total: 16800,
      paid: 0,
      status: "CONFIRMED",
    },
    {
      ref: "SK-CO2411",
      room: "r-103",
      guest: "g6",
      start: 4,
      end: 6,
      src: "direct",
      total: 12600,
      paid: 6300,
      status: "CONFIRMED",
      children: 1,
    },
    {
      ref: "SK-CO2412",
      room: "r-302",
      guest: "g1",
      start: 6,
      end: 10,
      src: "instagram",
      total: 31800,
      paid: 31800,
      status: "CONFIRMED",
    },
    {
      ref: "SK-CO2413",
      room: "r-301",
      guest: "g3",
      start: 3,
      end: 5,
      src: "direct",
      total: 16200,
      paid: 0,
      status: "CONFIRMED",
    },
  ] as const;

  for (const b of bookingDefs) {
    const checkIn = addDays(T0, b.start);
    const checkOut = addDays(T0, b.end);
    const nights = eachNight(checkIn, checkOut);
    const totalPaise = b.total * 100;
    const { subtotal, tax } = split5(totalPaise);
    const ratePerNight = Math.round(totalPaise / nights.length);

    const booking = await prisma.booking.create({
      data: {
        ref: b.ref,
        propertyId: p1.id,
        channelId: channelByKey[b.src].id,
        status: b.status,
        checkIn,
        checkOut,
        adults: "adults" in b ? b.adults : 2,
        children: "children" in b ? b.children : 0,
        subtotal,
        taxAmount: tax,
        totalAmount: totalPaise,
        amountPaid: b.paid * 100,
        createdById: priya.id,
        checkedInAt:
          b.status === "CHECKED_IN" || b.status === "CHECKED_OUT" ? addDays(checkIn, 0) : null,
        checkedOutAt: b.status === "CHECKED_OUT" ? checkOut : null,
        guests: { create: { guestId: guestByKey[b.guest], isPrimary: true } },
        rooms: {
          create: nights.map((date) => ({
            roomId: roomByKey[b.room],
            date,
            rateApplied: ratePerNight,
          })),
        },
      },
    });

    // Payment links + payments for anything paid.
    if (b.paid > 0) {
      const link = await prisma.paymentLink.create({
        data: {
          bookingId: booking.id,
          razorpayLinkId: `plink_seed_${booking.ref}`,
          shortUrl: `https://rzp.io/i/${booking.ref}`,
          amount: totalPaise,
          status: b.paid >= b.total ? "PAID" : "PARTIALLY_PAID",
          paidAt: new Date(),
        },
      });
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          paymentLinkId: link.id,
          razorpayPaymentId: `pay_seed_${booking.ref}`,
          amount: b.paid * 100,
          status: "CAPTURED",
          method: "upi",
          capturedAt: new Date(),
        },
      });
    }
  }

  // Owner block (deep clean) on Cardamom yesterday.
  await prisma.maintenanceBlock.create({
    data: {
      propertyId: p1.id,
      roomId: roomByKey["r-102"],
      startDate: addDays(T0, -1),
      endDate: T0,
      reason: "Deep clean — A/C service",
      createdById: priya.id,
    },
  });

  // ── Notification templates (6 logical templates across channels) ──
  const templates: {
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
  ];
  for (const t of templates) {
    await prisma.notificationTemplate.create({
      data: {
        ownerId: owner.id,
        channel: t.channel,
        triggerKey: t.triggerKey,
        name: t.name,
        subject: t.subject,
        body: t.body,
        dltTemplateId: t.dlt,
        whatsappTemplateName: t.wa,
      },
    });
  }
  // A pre-arrival automation: 24h before check-in.
  const preArrival = await prisma.notificationTemplate.findFirst({
    where: { ownerId: owner.id, triggerKey: "PRE_ARRIVAL_24H" },
  });
  if (preArrival) {
    await prisma.notificationAutomation.create({
      data: {
        ownerId: owner.id,
        triggerKey: "PRE_ARRIVAL_24H",
        templateId: preArrival.id,
        delayMinutes: -1440,
      },
    });
  }

  // ── Activity feed (AuditLog) ──
  const activity = [
    {
      actorType: "USER",
      actorName: "Rakesh",
      action: "CHECKED_IN",
      summary: "checked in Anika Mehta — Bamboo (202)",
      min: 18,
    },
    {
      actorType: "MCP",
      actorName: "Claude (AI)",
      action: "PAYMENT_LINK_SENT",
      summary: "sent payment link to Daniel Müller",
      min: 52,
    },
    {
      actorType: "USER",
      actorName: "Priya",
      action: "BOOKING_CREATED",
      summary: "created booking SK-CO2403 for Sameer Khan",
      min: 89,
    },
    {
      actorType: "SYSTEM",
      actorName: "System",
      action: "PAYMENT_CAPTURED",
      summary: "received ₹ 11,200 from Arjun Reddy",
      min: 130,
    },
    {
      actorType: "USER",
      actorName: "Anjali",
      action: "ROOM_STATUS",
      summary: "marked Cardamom (102) as dirty",
      min: 166,
    },
    {
      actorType: "USER",
      actorName: "Rakesh",
      action: "BOOKING_MODIFIED",
      summary: "extended stay for Rohan Iyer — Coffee Suite",
      min: 600,
    },
  ];
  for (const a of activity) {
    await prisma.auditLog.create({
      data: {
        ownerId: owner.id,
        actorType: a.actorType,
        actorName: a.actorName,
        action: a.action,
        summary: a.summary,
        createdAt: new Date(Date.now() - a.min * 60_000),
      },
    });
  }

  // ── MCP OAuth client + token + audit entries ──
  const client = await prisma.mcpOAuthClient.create({
    data: {
      ownerId: owner.id,
      clientId: "cimd_claude_ai",
      clientName: "Claude — Priya's workspace",
      redirectUris: JSON.stringify(["https://claude.ai/api/mcp/auth_callback"]),
      scopes:
        "bookings:read,bookings:write,payments:read,notifications:send,properties:read,reports:read,bookings:cancel,payments:refund",
    },
  });
  await prisma.mcpAccessToken.create({
    data: {
      clientId: client.id,
      userId: priya.id,
      scopes: client.scopes,
      tokenHash: "seed-token-hash-placeholder",
      expiresAt: new Date(Date.now() + 15 * 60_000),
      resource: "https://coorgcoffee.staykit.app/mcp",
      lastUsedAt: new Date(Date.now() - 4 * 60_000),
    },
  });
  const mcpActions = [
    {
      tool: "send_notification",
      args: "to: Daniel Müller · template: payment_link",
      min: 52,
      status: "OK",
    },
    { tool: "list_bookings", args: "from: today, status: confirmed", min: 66, status: "OK" },
    { tool: "get_kpis", args: "range: 7d, properties: 2", min: 66, status: "OK" },
    { tool: "modify_booking", args: "SK-CO2411 · extend 1 night", min: 1100, status: "OK" },
    { tool: "initiate_refund", args: "SK-CO2400 · ₹ 4,500", min: 1280, status: "DENIED" },
  ];
  for (const m of mcpActions) {
    await prisma.mcpAuditEntry.create({
      data: {
        userId: priya.id,
        clientId: client.id,
        tool: m.tool,
        args: m.args,
        durationMs: 50 + Math.floor(Math.random() * 400),
        status: m.status,
        createdAt: new Date(Date.now() - m.min * 60_000),
      },
    });
  }

  console.log("Seed complete:");
  console.log(`  Owner: ${owner.name} (${owner.phone})`);
  console.log(`  Properties: ${p1.name}, ${p2.name}`);
  console.log(`  Bookings: ${bookingDefs.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
