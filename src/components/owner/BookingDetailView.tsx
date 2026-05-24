"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Avatar, ChannelChip, StatusPill, type DisplayState } from "@/components/ui";
import {
  checkInAction,
  checkOutAction,
  sendPaymentLinkAction,
  markPaidAction,
  cancelAction,
  moveBookingAction,
  recordPaymentAction,
} from "@/lib/actions/bookings";
import { refundAction, quoteRefundAction, type RefundQuoteResult } from "@/lib/actions/payments";
import { CANCELLATION_REASONS, type CancellationReason } from "@/lib/booking/cancellation";

export interface BookingDetailData {
  id: string;
  ref: string;
  state: DisplayState;
  room: { number: string; name: string };
  guest: {
    id: string;
    name: string;
    city: string | null;
    phone: string;
    email: string | null;
    isForeign: boolean;
    idType: string | null;
    idLast4: string | null;
    stays: number;
  } | null;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  nights: number;
  adults: number;
  children: number;
  channel: { key: string; name: string };
  money: {
    subtotal: string;
    tax: string;
    total: string;
    paid: string;
    paidRaw: number;
    due: string;
    dueRaw: number;
    taxLabel: string;
    nightly: string;
  };
  payments: { icon: string; tone: string; title: string; sub: string }[];
  comms: { icon: string; tone: string; title: string; sub: string }[];
  audit: { bot: boolean; actor: string; what: string; when: string }[];
  notes: string | null;
  /** Present when the booking can still be moved (room/dates). */
  move: {
    roomId: string;
    checkInYmd: string;
    checkOutYmd: string;
    rooms: { id: string; label: string }[];
  } | null;
  /** Whether Razorpay online payment links are enabled (else cash/manual only). */
  onlineEnabled: boolean;
}

type Tab = "stay" | "guest" | "payments" | "comms" | "audit";

