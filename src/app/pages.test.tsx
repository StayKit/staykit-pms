import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";

const navState = vi.hoisted(() => ({ pathname: "/dashboard", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navState.search),
  redirect: (url: string) => {
    throw new Error("REDIRECT:" + url);
  },
  notFound: () => {
    throw new Error("NOTFOUND");
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={String(href)} {...p}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/auth/context", () => ({ getAppContext: vi.fn(), requireContext: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getGuestSession: vi.fn() }));
// No request scope in RSC unit tests: an empty cookie jar makes resolveActiveProperty fall back to
// the owner's first property — the same property these tests asserted against before the switcher.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { getAppContext } from "@/lib/auth/context";
import { getGuestSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { createBooking } from "@/lib/booking/engine";
import { createPaymentLinkForBooking, applyPayment } from "@/lib/payments/service";
import { today, addDays } from "@/lib/dates";
import { resetDb, seedBasic, addRoom, type Fixture } from "../../test/factories";
import { renderRSC } from "../../test/render-rsc";

const ctxMock = getAppContext as unknown as Mock;
const guestMock = getGuestSession as unknown as Mock;

let fx: Fixture;
let arrivingId: string;
let foreignPhone: string;

beforeEach(async () => {
  await resetDb();
  fx = await seedBasic(); // GST-registered property
  ctxMock.mockResolvedValue({
    ownerId: fx.owner.id,
    userId: fx.user.id,
    role: "OWNER",
    name: "Priya R.",
    propertyScopes: [],
    demo: true,
  });
  const r2 = await addRoom(fx.property.id, fx.roomType.id, "Room 2", "102");
  const r3 = await addRoom(fx.property.id, fx.roomType.id, "Room 3", "103");

  // Arriving today, unpaid → arrivals + pending payments + tape bar.
  const arriving = await createBooking({
    ownerId: fx.owner.id,
    propertyId: fx.property.id,
    roomId: fx.room.id,
    channelKey: "direct",
    checkIn: today(),
    checkOut: addDays(today(), 2),
    guest: { name: "Sameer Khan", phone: "+919812300000" },
    nightlyRatePaise: 6300_00,
  });
  arrivingId = arriving.id;
  await createPaymentLinkForBooking(arrivingId);
  // A partial payment so the booking-detail timeline shows a link AND a captured
  // payment AND a remaining balance.
  await applyPayment(arrivingId, 3000_00, { method: "upi", razorpayPaymentId: "pay_seed" });

  // Departing today, fully paid (covers the "no balance due" branches).
  const departing = await createBooking({
    ownerId: fx.owner.id,
    propertyId: fx.property.id,
    roomId: r2.id,
    channelKey: "phone",
    checkIn: addDays(today(), -2),
    checkOut: today(),
    guest: { name: "Anika Mehta", phone: "+919800088301" },
    nightlyRatePaise: 5000_00,
  });
  await applyPayment(departing.id, departing.totalAmount, { method: "upi" });

  // A second "direct" arrival, paid, foreign → covers paid arrival + foreign badge.
  foreignPhone = "+4915245670000";
  const foreign = await createBooking({
    ownerId: fx.owner.id,
    propertyId: fx.property.id,
    roomId: r3.id,
    channelKey: "direct",
    checkIn: today(),
    checkOut: addDays(today(), 3),
    guest: { name: "Daniel Müller", phone: foreignPhone, isForeign: true },
    nightlyRatePaise: 6000_00,
  });
  await applyPayment(foreign.id, foreign.totalAmount, { method: "card" });

  // A guest who has opted into marketing (covers both consent branches on /guests).
  await prisma.guest.create({
    data: {
      ownerId: fx.owner.id,
      name: "Meera Krishnan",
      phone: "+919900080921",
      marketingConsent: true,
      dpdpConsentAt: new Date(),
    },
  });

  // A maintenance block so the calendar renders the block branch.
  await prisma.maintenanceBlock.create({
    data: {
      propertyId: fx.property.id,
      roomId: r2.id,
      startDate: addDays(today(), -1),
      endDate: today(),
      reason: "Deep clean",
      createdById: fx.user.id,
    },
  });

  // Notification templates across all three channels + a trigger not in the label map.
  for (const [channel, trigger] of [
    ["SMS", "BOOKING_CONFIRMED"],
    ["EMAIL", "BOOKING_CONFIRMED"],
    ["WHATSAPP", "PAYMENT_LINK_SENT"],
    ["SMS", "REFUND_PROCESSED"],
  ] as const) {
    await prisma.notificationTemplate.create({
      data: { ownerId: fx.owner.id, channel, triggerKey: trigger, name: trigger, body: "Hi" },
    });
  }
  await prisma.notificationLog.create({
    data: {
      bookingId: arrivingId,
      channel: "WHATSAPP",
      to: "+91",
      triggerKey: "BOOKING_CONFIRMED",
      status: "SENT",
      scheduledFor: new Date(),
      sentAt: new Date(),
    },
  });
  // A still-queued message (no sentAt) → exercises the `sentAt ?? createdAt` fallback.
  await prisma.notificationLog.create({
    data: {
      bookingId: arrivingId,
      channel: "SMS",
      to: "+91",
      triggerKey: "PAYMENT_LINK_SENT",
      status: "QUEUED",
      scheduledFor: new Date(),
    },
  });

  // Activity feed: one row per actor type, at varying ages (covers relTime branches).
  for (const [actorType, mins] of [
    ["USER", 0],
    ["MCP", 5],
    ["SYSTEM", 90],
    ["USER", 60 * 26],
    ["USER", 60 * 24 * 3],
  ] as const) {
    await prisma.auditLog.create({
      data: {
        ownerId: fx.owner.id,
        actorType,
        actorName: actorType,
        action: "X",
        summary: "did a thing",
        createdAt: new Date(Date.now() - mins * 60_000),
      },
    });
  }

  // MCP client + token + audit (assistant page): one OK and one DENIED, backdated.
  const client = await prisma.mcpOAuthClient.create({
    data: {
      ownerId: fx.owner.id,
      clientId: "cimd",
      clientName: "Claude — Priya",
      redirectUris: "[]",
      scopes: "bookings:read,reports:read",
    },
  });
  await prisma.mcpAccessToken.create({
    data: {
      clientId: client.id,
      userId: fx.user.id,
      scopes: "bookings:read,reports:read",
      tokenHash: "h",
      expiresAt: new Date(Date.now() + 60000),
      resource: "x",
      lastUsedAt: new Date(Date.now() - 90 * 60_000),
    },
  });
  await prisma.mcpAuditEntry.create({
    data: {
      userId: fx.user.id,
      tool: "get_kpis",
      args: "{}",
      durationMs: 10,
      status: "OK",
      createdAt: new Date(Date.now() - 5 * 60_000),
    },
  });
  await prisma.mcpAuditEntry.create({
    data: {
      userId: fx.user.id,
      tool: "initiate_refund",
      args: "{}",
      durationMs: 10,
      status: "DENIED",
      createdAt: new Date(Date.now() - 60 * 26 * 60_000),
    },
  });
});

async function load(path: string) {
  return import(/* @vite-ignore */ path);
}

describe("owner pages", () => {
  it("dashboard renders KPIs, arrivals and the activity feed", async () => {
    const { default: Page } = await load("./(owner)/dashboard/page");
    const html = await renderRSC(Page());
    expect(html).toContain("Good day, Priya");
    expect(html).toContain("Sameer Khan");
    expect(html).toContain("Today&#x27;s arrivals");
  });

  it("dashboard handles an empty day", async () => {
    await prisma.notificationLog.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.paymentLink.deleteMany();
    await prisma.bookingRoom.deleteMany();
    await prisma.bookingGuest.deleteMany();
    await prisma.booking.deleteMany();
    const { default: Page } = await load("./(owner)/dashboard/page");
    const html = await renderRSC(Page());
    expect(html).toContain("Nothing on the books");
  });

  it("calendar renders the tape chart for the active property", async () => {
    const { default: Page } = await load("./(owner)/calendar/page");
    const html = await renderRSC(Page());
    expect(html).toContain("Calendar");
    expect(html).toContain("Deluxe");
  });

  it("bookings list renders rows and supports every filter", async () => {
    const { default: Page } = await load("./(owner)/bookings/page");
    for (const filter of ["all", "today", "unpaid", "tentative", "checkedin", "foreign"]) {
      const html = await renderRSC(Page({ searchParams: Promise.resolve({ filter }) }));
      expect(html).toContain("Bookings");
    }
    const searched = await renderRSC(Page({ searchParams: Promise.resolve({ q: "Sameer" }) }));
    expect(searched).toContain("Sameer Khan");
  });

  it("booking detail renders for a normal booking", async () => {
    const { default: Page } = await load("./(owner)/bookings/[id]/page");
    const html = await renderRSC(Page({ params: Promise.resolve({ id: arrivingId }) }));
    expect(html).toContain("Sameer Khan");
    expect(html).toContain("Rate breakdown");
  });

  it("booking detail calls notFound for an unknown id", async () => {
    const { default: Page } = await load("./(owner)/bookings/[id]/page");
    await expect(renderRSC(Page({ params: Promise.resolve({ id: "missing" }) }))).rejects.toThrow(
      "NOTFOUND",
    );
  });

  it("booking detail handles an owner block with no GST", async () => {
    const ch = await prisma.channelSource.findFirst({ where: { ownerId: fx.owner.id } });
    const bare = await prisma.booking.create({
      data: {
        ref: "SK-BARE9",
        propertyId: fx.property.id,
        channelId: ch!.id,
        checkIn: today(),
        checkOut: addDays(today(), 1),
        subtotal: 5000_00,
        taxAmount: 0,
        totalAmount: 5000_00,
        amountPaid: 0,
      },
    });
    const { default: Page } = await load("./(owner)/bookings/[id]/page");
    const html = await renderRSC(Page({ params: Promise.resolve({ id: bare.id }) }));
    expect(html).toContain("Owner block");
    expect(html).toContain("No GST");
  });

  it("guests, notifications, reports, assistant and settings pages render", async () => {
    expect(
      await renderRSC(
        (await load("./(owner)/guests/page")).default({ searchParams: Promise.resolve({}) }),
      ),
    ).toContain("address book");
    expect(
      await renderRSC(
        (await load("./(owner)/guests/page")).default({
          searchParams: Promise.resolve({ q: "Sameer" }),
        }),
      ),
    ).toContain("Sameer");
    expect(await renderRSC((await load("./(owner)/notifications/page")).default())).toContain(
      "Templates",
    );
    expect(
      await renderRSC(
        (await load("./(owner)/reports/page")).default({ searchParams: Promise.resolve({}) }),
      ),
    ).toContain("RevPAR");
    expect(await renderRSC((await load("./(owner)/assistant/page")).default())).toContain(
      "MCP for Claude.ai",
    );
    expect(
      await renderRSC((await load("./(owner)/settings/integrations/page")).default()),
    ).toContain("Integrations");
  });

  it("assistant shows the disconnected state when no token is issued", async () => {
    await prisma.mcpAccessToken.deleteMany();
    await prisma.mcpAuditEntry.deleteMany();
    const html = await renderRSC((await load("./(owner)/assistant/page")).default());
    expect(html).toContain("Not connected");
    expect(html).toContain("No AI actions yet");
  });

  it("settings marks an integration connected when its key is present", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const html = await renderRSC((await load("./(owner)/settings/integrations/page")).default());
    expect(html).toContain("Connected");
    vi.unstubAllEnvs();
  });
});

describe("owner layout", () => {
  it("renders the shell around the page when authenticated", async () => {
    const { default: Layout } = await load("./(owner)/layout");
    const html = await renderRSC(Layout({ children: "PAGE" }));
    expect(html).toContain("PAGE");
    expect(html).toContain("StayKit");
  });

  it("redirects to /signin when there is no context", async () => {
    ctxMock.mockResolvedValue(null);
    const { default: Layout } = await load("./(owner)/layout");
    await expect(renderRSC(Layout({ children: "X" }))).rejects.toThrow("REDIRECT:/signin");
  });

  it("redirects when the owner has no active property", async () => {
    await prisma.property.updateMany({ data: { active: false } });
    const { default: Layout } = await load("./(owner)/layout");
    await expect(renderRSC(Layout({ children: "X" }))).rejects.toThrow("REDIRECT:/signin");
  });
});

describe("settings section", () => {
  it("/settings redirects to the property section", async () => {
    const { default: Page } = await load("./(owner)/settings/page");
    expect(() => Page()).toThrow("REDIRECT:/settings/property");
  });

  it("settings layout renders its header and sub-nav around children", async () => {
    const { default: Layout } = await load("./(owner)/settings/layout");
    const html = await renderRSC(Layout({ children: "SECTION" }));
    expect(html).toContain("SECTION");
    expect(html).toContain("Team &amp; roles");
    expect(html).toContain("Legal &amp; DPDP");
  });

  it("property section shows a switcher when more than one property exists", async () => {
    await prisma.property.create({
      data: {
        ownerId: fx.owner.id,
        name: "Second Stay",
        addressLine1: "2 Hill Road",
        city: "Mysore",
        state: "KA",
        pincode: "570001",
      },
    });
    const { default: Page } = await load("./(owner)/settings/property/page");
    const html = await renderRSC(Page({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Second Stay");
    // A selected property id is honoured.
    const picked = await prisma.property.findFirst({ where: { name: "Second Stay" } });
    const html2 = await renderRSC(
      Page({ searchParams: Promise.resolve({ property: picked!.id }) }),
    );
    expect(html2).toContain("Second Stay");
  });

  it("integrations setup details list the env vars and respect live mode", async () => {
    vi.stubEnv("RAZORPAY_MODE", "live");
    const html = await renderRSC((await load("./(owner)/settings/integrations/page")).default());
    expect(html).toContain("RAZORPAY_KEY_ID_LIVE");
    expect(html).toContain("Needs setup");
    vi.unstubAllEnvs();
  });

  it("team section renders the team manager", async () => {
    const html = await renderRSC((await load("./(owner)/settings/team/page")).default());
    expect(html).toContain("Add a team member");
  });

  it("notifications section lists channels and the per-template toggles", async () => {
    const html = await renderRSC((await load("./(owner)/settings/notifications/page")).default());
    expect(html).toContain("Channels");
    expect(html).toContain("Automated messages");
    expect(html).toContain("Turn off"); // seeded templates are active
  });

  it("notifications section offers to seed defaults when empty", async () => {
    await prisma.notificationTemplate.deleteMany({ where: { ownerId: fx.owner.id } });
    const html = await renderRSC((await load("./(owner)/settings/notifications/page")).default());
    expect(html).toContain("Seed default templates");
  });

  it("legal section shows retention windows and ID-document stats", async () => {
    const html = await renderRSC((await load("./(owner)/settings/legal/page")).default());
    expect(html).toContain("Legal &amp; DPDP");
    expect(html).toContain("90 days"); // guest-ID purge window
    expect(html).toContain("Form C");
  });

  it("account section renders the editable profile for an owner", async () => {
    const html = await renderRSC((await load("./(owner)/settings/account/page")).default());
    expect(html).toContain("Save changes");
    expect(html).not.toContain("Only the workspace owner can edit");
  });

  it("account section locks the form for a non-owner", async () => {
    ctxMock.mockResolvedValue({
      ownerId: fx.owner.id,
      userId: fx.user.id,
      role: "STAFF",
      name: "Front Desk",
      propertyScopes: [],
      demo: false,
    });
    const html = await renderRSC((await load("./(owner)/settings/account/page")).default());
    expect(html).toContain("Only the workspace owner can edit");
  });
});

describe("guest portal pages", () => {
  it("/my shows the OTP card when not signed in and redirects when signed in", async () => {
    guestMock.mockResolvedValue(null);
    expect(await renderRSC((await load("./my/page")).default())).toContain("View your booking");
    guestMock.mockResolvedValue({ scope: "guest", phone: foreignPhone });
    await expect(renderRSC((await load("./my/page")).default())).rejects.toThrow(
      "REDIRECT:/my/bookings",
    );
  });

  it("/my/bookings lists the guest's bookings and redirects without a session", async () => {
    guestMock.mockResolvedValue({ scope: "guest", phone: "+919812300000" });
    const html = await renderRSC((await load("./my/bookings/page")).default());
    expect(html).toContain("Your bookings");
    guestMock.mockResolvedValue(null);
    await expect(renderRSC((await load("./my/bookings/page")).default())).rejects.toThrow(
      "REDIRECT:/my",
    );
  });

  it("/my/bookings shows an empty state for a number with no bookings", async () => {
    guestMock.mockResolvedValue({ scope: "guest", phone: "+910000000000" });
    expect(await renderRSC((await load("./my/bookings/page")).default())).toContain(
      "No bookings found",
    );
  });

  it("/my/bookings hides the Pay button for fully-paid bookings", async () => {
    guestMock.mockResolvedValue({ scope: "guest", phone: foreignPhone });
    const html = await renderRSC((await load("./my/bookings/page")).default());
    expect(html).toContain("Your bookings");
    expect(html).not.toContain("Pay ₹");
  });

  it("/my/bookings/[id] renders a fully-paid booking with no balance/link", async () => {
    const paid = await prisma.booking.findFirst({
      where: { guests: { some: { guest: { phone: foreignPhone } } } },
    });
    guestMock.mockResolvedValue({ scope: "guest", phone: foreignPhone });
    const { default: Page } = await load("./my/bookings/[id]/page");
    const html = await renderRSC(Page({ params: Promise.resolve({ id: paid!.id }) }));
    expect(html).not.toContain("still to pay");
  });

  it("/my/bookings/[id] renders detail, redirects without a session and 404s for others", async () => {
    const { default: Page } = await load("./my/bookings/[id]/page");
    guestMock.mockResolvedValue({ scope: "guest", phone: "+919812300000" });
    const html = await renderRSC(Page({ params: Promise.resolve({ id: arrivingId }) }));
    // Cash-first: an unpaid booking shows the manual-confirmation status, not an online link.
    expect(html).toContain("Awaiting payment confirmation");

    guestMock.mockResolvedValue(null);
    await expect(renderRSC(Page({ params: Promise.resolve({ id: arrivingId }) }))).rejects.toThrow(
      "REDIRECT:/my",
    );

    guestMock.mockResolvedValue({ scope: "guest", phone: "+919999999999" });
    await expect(renderRSC(Page({ params: Promise.resolve({ id: arrivingId }) }))).rejects.toThrow(
      "NOTFOUND",
    );
  });
});

describe("public pages & root layout", () => {
  it("landing page renders the hero and features", async () => {
    expect(await renderRSC((await load("./page")).default())).toContain("Run your homestay");
  });

  it("sign-in page renders the staff OTP card", async () => {
    expect(await renderRSC((await load("./signin/page")).default())).toContain(
      "Sign in to your workspace",
    );
  });

  it("root layout wraps children in the document shell", async () => {
    const { default: RootLayout } = await load("./layout");
    const html = await renderRSC(RootLayout({ children: "BODY" }));
    expect(html).toContain("BODY");
    expect(html).toContain("<html");
  });
});

describe("page edge-case branches", () => {
  it("dashboard renders every relative-time bucket in the activity feed", async () => {
    await prisma.auditLog.deleteMany();
    for (const [type, mins] of [
      ["USER", 0],
      ["MCP", 5],
      ["SYSTEM", 120],
      ["USER", 60 * 24 * 2],
    ] as const) {
      await prisma.auditLog.create({
        data: {
          ownerId: fx.owner.id,
          actorType: type,
          actorName: type,
          action: "X",
          summary: "s",
          createdAt: new Date(Date.now() - mins * 60_000),
        },
      });
    }
    const html = await renderRSC((await load("./(owner)/dashboard/page")).default());
    expect(html).toContain("just now");
    expect(html).toMatch(/5m ago/);
    expect(html).toMatch(/\dh ago/);
    expect(html).toMatch(/\dd ago/);
  });

  it("dashboard copes with zero rooms and a guest-less, room-less arrival", async () => {
    const ch = await prisma.channelSource.findFirst({ where: { ownerId: fx.owner.id } });
    await prisma.notificationLog.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.paymentLink.deleteMany();
    await prisma.bookingRoom.deleteMany();
    await prisma.maintenanceBlock.deleteMany();
    await prisma.room.deleteMany({ where: { propertyId: fx.property.id } }); // 0 rooms ⇒ occupancy guards
    await prisma.booking.create({
      data: {
        ref: "SK-NOG",
        propertyId: fx.property.id,
        channelId: ch!.id,
        checkIn: today(),
        checkOut: addDays(today(), 1),
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
      },
    });
    const html = await renderRSC((await load("./(owner)/dashboard/page")).default());
    expect(html).toContain("Guest"); // guest-less arrival label fallback
    expect(html).toContain("0%"); // occupancy with zero rooms
  });

  it("bookings list renders a single-night stay", async () => {
    const ch = await prisma.channelSource.findFirst({ where: { ownerId: fx.owner.id } });
    const g = await prisma.guest.create({
      data: { ownerId: fx.owner.id, name: "One Night", phone: "+919811111111" },
    });
    const room = await prisma.room.findFirst({ where: { propertyId: fx.property.id } });
    const b = await prisma.booking.create({
      data: {
        ref: "SK-1N",
        propertyId: fx.property.id,
        channelId: ch!.id,
        checkIn: addDays(today(), 40),
        checkOut: addDays(today(), 41),
        subtotal: 6000_00,
        taxAmount: 0,
        totalAmount: 6000_00,
        guests: { create: { guestId: g.id, isPrimary: true } },
        rooms: { create: { roomId: room!.id, date: addDays(today(), 40), rateApplied: 6000_00 } },
      },
    });
    const html = await renderRSC(
      (await load("./(owner)/bookings/page")).default({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("1 night");
    expect(b.id).toBeTruthy();
  });

  it("calendar skips room-less bookings and labels guest-less ones", async () => {
    const ch = await prisma.channelSource.findFirst({ where: { ownerId: fx.owner.id } });
    // room-less booking → skipped
    await prisma.booking.create({
      data: {
        ref: "SK-NOROOM",
        propertyId: fx.property.id,
        channelId: ch!.id,
        checkIn: today(),
        checkOut: addDays(today(), 1),
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
      },
    });
    // booking with a room but no guest → labelled "Guest"
    const r4 = await addRoom(fx.property.id, fx.roomType.id, "Room 4", "104");
    await prisma.booking.create({
      data: {
        ref: "SK-NOGUEST",
        propertyId: fx.property.id,
        channelId: ch!.id,
        checkIn: today(),
        checkOut: addDays(today(), 1),
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
        rooms: { create: { roomId: r4.id, date: today(), rateApplied: 0 } },
      },
    });
    const html = await renderRSC((await load("./(owner)/calendar/page")).default());
    expect(html).toContain("Guest");
    expect(html).not.toContain("SK-NOROOM");
  });

  it("guests page shows an empty state", async () => {
    const html = await renderRSC(
      (await load("./(owner)/guests/page")).default({
        searchParams: Promise.resolve({ q: "zzzznotaname" }),
      }),
    );
    expect(html).toContain("No guests match your search");
  });

  it("reports page shows an empty source mix", async () => {
    await prisma.notificationLog.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.paymentLink.deleteMany();
    await prisma.bookingRoom.deleteMany();
    await prisma.bookingGuest.deleteMany();
    await prisma.booking.deleteMany();
    const html = await renderRSC(
      (await load("./(owner)/reports/page")).default({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("No bookings in range");
  });

  it("settings property page renders the editable property form", async () => {
    const html = await renderRSC(
      (await load("./(owner)/settings/property/page")).default({
        searchParams: Promise.resolve({}),
      }),
    );
    expect(html).toContain("GSTIN");
    expect(html).toContain("Save changes");
  });

  it("assistant shows a dash for a token never used and 'just now' for fresh actions", async () => {
    await prisma.mcpAccessToken.updateMany({ data: { lastUsedAt: null } });
    await prisma.mcpAuditEntry.deleteMany();
    await prisma.mcpAuditEntry.create({
      data: {
        userId: fx.user.id,
        tool: "list_bookings",
        args: "{}",
        durationMs: 5,
        status: "OK",
        createdAt: new Date(),
      },
    });
    const html = await renderRSC((await load("./(owner)/assistant/page")).default());
    expect(html).toContain("just now");
    expect(html).toContain("—");
  });

  it("booking detail tolerates audit rows with no actor name or summary", async () => {
    // The page maps audit rows (actorName ?? actorType, summary ?? action) while
    // building props — exercising the fallbacks even though the Activity tab is not
    // the default rendered tab.
    await prisma.auditLog.create({
      data: {
        ownerId: fx.owner.id,
        actorType: "SYSTEM",
        action: "RAW_ACTION",
        entityType: "Booking",
        entityId: arrivingId,
      },
    });
    const html = await renderRSC(
      (await load("./(owner)/bookings/[id]/page")).default({
        params: Promise.resolve({ id: arrivingId }),
      }),
    );
    expect(html).toContain("Rate breakdown"); // page rendered successfully
  });

  it("booking detail handles a zero-value stay and payments with missing method/timestamp", async () => {
    const ch = await prisma.channelSource.findFirst({ where: { ownerId: fx.owner.id } });
    const g = await prisma.guest.create({
      data: { ownerId: fx.owner.id, name: "Comp Guest", phone: "+919833333333" },
    });
    const b = await prisma.booking.create({
      data: {
        ref: "SK-ZERO",
        propertyId: fx.property.id,
        channelId: ch!.id,
        checkIn: today(),
        checkOut: today(),
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
        amountPaid: 0,
        guests: { create: { guestId: g.id, isPrimary: true } },
      },
    });
    // A payment with no method and no capturedAt → exercises the ?? fallbacks.
    await prisma.payment.create({ data: { bookingId: b.id, amount: 0, status: "CAPTURED" } });
    const html = await renderRSC(
      (await load("./(owner)/bookings/[id]/page")).default({
        params: Promise.resolve({ id: b.id }),
      }),
    );
    expect(html).toContain("No GST"); // taxRate 0 → "No GST" label
  });

  it("guest portal handles room-less and child bookings", async () => {
    const ch = await prisma.channelSource.findFirst({ where: { ownerId: fx.owner.id } });
    const g = await prisma.guest.create({
      data: { ownerId: fx.owner.id, name: "Portal Guest", phone: "+919822222222" },
    });
    const b = await prisma.booking.create({
      // A balance due but no payment link → exercises due>0 with the `?? "#"` fallback.
      data: {
        ref: "SK-PORTAL",
        propertyId: fx.property.id,
        channelId: ch!.id,
        checkIn: today(),
        checkOut: addDays(today(), 1),
        adults: 2,
        children: 2,
        subtotal: 5000_00,
        taxAmount: 0,
        totalAmount: 5000_00,
        amountPaid: 0,
        guests: { create: { guestId: g.id, isPrimary: true } },
      },
    });
    guestMock.mockResolvedValue({ scope: "guest", phone: "+919822222222" });
    const list = await renderRSC((await load("./my/bookings/page")).default());
    expect(list).toContain("Test Homestay"); // room-less booking still lists the property
    const detail = await renderRSC(
      (await load("./my/bookings/[id]/page")).default({ params: Promise.resolve({ id: b.id }) }),
    );
    expect(detail).toContain("2 children");
  });
});
