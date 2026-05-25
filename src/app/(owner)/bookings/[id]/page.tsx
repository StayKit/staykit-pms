import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { shortDate, nightsBetween, ymd } from "@/lib/dates";
import { inr } from "@/lib/money";
import { deriveState } from "@/components/ui";
import { onlinePaymentsEnabled } from "@/lib/payments/razorpay/client";
import { BookingDetailView, type BookingDetailData } from "@/components/owner/BookingDetailView";

export const dynamic = "force-dynamic";

const CHANNEL_ICON: Record<"WHATSAPP" | "SMS" | "EMAIL", { icon: string; tone: string }> = {
  WHATSAPP: { icon: "message-circle", tone: "brand" },
  SMS: { icon: "phone", tone: "" },
  EMAIL: { icon: "mail", tone: "accent" },
};

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = (await getAppContext())!;
  const { id } = await params;

  const b = await prisma.booking.findFirst({
    where: { id, property: { ownerId: ctx.ownerId } },
    include: {
      property: true,
      channel: true,
      guests: {
        where: { isPrimary: true },
        include: { guest: { include: { _count: { select: { bookings: true } } } } },
      },
      rooms: { include: { room: true } },
      payments: { orderBy: { createdAt: "asc" } },
      paymentLinks: { orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { createdAt: "asc" } },
      notifications: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!b) notFound();

  const audit = await prisma.auditLog.findMany({
    where: { entityType: "Booking", entityId: b.id },
    orderBy: { createdAt: "asc" },
  });

  const canMove = b.status !== "CANCELLED" && b.status !== "CHECKED_OUT";
  const [propertyRooms, templates] = await Promise.all([
    canMove
      ? prisma.room.findMany({
          where: { propertyId: b.propertyId, active: true },
          include: { roomType: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.notificationTemplate.findMany({
      where: { ownerId: ctx.ownerId, active: true },
      orderBy: [{ triggerKey: "asc" }, { channel: "asc" }],
      select: { id: true, name: true, channel: true },
    }),
  ]);

  const guest = b.guests[0]?.guest;
  const room = b.rooms[0]?.room;
  const nights = nightsBetween(b.checkIn, b.checkOut);
  const due = b.totalAmount - b.amountPaid;
  const nightly = nights ? Math.round(b.subtotal / nights) : b.subtotal;
  const taxRate = b.subtotal > 0 ? Math.round((b.taxAmount / b.subtotal) * 100) : 0;

  const payments = buildPaymentsTimeline(b, due);

  const data: BookingDetailData = {
    id: b.id,
    ref: b.ref,
    state: deriveState(b),
    room: { number: room?.number ?? "", name: room?.name ?? "" },
    guest: guest
      ? {
          id: guest.id,
          name: guest.name,
          city: guest.city,
          phone: guest.phone,
          email: guest.email,
          isForeign: guest.isForeign,
          idType: guest.idType,
          idLast4: guest.idLast4,
          stays: guest._count.bookings,
        }
      : null,
    checkIn: shortDate(b.checkIn),
    checkOut: shortDate(b.checkOut),
    checkInTime: b.property.checkInTime,
    checkOutTime: b.property.checkOutTime,
    nights,
    adults: b.adults,
    children: b.children,
    channel: { key: b.channel.key, name: b.channel.name },
    money: {
      subtotal: inr(b.subtotal),
      tax: inr(b.taxAmount),
      total: inr(b.totalAmount),
      paid: inr(b.amountPaid),
      paidRaw: b.amountPaid,
      due: inr(due),
      dueRaw: due,
      taxLabel: taxRate ? `${taxRate}% GST` : "No GST (owner unregistered)",
      nightly: inr(nightly),
    },
    payments,
    comms: b.notifications.map((n) => {
      const ci = CHANNEL_ICON[n.channel];
      return {
        id: n.id,
        icon: ci.icon,
        tone: ci.tone,
        title: `${n.triggerKey.replaceAll("_", " ").toLowerCase()} (${n.channel.toLowerCase()})`,
        sub: `${fmtTime(n.sentAt ?? n.createdAt)} · ${n.status.toLowerCase()}`,
      };
    }),
    audit: audit.map((a) => ({
      bot: a.actorType === "MCP",
      actor: a.actorName ?? a.actorType,
      what: a.summary ?? a.action,
      when: fmtTime(a.createdAt),
    })),
    notes: b.notes,
    arrivalTime: b.arrivalTime,
    guestRequests: b.guestRequests,
    cancelRequest: b.cancelRequestedAt
      ? { when: fmtTime(b.cancelRequestedAt), reason: b.cancelRequestReason }
      : null,
    onlineEnabled: await onlinePaymentsEnabled(),
    templates,
    guestHasEmail: !!guest?.email,
    move:
      canMove && room
        ? {
            roomId: room.id,
            checkInYmd: ymd(b.checkIn),
            checkOutYmd: ymd(b.checkOut),
            rooms: propertyRooms.map((r) => ({
              id: r.id,
              label: `${r.number ? r.number + " — " : ""}${r.name} (${r.roomType.name})`,
            })),
          }
        : null,
  };

  return <BookingDetailView data={data} />;
}

const REFUND_ICON: Record<string, string> = {
  PROCESSED: "rotate-ccw",
  FAILED: "x",
  CREATED: "clock",
};

function buildPaymentsTimeline(
  b: {
    paymentLinks: { amount: number; notifyVia: string; createdAt: Date }[];
    payments: { amount: number; method: string | null; capturedAt: Date | null; createdAt: Date }[];
    refunds: {
      amount: number;
      status: string;
      reason: string | null;
      processedAt: Date | null;
      createdAt: Date;
    }[];
  },
  due: number,
): BookingDetailData["payments"] {
  const rows: BookingDetailData["payments"] = [];
  for (const link of b.paymentLinks) {
    rows.push({
      icon: "send",
      tone: "",
      title: `Payment link created (${inr(link.amount)})`,
      sub: `${link.notifyVia.toUpperCase()} · ${fmtTime(link.createdAt)}`,
    });
  }
  for (const p of b.payments) {
    rows.push({
      icon: "check",
      tone: "ok",
      title: `Razorpay received ${inr(p.amount)}`,
      sub: `${(p.method ?? "payment").toUpperCase()} · ${fmtTime(p.capturedAt ?? p.createdAt)}`,
    });
  }
  for (const r of b.refunds) {
    rows.push({
      icon: REFUND_ICON[r.status] ?? "clock",
      tone: r.status === "PROCESSED" ? "" : "empty",
      title: `Refund ${inr(r.amount)} — ${r.status.toLowerCase()}`,
      sub: `${r.reason ?? "refund"} · ${fmtTime(r.processedAt ?? r.createdAt)}`,
    });
  }
  if (due > 0) {
    rows.push({
      icon: "clock",
      tone: "empty",
      title: `${inr(due)} still to collect`,
      sub: "Awaiting payment",
    });
  }
  return rows;
}

function fmtTime(d: Date): string {
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