export function BookingDetailView({ data }: { data: BookingDetailData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("stay");
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    start(async () => {
      const res = await fn();
      if (res.message) setToast(res.message);
      router.refresh();
    });
  }

  const g = data.guest;

  return (
    <div className="page" style={{ paddingTop: 16, maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button className="icon-btn" onClick={() => router.push("/bookings")} aria-label="Back">
          <Icon name="chevron-left" className="icon-sm" />
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>Booking {data.ref}</h2>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="bd-hero">
          <div className="ref">
            {data.room.number} · {data.room.name}
          </div>
          <h2>{g?.name ?? "Owner block"}</h2>
          <div className="where">
            {data.checkIn} → {data.checkOut} · {data.nights} night{data.nights > 1 ? "s" : ""} ·{" "}
            {data.adults + data.children} guests
          </div>
          <div className="pills">
            <StatusPill state={data.state} />
            <ChannelChip channelKey={data.channel.key} name={data.channel.name} />
            {g?.isForeign && (
              <span className="pill pill-outline">
                <Icon name="globe" className="icon-sm" /> Foreign national — Form C pending
              </span>
            )}
          </div>
        </div>

        <div className="tabs">
          {(["stay", "guest", "payments", "comms", "audit"] as Tab[]).map((tb) => (
            <button
              key={tb}
              className={"tab " + (tab === tb ? "active" : "")}
              onClick={() => setTab(tb)}
            >
              {
                {
                  stay: "Stay",
                  guest: "Guest",
                  payments: "Payments",
                  comms: "Messages",
                  audit: "Activity",
                }[tb]
              }
            </button>
          ))}
        </div>

        {tab === "stay" && (
          <>
            <div className="bd-section">
              <h4>Stay</h4>
              <div className="kv-grid">
                <KV k="Check-in" v={`${data.checkIn} · ${data.checkInTime}`} />
                <KV k="Check-out" v={`${data.checkOut} · ${data.checkOutTime}`} />
                <KV k="Room" v={`${data.room.number} — ${data.room.name}`} />
                <KV
                  k="Guests"
                  v={`${data.adults} adult${data.adults > 1 ? "s" : ""}${data.children ? `, ${data.children} child${data.children > 1 ? "ren" : ""}` : ""}`}
                />
                <KV
                  k="Source"
                  v={<ChannelChip channelKey={data.channel.key} name={data.channel.name} />}
                />
                <KV
                  k="Booking ref"
                  v={<span style={{ fontVariantNumeric: "tabular-nums" }}>{data.ref}</span>}
                />
              </div>
            </div>

            <div className="bd-section">
              <h4>Rate breakdown</h4>
              <div className="line-items">
                <div className="li-row">
                  <div>
                    <div>Room charge — {data.room.name}</div>
                    <div className="sub">
                      {data.money.nightly} × {data.nights} nights
                    </div>
                  </div>
                  <div />
                  <div className="money">{data.money.subtotal}</div>
                </div>
                <div className="li-row">
                  <div>
                    <div>GST</div>
                    <div className="sub">{data.money.taxLabel}</div>
                  </div>
                  <div />
                  <div className="money">{data.money.tax}</div>
                </div>
                <div className="li-row total">
                  <div>Total</div>
                  <div />
                  <div className="money">{data.money.total}</div>
                </div>
              </div>
            </div>

            {data.notes && (
              <div className="bd-section">
                <h4>Notes</h4>
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{data.notes}</div>
              </div>
            )}

            {data.move && (
              <div className="bd-section">
                <MovePanel
                  move={data.move}
                  onDone={(m) => {
                    setToast(m);
                    router.refresh();
                  }}
                  bookingId={data.id}
                />
              </div>
            )}
          </>
        )}

        {tab === "guest" && g && (
          <div className="bd-section">
            <h4>Primary guest</h4>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <Avatar name={g.name} id={g.id} className="lg" />
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{g.name}</div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>{g.city}</div>
              </div>
            </div>
            <div className="kv-grid" style={{ marginTop: 18 }}>
              <KV k="Mobile" v={g.phone} />
              <KV k="Email" v={g.email ?? "—"} />
              <KV k="Past stays" v={String(g.stays)} />
              <KV
                k="ID document"
                v={g.idType ? `${g.idType} — •••• ${g.idLast4 ?? "----"}` : "Not on file"}
              />
            </div>
          </div>
        )}

        {tab === "payments" && (
          <div className="bd-section">
            <h4>Payment status</h4>
            <div className="kv-grid">
              <KV k="Total" v={<span className="money">{data.money.total}</span>} />
              <KV
                k="Paid"
                v={
                  <span className="money" style={{ color: "var(--st-checkedin)" }}>
                    {data.money.paid}
                  </span>
                }
              />
              <KV
                k="Due"
                v={
                  <span
                    className="money"
                    style={{ color: data.money.dueRaw > 0 ? "var(--st-unpaid)" : "var(--ink-2)" }}
                  >
                    {data.money.due}
                  </span>
                }
              />
            </div>
            <h4 style={{ marginTop: 24 }}>Timeline</h4>
            <div>
              {data.payments.length === 0 && (
                <div className="text-muted text-sm">No payments yet.</div>
              )}
              {data.payments.map((p, i) => (
                <div className="timeline-row" key={i}>
                  <div
                    className={"timeline-dot " + (p.tone === "empty" ? "empty" : "")}
                    style={p.tone === "ok" ? { background: "var(--st-checkedin)" } : undefined}
                  >
                    <Icon name={p.icon} className="icon-sm" />
                  </div>
                  <div className="text">
                    {p.title}
                    <div className="sub">{p.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            {data.money.dueRaw > 0 && (
              <RecordPaymentPanel
                bookingId={data.id}
                dueRaw={data.money.dueRaw}
                onlineEnabled={data.onlineEnabled}
                onDone={(m) => {
                  setToast(m);
                  router.refresh();
                }}
              />
            )}
            {data.money.paidRaw > 0 && (
              <a
                className="btn"
                href={`/bookings/${data.id}/invoice`}
                target="_blank"
                rel="noreferrer"
                style={{ marginTop: 16 }}
              >
                <Icon name="external" className="icon-sm" /> Download invoice
              </a>
            )}
            {data.money.paidRaw > 0 && data.state !== "cancelled" && (
              <RefundPanel
                bookingId={data.id}
                onDone={(msg) => {
                  setToast(msg);
                  router.refresh();
                }}
              />
            )}
          </div>
        )}

        {tab === "comms" && (
          <div className="bd-section">
            <h4>Messages sent</h4>
            {data.comms.length === 0 && <div className="text-muted text-sm">No messages yet.</div>}
            {data.comms.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--line)",
                }}
              >
                <div className={"activity-dot " + m.tone}>
                  <Icon name={m.icon} className="icon-sm" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 550, fontSize: 13.5 }}>{m.title}</div>
                  <div className="text-xs text-muted">{m.sub}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "audit" && (
          <div className="bd-section">
            <h4>Activity log</h4>
            {data.audit.map((a, i) => (
              <div key={i} className="timeline-row">
                <div
                  className="timeline-dot"
                  style={{ background: a.bot ? "#7565B0" : "var(--brand)" }}
                >
                  <Icon name={a.bot ? "sparkles" : "user"} className="icon-sm" />
                </div>
                <div className="text">
                  <strong>{a.actor}</strong> {a.what}
                  <div className="sub">{a.when}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="sheet-footer">
          {data.state === "checkedin" ? (
            <button
              className="btn btn-primary btn-lg"
              style={{ flex: 1 }}
              disabled={pending}
              onClick={() => run(() => checkOutAction(data.id))}
            >
              <Icon name="log-out" className="icon-sm" /> Check out
            </button>
          ) : data.state === "tentative" ? (
            <button
              className="btn btn-primary btn-lg"
              style={{ flex: 1 }}
              disabled={pending}
              onClick={() => run(() => markPaidAction(data.id))}
            >
              <Icon name="check" className="icon-sm" /> Confirm & mark paid
            </button>
          ) : data.state === "unpaid" || data.state === "partial" ? (
            <>
              {data.onlineEnabled ? (
                <button
                  className="btn btn-accent btn-lg"
                  style={{ flex: 1 }}
                  disabled={pending}
                  onClick={() => run(() => sendPaymentLinkAction(data.id))}
                >
                  <Icon name="send" className="icon-sm" /> Send payment link
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-lg"
                  style={{ flex: 1 }}
                  disabled={pending}
                  onClick={() => run(() => markPaidAction(data.id))}
                >
                  <Icon name="check" className="icon-sm" /> Mark as paid (cash)
                </button>
              )}
              <button
                className="btn btn-lg"
                disabled={pending}
                onClick={() => run(() => checkInAction(data.id))}
              >
                <Icon name="key" className="icon-sm" /> Check in
              </button>
            </>
          ) : data.state === "paid" ? (
            <button
              className="btn btn-primary btn-lg"
              style={{ flex: 1 }}
              disabled={pending}
              onClick={() => run(() => checkInAction(data.id))}
            >
              <Icon name="key" className="icon-sm" /> Check in
            </button>
          ) : null}
          {data.state !== "cancelled" && data.state !== "checkedout" && (
            <button
              className="btn btn-lg btn-ghost"
              style={{ color: "var(--st-unpaid)" }}
              disabled={pending}
              onClick={() => {
                if (confirm("Cancel this booking? The room nights will be released.")) {
                  run(() => cancelAction(data.id, "Owner cancellation"));
                }
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ marginTop: 14 }} className="dev-code">
          {toast}
        </div>
      )}
    </div>
  );
}

const PAY_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank transfer" },
  { id: "card", label: "Card" },
  { id: "other", label: "Other" },
];

function RecordPaymentPanel({
  bookingId,
  dueRaw,
  onlineEnabled,
  onDone,
}: Readonly<{
  bookingId: string;
  dueRaw: number;
  onlineEnabled: boolean;
  onDone: (msg: string) => void;
}>) {
  const dueRupees = Math.round(dueRaw / 100);
  const [amount, setAmount] = useState(String(dueRupees));
  const [method, setMethod] = useState("cash");
  const [pending, start] = useTransition();

  return (
    <div className="bd-section" style={{ marginTop: 16 }}>
      <h4>Record a payment</h4>
      <div className="text-sm text-muted" style={{ marginBottom: 8 }}>
        {onlineEnabled
          ? "Confirm a payment you received directly (cash/UPI/bank), or send an online link above."
          : "Cash-first: confirm a payment you received. The guest's status flips to paid once you do."}
      </div>
      <div className="field-row">
        <div className="field">
          <label>Amount (₹)</label>
          <input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        className="btn btn-primary"
        disabled={pending || !amount || Number(amount) <= 0}
        onClick={() =>
          start(async () => {
            const res = await recordPaymentAction(bookingId, {
              amountRupees: Number(amount),
              method,
            });
            onDone(res.message ?? (res.ok ? "Payment recorded." : "Could not record payment."));
          })
        }
      >
        <Icon name="check" className="icon-sm" /> Confirm payment
      </button>
    </div>
  );
}

function MovePanel({
  bookingId,
  move,
  onDone,
}: Readonly<{
  bookingId: string;
  move: NonNullable<BookingDetailData["move"]>;
  onDone: (msg: string) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [roomId, setRoomId] = useState(move.roomId);
  const [checkIn, setCheckIn] = useState(move.checkInYmd);
  const [checkOut, setCheckOut] = useState(move.checkOutYmd);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        <Icon name="edit" className="icon-sm" /> Move room or change dates
      </button>
    );
  }
  return (
    <div>
      <h4>Move booking</h4>
      <div className="field">
        <label>Room</label>
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          {move.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Check-in</label>
          <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </div>
        <div className="field">
          <label>Check-out</label>
          <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await moveBookingAction(bookingId, { roomId, checkIn, checkOut });
              setOpen(false);
              onDone(res.message ?? (res.ok ? "Moved." : "Could not move."));
            })
          }
        >
          Save move
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <div className="text-xs text-muted" style={{ marginTop: 8 }}>
        Rates and GST are recalculated for the new room and dates.
      </div>
    </div>
  );
}

function RefundPanel({
  bookingId,
  onDone,
}: Readonly<{ bookingId: string; onDone: (msg: string) => void }>) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancellationReason>("Guest cancellation");
  const [quote, setQuote] = useState<RefundQuoteResult | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let active = true;
    setQuote(null);
    quoteRefundAction(bookingId, reason).then((q) => {
      if (active) setQuote(q);
    });
    return () => {
      active = false;
    };
  }, [open, reason, bookingId]);

  if (!open) {
    return (
      <button className="btn" style={{ marginTop: 18 }} onClick={() => setOpen(true)}>
        <Icon name="rotate-ccw" className="icon-sm" /> Refund this booking
      </button>
    );
  }

  const nothing = quote?.ok && (quote.refundablePaise ?? 0) <= 0;
  return (
    <div className="bd-section" style={{ marginTop: 12 }}>
      <h4>Refund</h4>
      <div className="field">
        <label>Reason</label>
        <select value={reason} onChange={(e) => setReason(e.target.value as CancellationReason)}>
          {CANCELLATION_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="text-sm" style={{ color: "var(--ink-2)", margin: "8px 0" }}>
        {quote?.ok ? `${quote.explanation} Refundable: ${quote.refundable}.` : "Calculating…"}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary"
          disabled={pending || !quote?.ok || nothing}
          onClick={() =>
            start(async () => {
              const res = await refundAction(bookingId, { reason });
              setOpen(false);
              onDone(res.message ?? (res.ok ? "Refund processed." : "Refund failed."));
            })
          }
        >
          Process refund
        </button>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <div className="text-xs text-muted" style={{ marginTop: 8 }}>
        Normal refunds take 5–7 working days. Refunds aren&apos;t possible on payments older than 6
        months.
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
