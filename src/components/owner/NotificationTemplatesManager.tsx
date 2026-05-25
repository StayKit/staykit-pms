"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { renderTemplate, TEMPLATE_VARIABLES } from "@/lib/notify/template";
import {
  createTemplateAction,
  updateTemplateAction,
  deleteTemplateAction,
  toggleTemplateAction,
  seedDefaultTemplatesAction,
  sendTestAction,
} from "@/lib/actions/notifications";

export interface TemplateRow {
  id: string;
  channel: "SMS" | "EMAIL" | "WHATSAPP";
  triggerKey: string;
  name: string;
  subject: string | null;
  body: string;
  dltTemplateId: string | null;
  whatsappTemplateName: string | null;
  active: boolean;
}

const CHANNELS = ["SMS", "EMAIL", "WHATSAPP"] as const;
const CHANNEL_LABEL: Record<string, string> = { SMS: "SMS", EMAIL: "Email", WHATSAPP: "WhatsApp" };
const CHANNEL_TAG: Record<string, string> = { SMS: "", EMAIL: "direct", WHATSAPP: "whatsapp" };

// The lifecycle triggers wired into the app (see lib/notify/dispatch + booking engine).
const TRIGGERS: { key: string; label: string }[] = [
  { key: "BOOKING_CONFIRMED", label: "Booking confirmed" },
  { key: "BOOKING_TENTATIVE", label: "Booking held (tentative)" },
  { key: "PAYMENT_LINK_SENT", label: "Payment link sent" },
  { key: "PAYMENT_RECEIVED", label: "Payment received" },
  { key: "PRE_ARRIVAL_24H", label: "Day before arrival" },
  { key: "CHECK_IN_INSTRUCTIONS", label: "Check-in instructions" },
  { key: "POST_CHECKOUT_THANKS", label: "After check-out (thanks)" },
  { key: "CANCELLED", label: "Booking cancelled" },
  { key: "REFUND_PROCESSED", label: "Refund processed" },
  { key: "NO_SHOW", label: "No-show" },
  { key: "OWNER_NEW_BOOKING", label: "Owner: new booking alert" },
];
const TRIGGER_LABEL = Object.fromEntries(TRIGGERS.map((t) => [t.key, t.label]));

const SAMPLE_SCOPE = {
  guest: { name: "Asha Rao" },
  booking: {
    ref: "SK-2K9Q3",
    checkIn: "2026-06-12T00:00:00.000Z",
    checkOut: "2026-06-15T00:00:00.000Z",
  },
  property: { name: "Coorg Mist Homestay", checkInTime: "14:00" },
  amount: { due: 450000, total: 900000 },
  paymentLink: { url: "https://rzp.io/i/demo" },
};

type Draft = {
  id: string | null;
  channel: "SMS" | "EMAIL" | "WHATSAPP";
  triggerKey: string;
  name: string;
  subject: string;
  body: string;
  dltTemplateId: string;
  whatsappTemplateName: string;
};

function blankDraft(): Draft {
  return {
    id: null,
    channel: "SMS",
    triggerKey: "BOOKING_CONFIRMED",
    name: "",
    subject: "",
    body: "",
    dltTemplateId: "",
    whatsappTemplateName: "",
  };
}

