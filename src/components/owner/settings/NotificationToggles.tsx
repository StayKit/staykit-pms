"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { toggleTemplateAction, seedDefaultTemplatesAction } from "@/lib/actions/notifications";

export interface ToggleRow {
  id: string;
  channel: "SMS" | "EMAIL" | "WHATSAPP";
  triggerKey: string;
  name: string;
  active: boolean;
}

const CHANNEL_TAG: Record<ToggleRow["channel"], string> = {
  SMS: "",
  EMAIL: "direct",
  WHATSAPP: "whatsapp",
};

const CHANNEL_LABEL: Record<ToggleRow["channel"], string> = {
  SMS: "SMS",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
};

const TRIGGER_LABEL: Record<string, string> = {
  BOOKING_CONFIRMED: "Booking confirmed",
  PAYMENT_LINK_SENT: "Payment link sent",
  PAYMENT_RECEIVED: "Payment received",
  PRE_ARRIVAL_24H: "Pre-arrival reminder",
  POST_CHECKOUT_THANKS: "Post-checkout thanks",
  CANCELLED: "Booking cancelled",
  REFUND_PROCESSED: "Refund processed",
};

export function NotificationToggles({ rows }: Readonly<{ rows: ToggleRow[] }>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(id: string) {
    start(async () => {
      const res = await toggleTemplateAction(id);
      if (!res.ok) setMsg(res.message ?? "Could not update the template.");
      router.refresh();
    });
  }

  function seed() {
    start(async () => {
      const res = await seedDefaultTemplatesAction();
      setMsg(res.message ?? (res.ok ? "Templates added." : "Could not add templates."));
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="card card-padded">
        <div className="empty" style={{ padding: "8px 0 16px" }}>
          No message templates yet. Seed the defaults to start sending confirmations and reminders.
        </div>
        <button className="btn btn-primary" disabled={pending} onClick={seed}>
          <Icon name="plus" className="icon-sm" /> Seed default templates
        </button>
        {msg && (
          <div className="dev-code" style={{ marginTop: 12 }}>
            {msg}
          </div>
        )}
      </div>
    );
  }

  // Group by trigger so each event lists its per-channel toggles together.
  const byTrigger = new Map<string, ToggleRow[]>();
  for (const r of rows) {
    const list = byTrigger.get(r.triggerKey) ?? [];
    list.push(r);
    byTrigger.set(r.triggerKey, list);
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Event</th>
            <th>Channel</th>
            <th>Status</th>
            <th style={{ width: 110 }}></th>
          </tr>
        </thead>
        <tbody>
          {[...byTrigger.entries()].flatMap(([trigger, list]) =>
            list.map((r, idx) => (
              <tr key={r.id}>
                <td>
                  {idx === 0 ? (
                    <div className="name" style={{ fontWeight: 550 }}>
                      {TRIGGER_LABEL[trigger] ?? trigger}
                    </div>
                  ) : null}
                </td>
                <td>
                  <span className={"channel-chip " + CHANNEL_TAG[r.channel]}>
                    {CHANNEL_LABEL[r.channel]}
                  </span>
                </td>
                <td>
                  {r.active ? (
                    <span className="pill pill-brand">On</span>
                  ) : (
                    <span className="pill pill-neutral">Off</span>
                  )}
                </td>
                <td>
                  <button className="btn btn-sm" disabled={pending} onClick={() => toggle(r.id)}>
                    {r.active ? "Turn off" : "Turn on"}
                  </button>
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      {msg && (
        <div className="dev-code" style={{ margin: 14 }}>
          {msg}
        </div>
      )}
    </div>
  );
}
