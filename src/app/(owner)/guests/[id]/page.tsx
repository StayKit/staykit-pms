import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAppContext } from "@/lib/auth/context";
import { Icon } from "@/components/Icon";
import { Avatar, StatusPill, deriveState } from "@/components/ui";
import { shortDate } from "@/lib/dates";
import { inr } from "@/lib/money";
import { GuestActions } from "@/components/owner/GuestActions";
import { GuestEditForm } from "@/components/owner/GuestEditForm";

export const dynamic = "force-dynamic";

export default async function GuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = (await getAppContext())!;
  const { id } = await params;

  const guest = await prisma.guest.findFirst({
    where: { id, ownerId: ctx.ownerId },
    include: {
      bookings: {
        include: { booking: { include: { property: true, rooms: { include: { room: true } } } } },
        orderBy: { booking: { checkIn: "desc" } },
      },
    },
  });
  if (!guest) notFound();

  const stays = guest.bookings.map((bg) => bg.booking);
  const totalSpend = stays
    .filter((b) => b.status !== "CANCELLED")
    .reduce((s, b) => s + b.amountPaid, 0);

  return (
    <div className="page" style={{ paddingTop: 16, maxWidth: 820 }}>
      <Link href="/guests" className="btn btn-sm" style={{ marginBottom: 12 }}>
        <Icon name="chevron-left" className="icon-sm" /> Guests
      </Link>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Avatar name={guest.name} id={guest.id} className="lg" />
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 20, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              {guest.name}
              {guest.isForeign && (
                <Icon name="globe" className="icon-sm" style={{ color: "var(--muted)" }} />
              )}
            </h2>
            <div className="sub">
              {guest.city ?? "—"} · {stays.length} stay{stays.length === 1 ? "" : "s"} ·{" "}
              {inr(totalSpend)} paid
            </div>
          </div>
        </div>

        <div className="kv-grid" style={{ marginTop: 18 }}>
          <KV k="Mobile" v={guest.phone} />
          <KV k="Email" v={guest.email ?? "—"} />
          <KV k="Nationality" v={guest.isForeign ? (guest.nationality ?? "Foreign") : "Indian"} />
          <KV
            k="ID document"
            v={guest.idType ? `${guest.idType} — •••• ${guest.idLast4 ?? "----"}` : "Not on file"}
          />
          <KV
            k="Marketing consent"
            v={
              guest.marketingConsent
                ? `Opted in ${guest.dpdpConsentAt ? shortDate(guest.dpdpConsentAt) : ""}`
                : "Not opted in"
            }
          />
        </div>
        {guest.notes && (
          <div style={{ marginTop: 14 }}>
            <div className="k" style={{ fontSize: 12, color: "var(--muted)" }}>
              Notes
            </div>
            <div className="text-sm">{guest.notes}</div>
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <GuestEditForm
            guestId={guest.id}
            initial={{
              name: guest.name,
              email: guest.email ?? "",
              city: guest.city ?? "",
              notes: guest.notes ?? "",
            }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginTop: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <h4 style={{ marginTop: 0 }}>Stay history</h4>
          {stays.length === 0 && <div className="text-muted text-sm">No stays yet.</div>}
          {stays.map((b) => (
            <Link
              key={b.id}
              href={`/bookings/${b.id}`}
              className="timeline-row"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="timeline-dot" style={{ background: "var(--brand)" }}>
                <Icon name="calendar" className="icon-sm" />
              </div>
              <div className="text" style={{ flex: 1 }}>
                {b.property.name} · {b.rooms[0]?.room.name ?? "—"}
                <div className="sub">
                  {shortDate(b.checkIn)} → {shortDate(b.checkOut)} · {inr(b.totalAmount)}
                </div>
              </div>
              <StatusPill state={deriveState(b)} />
            </Link>
          ))}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <h4 style={{ marginTop: 0 }}>Privacy & consent (DPDP)</h4>
          <p className="text-sm text-muted" style={{ marginTop: 0 }}>
            Manage this guest&apos;s marketing consent and exercise their right to erasure. Tax
            records are retained even after erasure, as the law requires.
          </p>
          <GuestActions
            guestId={guest.id}
            marketingConsent={guest.marketingConsent}
            hasIdDoc={!!guest.idFileId}
          />
        </div>
      </div>
    </div>
  );
}

function KV({ k, v }: Readonly<{ k: string; v: React.ReactNode }>) {
  return (
    <div className="kv">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