export function NotificationTemplatesManager({
  templates,
}: Readonly<{ templates: TemplateRow[] }>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    start(async () => {
      const res = await fn();
      setMsg(res.message ?? (res.ok ? "Done." : "Something went wrong."));
      if (res.ok) after?.();
      router.refresh();
    });
  }

  function openNew() {
    setMsg(null);
    setDraft(blankDraft());
  }
  function openEdit(t: TemplateRow) {
    setMsg(null);
    setDraft({
      id: t.id,
      channel: t.channel,
      triggerKey: t.triggerKey,
      name: t.name,
      subject: t.subject ?? "",
      body: t.body,
      dltTemplateId: t.dltTemplateId ?? "",
      whatsappTemplateName: t.whatsappTemplateName ?? "",
    });
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h3>Templates</h3>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {templates.length === 0 && (
              <button
                className="btn"
                disabled={pending}
                onClick={() => run(() => seedDefaultTemplatesAction())}
              >
                <Icon name="sparkles" className="icon-sm" /> Add default set
              </button>
            )}
            <button className="btn btn-primary" disabled={pending} onClick={openNew}>
              <Icon name="plus" className="icon-sm" /> New template
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Template</th>
                <th>Channel</th>
                <th>Trigger</th>
                <th>Status</th>
                <th style={{ width: 150 }}></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="name" style={{ fontWeight: 550 }}>
                      {t.name}
                    </div>
                    <div
                      className="text-xs text-muted"
                      style={{
                        maxWidth: 320,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.body}
                    </div>
                  </td>
                  <td>
                    <span className={"channel-chip " + CHANNEL_TAG[t.channel]}>
                      {CHANNEL_LABEL[t.channel]}
                    </span>
                  </td>
                  <td className="text-sm text-muted">
                    {TRIGGER_LABEL[t.triggerKey] ?? t.triggerKey}
                  </td>
                  <td>
                    <button
                      className={"pill " + (t.active ? "pill-brand" : "pill-neutral")}
                      disabled={pending}
                      onClick={() => run(() => toggleTemplateAction(t.id))}
                      title={t.active ? "Active — click to pause" : "Paused — click to activate"}
                      style={{ cursor: "pointer", border: 0 }}
                    >
                      {t.active ? "Active" : "Paused"}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(t)}>
                        <Icon name="edit" className="icon-sm" /> Edit
                      </button>
                      <button
                        className="icon-btn"
                        aria-label="Delete template"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`Delete the "${t.name}" template?`))
                            run(() => deleteTemplateAction(t.id));
                        }}
                      >
                        <Icon name="trash" className="icon-sm" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <Icon name="bell" className="icon" />
                      <div className="empty-title">No templates yet</div>
                      <div className="empty-sub">
                        Add the default set of SMS/email messages, or create your own.
                      </div>
                      <div className="empty-actions">
                        <button
                          className="btn btn-primary"
                          disabled={pending}
                          onClick={() => run(() => seedDefaultTemplatesAction())}
                        >
                          <Icon name="sparkles" className="icon-sm" /> Add default set
                        </button>
                        <button className="btn" onClick={openNew}>
                          <Icon name="plus" className="icon-sm" /> New template
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {msg && (
          <div className="dev-code" style={{ margin: 14 }}>
            {msg}
          </div>
        )}
      </div>

      {draft && (
        <TemplateEditor
          draft={draft}
          setDraft={setDraft}
          pending={pending}
          onClose={() => setDraft(null)}
          onSave={() =>
            run(
              () =>
                draft.id
                  ? updateTemplateAction(draft.id, {
                      name: draft.name,
                      subject: draft.subject,
                      body: draft.body,
                      dltTemplateId: draft.dltTemplateId,
                      whatsappTemplateName: draft.whatsappTemplateName,
                    })
                  : createTemplateAction({
                      channel: draft.channel,
                      triggerKey: draft.triggerKey,
                      name: draft.name,
                      subject: draft.subject,
                      body: draft.body,
                      dltTemplateId: draft.dltTemplateId,
                      whatsappTemplateName: draft.whatsappTemplateName,
                    }),
              () => setDraft(null),
            )
          }
        />
      )}
    </>
  );
}

