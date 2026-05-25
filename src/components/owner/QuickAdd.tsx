"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { createBookingAction, quoteBookingAction, type BookingQuote } from "@/lib/actions/bookings";

export interface QuickAddRoom {
  id: string;
  label: string;
  baseRateRupees: number;
}
export interface QuickAddChannel {
  key: string;
  name: string;
}

function isoPlus(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function QuickAdd({
  propertyId,
  rooms,
  channels,
  onlineEnabled = false,
}: {
  propertyId: string;
  rooms: QuickAddRoom[];
  channels: QuickAddChannel[];
  onlineEnabled?: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const open = sp.get("new") === "1";
  const prefillRoom = sp.get("room");
  const prefillDate = sp.get("date");

  const [step, setStep] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The rate field follows the property's rate plans until staff type their own value.
  const [rateManual, setRateManual] = useState(false);
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [form, setForm] = useState({
    guestName: "",
    guestPhone: "",
    guestEmail: "",
    roomId: rooms[0]?.id ?? "",
    checkIn: isoPlus(0),
    checkOut: isoPlus(2),
    adults: 2,
    children: 0,
    channelKey: "direct",
    payment: "later" as "link" | "paid" | "later",
    notes: "",
    nightlyRateRupees: rooms[0]?.baseRateRupees ?? 0,
  });

  useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
      setRateManual(false);
      setForm((f) => ({
        ...f,
        roomId: prefillRoom ?? f.roomId,
        checkIn: prefillDate ?? f.checkIn,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-price the stay from rate plans and check availability whenever the room or
  // dates change (audit P0 #1 + #2). Skipped once staff type their own rate.
  useEffect(() => {
    if (!open || !form.roomId) return;
    let active = true;
    const handle = setTimeout(async () => {
      const q = await quoteBookingAction({
        propertyId,
        roomId: form.roomId,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
      });
      if (!active || !q.ok) return;
      setQuote(q);
      if (!rateManual && q.nightlyRupees > 0) {
        setForm((f) => ({ ...f, nightlyRateRupees: q.nightlyRupees }));
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.roomId, form.checkIn, form.checkOut, rateManual, propertyId]);

  const unavailable = new Set(quote?.unavailableRoomIds ?? []);
  const selectedUnavailable = unavailable.has(form.roomId);

  function close() {
    const params = new URLSearchParams(sp.toString());
    params.delete("new");
    params.delete("room");
    params.delete("date");
    router.push("?" + params.toString());
  }

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const nights = Math.max(
    1,
    Math.round((new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime()) / 86_400_000),
  );
  // Auto rates can vary per night (weekday/weekend); trust the server quote's subtotal.
  // A manual rate is a flat per-night figure.
  const subtotal =
    !rateManual && quote?.ok && quote.subtotalRupees > 0
      ? quote.subtotalRupees
      : form.nightlyRateRupees * nights;
  const gst = Math.round(subtotal * 0.05);
  const total = subtotal + gst;

  async function submit() {
    setPending(true);
    setError(null);
    // In auto mode, omit the rate so the engine applies rate plans per night exactly.
    const { nightlyRateRupees, ...rest } = form;
    const res = await createBookingAction({
      propertyId,
      ...rest,
      ...(rateManual ? { nightlyRateRupees } : {}),
    });
    setPending(false);
    if (res.ok) {
      close();
      router.refresh();
    } else {
      // Surface the error on the review step where the user submitted.
      setError(res.message ?? "Could not create booking");
    }
  }

  return (
    <>
      <div className={"scrim " + (open ? "open" : "")} onClick={close} />
      <div className={"modal " + (open ? "open" : "")} role="dialog" aria-label="New booking">
        <div className="modal-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3>{step === 1 ? "Add booking" : "Confirm details"}</h3>
              <div className="sub">
                {step === 1
                  ? "Quickly capture the essentials — you can edit later."
                  : "Review before creating the booking."}
              </div>
            </div>
            <button className="icon-btn" onClick={close} aria-label="Close">
              <Icon name="x" className="icon-sm" />
            </button>
          </div>
        </div>

        {step === 1 ? (
          <div className="modal-body">
            {error && <div className="error-text">{error}</div>}
            <div className="field-row">
              <div className="field">
                <label>Guest mobile</label>
                <input
                  placeholder="+91 98xxx xxxxx"
                  value={form.guestPhone}
                  onChange={(e) => set("guestPhone", e.target.value)}
                  inputMode="tel"
                />
                <div className="hint">We&apos;ll check if this guest has stayed before.</div>
              </div>
              <div className="field">
                <label>Guest name</label>
                <input
                  placeholder="Full name"
                  value={form.guestName}
                  onChange={(e) => set("guestName", e.target.value)}
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label>Check-in</label>
                <input
                  type="date"
                  value={form.checkIn}
                  onChange={(e) => set("checkIn", e.target.value)}
                />
              </div>
              <div className="field">
                <label>Check-out</label>
                <input
                  type="date"
                  value={form.checkOut}
                  onChange={(e) => set("checkOut", e.target.value)}
                />
              </div>
            </div>

            <div className="field-row thirds">
              <div className="field">
                <label>Adults</label>
                <input
                  type="number"
                  min={1}
                  value={form.adults}
                  onChange={(e) => set("adults", +e.target.value)}
                />
              </div>
              <div className="field">
                <label>Children</label>
                <input
                  type="number"
                  min={0}
                  value={form.children}
                  onChange={(e) => set("children", +e.target.value)}
                />
              </div>
              <div className="field">
                <label>Rate / night (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={form.nightlyRateRupees}
                  onChange={(e) => {
                    setRateManual(true);
                    set("nightlyRateRupees", +e.target.value);
                  }}
                />
                {!rateManual && quote?.ok && (
                  <div className="hint">
                    {quote.appliedPlan ? (
                      <>
                        <Icon name="check" className="icon-sm" style={{ color: "var(--brand)" }} />{" "}
                        {quote.appliedPlan} applied
                        {quote.varies
                          ? ` · ₹${subtotal.toLocaleString("en-IN")} for ${nights} nights`
                          : ""}
                      </>
                    ) : (
                      <>Base rate{quote.varies ? " (varies by night)" : ""}</>
                    )}
                  </div>
                )}
                {rateManual && (
                  <button
                    type="button"
                    className="link-btn hint"
                    style={{ textAlign: "left", background: "none", border: 0, cursor: "pointer" }}
                    onClick={() => setRateManual(false)}
                  >
                    Use rate plan instead
                  </button>
                )}
              </div>
            </div>

            <div className="field">
              <label>Room</label>
              <select
                value={form.roomId}
                onChange={(e) => {
                  const r = rooms.find((x) => x.id === e.target.value);
                  set("roomId", e.target.value);
                  setRateManual(false);
                  // Show the new room's base rate instantly; the quote effect then
                  // refines it with any matching rate plan.
                  if (r) set("nightlyRateRupees", r.baseRateRupees);
                }}
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id} disabled={unavailable.has(r.id)}>
                    {r.label}
                    {unavailable.has(r.id) ? " — booked / blocked" : ""}
                  </option>
                ))}
              </select>
              {selectedUnavailable && (
                <div className="error-text" style={{ marginTop: 4 }}>
                  <Icon name="info" className="icon-sm" /> This room isn&apos;t free for those
                  dates. Pick another room or change the dates.
                </div>
              )}
            </div>

            <div className="field">
              <label>Source</label>
              <div className="chips">
                {channels.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={"chip" + (form.channelKey === c.key ? " selected" : "")}
                    onClick={() => set("channelKey", c.key)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Payment</label>
              <div className="chips">
                {[
                  { id: "later", label: "Collect manually", icon: "clock" },
                  { id: "paid", label: "Mark as paid (cash)", icon: "check" },
                  ...(onlineEnabled
                    ? [{ id: "link", label: "Send online link", icon: "send" }]
                    : []),
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={"chip" + (form.payment === p.id ? " selected" : "")}
                    onClick={() => set("payment", p.id as typeof form.payment)}
                  >
                    <Icon name={p.icon} className="icon-sm" />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>
                Notes <span className="hint">(optional)</span>
              </label>
              <textarea
                rows={2}
                placeholder="Any preferences or special requests?"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="card" style={{ background: "var(--surface-2)", padding: 16 }}>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                Summary
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.015em" }}>
                {form.guestName} · {nights} night{nights > 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                {form.adults} adults{form.children ? `, ${form.children} children` : ""} ·{" "}
                {channels.find((c) => c.key === form.channelKey)?.name}
              </div>
            </div>

            <div className="line-items">
              <div className="li-row">
                <div>
                  <div>Room charge</div>
                  <div className="sub">
                    {!rateManual && quote?.ok && quote.varies
                      ? `${quote.appliedPlan ?? "Rate plan"} · rates vary by night · ${nights} nights`
                      : `₹ ${form.nightlyRateRupees.toLocaleString("en-IN")} × ${nights} nights`}
                  </div>
                  {!rateManual && quote?.ok && quote.appliedPlan && !quote.varies && (
                    <div className="sub" style={{ color: "var(--brand)" }}>
                      {quote.appliedPlan} applied
                    </div>
                  )}
                </div>
                <div />
                <div className="money">₹ {subtotal.toLocaleString("en-IN")}</div>
              </div>
              <div className="li-row">
                <div>GST (5%)</div>
                <div />
                <div className="money">₹ {gst.toLocaleString("en-IN")}</div>
              </div>
              <div className="li-row total">
                <div>Total</div>
                <div />
                <div className="money">₹ {total.toLocaleString("en-IN")}</div>
              </div>
            </div>

            {form.payment === "link" && (
              <div
                style={{
                  background: "var(--brand-tint)",
                  border: "1px solid var(--brand-soft)",
                  padding: 12,
                  borderRadius: 12,
                  fontSize: 13,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <Icon name="send" className="icon-sm" style={{ color: "var(--brand)" }} />
                <div>
                  <div style={{ fontWeight: 550 }}>Payment link will be created</div>
                  <div className="text-xs text-muted">
                    Sent via SMS + email (mock link in dev without Razorpay keys).
                  </div>
                </div>
              </div>
            )}
            {error && <div className="error-text">{error}</div>}
          </div>
        )}

        <div className="modal-footer">
          {step === 2 && (
            <button className="btn" onClick={() => setStep(1)} disabled={pending}>
              Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={close} disabled={pending}>
            Cancel
          </button>
          {step === 1 ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!form.guestName || !form.guestPhone) {
                  setError("Guest name and mobile are required.");
                  return;
                }
                if (selectedUnavailable) {
                  setError("That room isn't available for those dates. Pick another.");
                  return;
                }
                setError(null);
                setStep(2);
              }}
            >
              Review <Icon name="arrow-right" className="icon-sm" />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={submit} disabled={pending}>
              <Icon name="check" className="icon-sm" /> {pending ? "Creating…" : "Create booking"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
