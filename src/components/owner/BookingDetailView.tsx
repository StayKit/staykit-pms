"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Avatar, ChannelChip, StatusPill, type DisplayState } from "@/components/ui";
import {
  checkInAction,
  checkOutAction,
  sendPaymentLinkAction,
  markPaidAction,
  cancelAction,
} from "@/lib/actions/bookings";

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
  money: { subtotal: string; tax: string; total: string; paid: string; due: string; dueRaw: number; taxLabel: string; nightly: string };
  payments: { icon: string; tone: string; title: string; sub: string }[];
  comms: { icon: string; tone: string; title: string; sub: string }[];
  audit: { bot: boolean; actor: string; what: string; when: string }[];
  notes: string | null;
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
          <div className="ref">{data.room.number} · {data.room.name}</div>
          <h2>{g?.name ?? "Owner block"}</h2>
          <div className="where">
            {data.checkIn} → {data.checkOut} · {data.nights} night{data.nights > 1 ? "s" : ""} · {data.adults + data.children} guests
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
            <button key={tb} className={"tab " + (tab === tb ? "active" : "")} onClick={() => setTab(tb)}>
              {{ stay: "Stay", guest: "Guest", payments: "Payments", comms: "Messages", audit: "Activity" }[tb]}
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
                <KV k="Guests" v={`${data.adults} adult${data.adults > 1 ? "s" : ""}${data.children ? `, ${data.children} child${data.children > 1 ? "ren" : ""}` : ""}`} />
                <KV k="Source" v={<ChannelChip channelKey={data.channel.key} name={data.channel.name} />} />
                <KV k="Booking ref" v={<span style={{ fontVariantNumeric: "tabular-nums" }}>{data.ref}</span>} />
              </div>
            </div>

            <div className="bd-section">
              <h4>Rate breakdown</h4>
              <div className="line-items">
                <div className="li-row">
                  <div>
                    <div>Room charge — {data.room.name}</div>
                    <div className="sub">{data.money.nightly} × {data.nights} nights</div>
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
              <KV k="ID document" v={g.idType ? `${g.idType} — •••• ${g.idLast4 ?? "----"}` : "Not on file"} />
            </div>
          </div>
        )}

        {tab === "payments" && (
          <div className="bd-section">
            <h4>Payment status</h4>
            <div className="kv-grid">
              <KV k="Total" v={<span className="money">{data.money.total}</span>} />
              <KV k="Paid" v={<span className="money" style={{ color: "var(--st-checkedin)" }}>{data.money.paid}</span>} />
              <KV k="Due" v={<span className="money" style={{ color: data.money.dueRaw > 0 ? "var(--st-unpaid)" : "var(--ink-2)" }}>{data.money.due}</span>} />
            </div>
            <h4 style={{ marginTop: 24 }}>Timeline</h4>
            <div>
              {data.payments.length === 0 && <div className="text-muted text-sm">No payments yet.</div>}
              {data.payments.map((p, i) => (
                <div className="timeline-row" key={i}>
                  <div className={"timeline-dot " + (p.tone === "empty" ? "empty" : "")} style={p.tone === "ok" ? { background: "var(--st-checkedin)" } : undefined}>
                    <Icon name={p.icon} className="icon-sm" />
                  </div>
                  <div className="text">{p.title}<div className="sub">{p.sub}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "comms" && (
          <div className="bd-section">
            <h4>Messages sent</h4>
            {data.comms.length === 0 && <div className="text-muted text-sm">No messages yet.</div>}
            {data.comms.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
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
                <div className="timeline-dot" style={{ background: a.bot ? "#7565B0" : "var(--brand)" }}>
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
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled={pending} onClick={() => run(() => checkOutAction(data.id))}>
              <Icon name="log-out" className="icon-sm" /> Check out
            </button>
          ) : data.state === "tentative" ? (
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled={pending} onClick={() => run(() => markPaidAction(data.id))}>
              <Icon name="check" className="icon-sm" /> Confirm & mark paid
            </button>
          ) : data.state === "unpaid" || data.state === "partial" ? (
            <>
              <button className="btn btn-accent btn-lg" style={{ flex: 1 }} disabled={pending} onClick={() => run(() => sendPaymentLinkAction(data.id))}>
                <Icon name="send" className="icon-sm" /> Send payment link
              </button>
              <button className="btn btn-lg" disabled={pending} onClick={() => run(() => checkInAction(data.id))}>
                <Icon name="key" className="icon-sm" /> Check in
              </button>
            </>
          ) : data.state === "paid" ? (
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled={pending} onClick={() => run(() => checkInAction(data.id))}>
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
        <div style={{ marginTop: 14 }} className="dev-code">{toast}</div>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