function TemplateEditor({
  draft,
  setDraft,
  pending,
  onClose,
  onSave,
}: Readonly<{
  draft: Draft;
  setDraft: (d: Draft) => void;
  pending: boolean;
  onClose: () => void;
  onSave: () => void;
}>) {
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, startTest] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });

  const preview = renderTemplate(draft.body || "", SAMPLE_SCOPE);
  const subjectPreview = renderTemplate(draft.subject || "", SAMPLE_SCOPE);

  return (
    <>
      <button className="scrim open" aria-label="Close" onClick={onClose} />
      <div className="modal open" role="dialog" aria-label="Edit template" style={{ width: 640 }}>
        <div className="modal-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>{draft.id ? "Edit template" : "New template"}</h3>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" className="icon-sm" />
            </button>
          </div>
        </div>
        <div className="modal-body">
          <div className="field-row">
            <div className="field">
              <label>Channel</label>
              <select
                value={draft.channel}
                disabled={!!draft.id}
                onChange={(e) => set("channel", e.target.value as Draft["channel"])}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABEL[c]}
                  </option>
                ))}
              </select>
              {draft.id && (
                <div className="hint">Channel/trigger can&apos;t change after creation.</div>
              )}
            </div>
            <div className="field">
              <label>Trigger</label>
              <select
                value={draft.triggerKey}
                disabled={!!draft.id}
                onChange={(e) => set("triggerKey", e.target.value)}
              >
                {TRIGGERS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Template name</label>
            <input
              value={draft.name}
              placeholder="e.g. Booking confirmed (SMS)"
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          {draft.channel === "EMAIL" && (
            <div className="field">
              <label>Subject</label>
              <input value={draft.subject} onChange={(e) => set("subject", e.target.value)} />
            </div>
          )}

          <div className="field">
            <label>Message body</label>
            <textarea rows={5} value={draft.body} onChange={(e) => set("body", e.target.value)} />
          </div>

          <div>
            <div className="text-xs text-muted" style={{ fontWeight: 550, marginBottom: 4 }}>
              Insert a variable
            </div>
            <div className="chips">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="chip"
                  onClick={() => set("body", (draft.body + " " + v).trim())}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {draft.channel === "SMS" && (
            <div className="field">
              <label>
                DLT template ID <span className="hint">(required for live SMS in India)</span>
              </label>
              <input
                value={draft.dltTemplateId}
                onChange={(e) => set("dltTemplateId", e.target.value)}
              />
            </div>
          )}
          {draft.channel === "WHATSAPP" && (
            <div className="field">
              <label>
                WhatsApp template name <span className="hint">(approved in Meta)</span>
              </label>
              <input
                value={draft.whatsappTemplateName}
                onChange={(e) => set("whatsappTemplateName", e.target.value)}
              />
            </div>
          )}

          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <div className="text-xs text-muted" style={{ fontWeight: 550, marginBottom: 6 }}>
              Preview (sample data)
            </div>
            {draft.channel === "EMAIL" && draft.subject && (
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{subjectPreview}</div>
            )}
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>
              {preview || <span className="text-muted">Your message will appear here…</span>}
            </div>
          </div>

          <div className="field">
            <label>Send a test {draft.channel === "EMAIL" ? "email" : "message"}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ flex: 1 }}
                placeholder={draft.channel === "EMAIL" ? "you@example.com" : "+91 98xxx xxxxx"}
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
              <button
                className="btn"
                disabled={testing || !draft.id || !testTo.trim()}
                title={draft.id ? "" : "Save the template first to test it"}
                onClick={() =>
                  startTest(async () => {
                    const res = await sendTestAction(draft.id!, testTo);
                    setTestMsg(res.message ?? (res.ok ? "Sent." : "Could not send."));
                  })
                }
              >
                <Icon name="send" className="icon-sm" /> Test
              </button>
            </div>
            {!draft.id && <div className="hint">Save the template first, then send a test.</div>}
            {testMsg && <div className="dev-code">{testMsg}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={pending || !draft.name.trim() || !draft.body.trim()}
            onClick={onSave}
          >
            <Icon name="check" className="icon-sm" />{" "}
            {draft.id ? "Save changes" : "Create template"}
          </button>
        </div>
      </div>
    </>
  );
}
