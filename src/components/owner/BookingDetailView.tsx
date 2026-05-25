"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Toast } from "@/components/Toast";
import { Avatar, ChannelChip, StatusPill, type DisplayState } from "@/components/ui";
import {
  checkInAction,
  checkOutAction,
  sendPaymentLinkAction,
  markPaidAction,
  cancelAction,
  confirmBookingAction,
  noShowAction,
  moveBookingAction,
  quoteBookingAction,
  recordPaymentAction,
  returnDepositAction,
  updateBookingNotesAction,
} from "@/lib/actions/bookings";
import {
  sendBookingNotificationAction,
  resendNotificationAction,
} from "@/lib/actions/notifications";
import {
  refundAction,
  quoteRefundAction,
  retryRefundAction,
  settleRefundManuallyAction,
  type RefundQuoteResult,
} from "@/lib/actions/payments";
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
    depositHeld: string;
    depositRaw: number;
  };
  payments: { icon: string; tone: string; title: string; sub: string }[];
  comms: { id: string; icon: string; tone: string; title: string; sub: string }[];
  audit: { bot: boolean; actor: string; what: string; when: string }[];
  notes: string | null;
  /** Guest-provided expected arrival time + special requests (from the portal). */
  arrivalTime: string | null;
  guestRequests: string | null;
  /** Present when the guest has asked to cancel (staff still actions it). */
  cancelRequest: { when: string; reason: string | null } | null;
  /** Refunds Razorpay rejected — surfaced as a banner with retry / settle-manually (audit P0 #5). */
  failedRefunds: { id: string; amount: string; reason: string | null }[];
  /** Present when the booking can still be moved (room/dates). */
  move: {
    propertyId: string;
    roomId: string;
    checkInYmd: string;
    checkOutYmd: string;
    rooms: { id: string; label: string }[];
  } | null;
  /** Whether Razorpay online payment links are enabled (else cash/manual only). */
  onlineEnabled: boolean;
  /** Active templates the owner can manually send to this guest. */
  templates: { id: string; name: string; channel: string }[];
  /** Whether the primary guest has an email (gates email templates in the UI). */
  guestHasEmail: boolean;
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
            {data.room.number ? `${data.room.number} · ` : ""}
            {data.room.name}
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
              <>
                <span className="pill pill-outline">
                  <Icon name="globe" className="icon-sm" /> Foreign national — Form C pending
                </span>
                <a
                  className="pill pill-outline"
                  href={`/bookings/${data.id}/form-c`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "none" }}
                >
                  <Icon name="external" className="icon-sm" /> Generate Form C
                </a>
              </>
            )}
          </div>
        </div>

        {data.cancelRequest && data.state !== "cancelled" && (
          <div
            style={{
              margin: "0 0 0",
              padding: "12px 18px",
              background: "var(--st-unpaid-bg)",
              color: "var(--st-unpaid)",
              fontSize: 13,
              display: "flex",
              gap: 10,
              alignItems: "center",
              borderTop: "1px solid var(--line)",
            }}
          >
            <Icon name="info" className="icon-sm" />
            <div>
              <strong>Guest requested cancellation</strong> · {data.cancelRequest.when}
              {data.cancelRequest.reason ? ` — "${data.cancelRequest.reason}"` : ""}
              <div className="text-xs" style={{ color: "var(--ink-2)" }}>
                Review the refund policy below, then Cancel to confirm.
              </div>
            </div>
          </div>
        )}

        {data.failedRefunds.length > 0 && (
          <div
            style={{
              padding: "12px 18px",
              background: "var(--st-unpaid-bg)",
              color: "var(--st-unpaid)",
              fontSize: 13,
              borderTop: "1px solid var(--line)",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Icon name="alert" className="icon-sm" />
              <strong>
                {data.failedRefunds.length === 1 ? "A refund failed" : "Refunds failed"} at Razorpay
              </strong>
            </div>
            {data.failedRefunds.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 8,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 160, color: "var(--ink-2)" }}>
                  {r.amount}
                  {r.reason ? ` · ${r.reason}` : ""} — the guest&apos;s money is stuck.
                </div>
                <button
                  className="btn btn-sm"
                  disabled={pending}
                  onClick={() => run(() => retryRefundAction(r.id))}
                >
                  <Icon name="rotate-ccw" className="icon-sm" /> Retry
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  disabled={pending}
                  title="I refunded the guest by cash/UPI outside Razorpay"
                  onClick={() => {
                    if (confirm("Mark this refund settled outside Razorpay (e.g. paid by cash)?")) {
                      run(() => settleRefundManuallyAction(r.id));
                    }
                  }}
                >
                  Settle manually
                </button>
              </div>
            ))}
          </div>
        )}

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
                <KV
                  k={data.room.name.includes("rooms ·") ? "Rooms" : "Room"}
                  v={data.room.number ? `${data.room.number} — ${data.room.name}` : data.room.name}
                />
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

            {(data.arrivalTime || data.guestRequests) && (
              <div className="bd-section">
                <h4>From the guest</h4>
                <div className="kv-grid">
                  {data.arrivalTime && <KV k="Expected arrival" v={data.arrivalTime} />}
                </div>
                {data.guestRequests && (
                  <div style={{ marginTop: data.arrivalTime ? 12 : 0 }}>
                    <div className="text-xs text-muted" style={{ fontWeight: 550 }}>
                      Special requests
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 2 }}>
                      {data.guestRequests}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bd-section">
              <NotesPanel
                bookingId={data.id}
                notes={data.notes}
                onDone={(m) => {
                  setToast(m);
                  router.refresh();
                }}
              />
            </div>

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
            {data.money.depositRaw > 0 && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 10,
                  background: "var(--surface-2)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <Icon name="lock" className="icon-sm" />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    Security deposit held · {data.money.depositHeld}
                  </div>
                  <div className="text-xs text-muted">
                    Refundable — not counted as room revenue.
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Return the ${data.money.depositHeld} deposit to the guest?`)) {
                      run(() => returnDepositAction(data.id));
                    }
                  }}
                >
                  Return
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Forfeit the ${data.money.depositHeld} deposit (e.g. damages)?`)) {
                      run(() => returnDepositAction(data.id, { forfeit: true }));
                    }
                  }}
                >
                  Forfeit
                </button>
              </div>
            )}
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
            <a
              className="btn"
              href={`/bookings/${data.id}/invoice`}
              target="_blank"
              rel="noreferrer"
              style={{ marginTop: 16 }}
            >
              <Icon name="external" className="icon-sm" />{" "}
              {data.money.paidRaw > 0 ? "Download invoice" : "Download quote / proforma"}
            </a>
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
            <SendMessagePanel
              bookingId={data.id}
              templates={data.templates}
              guestHasEmail={data.guestHasEmail}
              onDone={(m) => {
                setToast(m);
                router.refresh();
              }}
            />
            <h4 style={{ marginTop: 24 }}>Messages sent</h4>
            {data.comms.length === 0 && <div className="text-muted text-sm">No messages yet.</div>}
            {data.comms.map((m, i) => (
              <div
                key={m.id}
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
                <button
                  className="btn btn-sm btn-ghost"
                  disabled={pending}
                  title="Send this message again"
                  onClick={() => run(() => resendNotificationAction(m.id))}
                >
                  <Icon name="rotate-ccw" className="icon-sm" /> Resend
                </button>
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
            <>
              <button
                className="btn btn-primary btn-lg"
                style={{ flex: 1 }}
                disabled={pending}
                onClick={() => run(() => confirmBookingAction(data.id))}
              >
                <Icon name="check" className="icon-sm" /> Confirm (collect later)
              </button>
              <button
                className="btn btn-lg"
                disabled={pending}
                onClick={() => run(() => markPaidAction(data.id))}
              >
                <Icon name="indian-rupee" className="icon-sm" /> Confirm &amp; mark paid
              </button>
            </>
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
          {(data.state === "tentative" ||
            data.state === "unpaid" ||
            data.state === "partial" ||
            data.state === "paid") && (
            <button
              className="btn btn-lg btn-ghost"
              disabled={pending}
              title="Guest never arrived"
              onClick={() => {
                if (confirm("Mark this booking as a no-show? The room nights will be released.")) {
                  run(() => noShowAction(data.id));
                }
              }}
            >
              No-show
            </button>
          )}
          {data.state !== "cancelled" && data.state !== "checkedout" && data.state !== "noshow" && (
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

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
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
  const [reference, setReference] = useState("");
  const [isDeposit, setIsDeposit] = useState(false);
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
      <div className="field">
        <label>
          Reference / txn ID <span className="hint">(optional)</span>
        </label>
        <input
          value={reference}
          placeholder="UPI ref, bank UTR, cheque no…"
          onChange={(e) => setReference(e.target.value)}
        />
      </div>
      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontSize: 13,
          margin: "2px 0 10px",
        }}
      >
        <input
          type="checkbox"
          checked={isDeposit}
          onChange={(e) => setIsDeposit(e.target.checked)}
        />
        This is a refundable security deposit (tracked separately, not room revenue)
      </label>
      <button
        className="btn btn-primary"
        disabled={pending || !amount || Number(amount) <= 0}
        onClick={() =>
          start(async () => {
            const res = await recordPaymentAction(bookingId, {
              amountRupees: Number(amount),
              method,
              reference: reference.trim() || undefined,
              isDeposit,
            });
            onDone(res.message ?? (res.ok ? "Payment recorded." : "Could not record payment."));
          })
        }
      >
        <Icon name="check" className="icon-sm" /> {isDeposit ? "Record deposit" : "Confirm payment"}
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
  const [preview, setPreview] = useState<{ totalRupees: number; nights: number } | null>(null);
  const [pending, start] = useTransition();

  // Live price preview for the new room/dates so the total never jumps unexpectedly (audit P2 #20).
  useEffect(() => {
    if (!open) return;
    let active = true;
    setPreview(null);
    quoteBookingAction({ propertyId: move.propertyId, roomId, checkIn, checkOut }).then((q) => {
      if (active && q.ok) setPreview({ totalRupees: q.totalRupees, nights: q.nights });
    });
    return () => {
      active = false;
    };
  }, [open, roomId, checkIn, checkOut, move.propertyId]);

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
      <div
        className="text-sm"
        style={{
          marginTop: 10,
          padding: "8px 12px",
          borderRadius: 8,
          background: "var(--surface-2)",
        }}
      >
        {preview ? (
          <>
            New total: <strong>₹ {preview.totalRupees.toLocaleString("en-IN")}</strong> ·{" "}
            {preview.nights} night{preview.nights > 1 ? "s" : ""} (incl. GST)
          </>
        ) : (
          <span className="text-muted">Calculating new total…</span>
        )}
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

function NotesPanel({
  bookingId,
  notes,
  onDone,
}: Readonly<{ bookingId: string; notes: string | null; onDone: (msg: string) => void }>) {
  const [value, setValue] = useState(notes ?? "");
  const [pending, start] = useTransition();
  const dirty = value.trim() !== (notes ?? "").trim();

  return (
    <div>
      <h4>Internal notes</h4>
      <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
        Private to staff — e.g. &ldquo;wants early check-in&rdquo; or &ldquo;extra pillow&rdquo;.
      </div>
      <textarea
        rows={3}
        value={value}
        placeholder="Add a note for this booking…"
        onChange={(e) => setValue(e.target.value)}
        style={{ width: "100%" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          className="btn btn-primary"
          disabled={pending || !dirty}
          onClick={() =>
            start(async () => {
              const res = await updateBookingNotesAction(bookingId, value);
              onDone(res.message ?? (res.ok ? "Notes saved." : "Could not save notes."));
            })
          }
        >
          <Icon name="check" className="icon-sm" /> Save notes
        </button>
        {dirty && (
          <button
            className="btn btn-ghost"
            disabled={pending}
            onClick={() => setValue(notes ?? "")}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function SendMessagePanel({
  bookingId,
  templates,
  guestHasEmail,
  onDone,
}: Readonly<{
  bookingId: string;
  templates: { id: string; name: string; channel: string }[];
  guestHasEmail: boolean;
  onDone: (msg: string) => void;
}>) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [pending, start] = useTransition();

  if (templates.length === 0) {
    return (
      <div className="text-sm text-muted">
        No message templates yet. Add them under Notifications to message this guest.
      </div>
    );
  }

  const selected = templates.find((t) => t.id === templateId);
  const blockedNoEmail = selected?.channel === "EMAIL" && !guestHasEmail;

  return (
    <div>
      <h4 style={{ marginTop: 0 }}>Message this guest</h4>
      <div className="field">
        <label>Template</label>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.channel.toLowerCase()})
            </option>
          ))}
        </select>
      </div>
      {blockedNoEmail && (
        <div className="error-text" style={{ marginTop: 6 }}>
          This guest has no email on file — pick an SMS/WhatsApp template or add their email.
        </div>
      )}
      <button
        className="btn btn-primary"
        style={{ marginTop: 10 }}
        disabled={pending || !templateId || blockedNoEmail}
        onClick={() =>
          start(async () => {
            const res = await sendBookingNotificationAction(bookingId, templateId);
            onDone(res.message ?? (res.ok ? "Message sent." : "Could not send message."));
          })
        }
      >
        <Icon name="send" className="icon-sm" /> {pending ? "Sending…" : "Send message"}
      </button>
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
