"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { renderTemplate, TEMPLATE_VARIABLES } from "@/lib/notify/template";
import {
  saveTemplateGroupAction,
  deleteTemplateGroupAction,
  seedDefaultTemplatesAction,
  sendTestAction,
} from "@/lib/actions/notifications";
import {
  CHANNELS,
  CHANNEL_LABEL,
  CHANNEL_TAG,
  CHANNEL_ICON,
  TRIGGERS,
  TRIGGER_LABEL,
  TRIGGER_WHEN,
  triggerOrder,
  type NotifyChannel,
} from "@/lib/notify/triggers";

export interface TemplateRow {
  id: string;
  channel: NotifyChannel;
  triggerKey: string;
  name: string;
  subject: string | null;
  body: string;
  dltTemplateId: string | null;
  whatsappTemplateName: string | null;
  active: boolean;
}

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

/** One channel's editable state inside the group editor. */
type ChannelDraft = {
  channel: NotifyChannel;
  existingId: string | null;
  active: boolean;
  subject: string;
  body: string;
  dltTemplateId: string;
  whatsappTemplateName: string;
};

type GroupDraft = {
  triggerKey: string;
  isNew: boolean;
  channels: Record<NotifyChannel, ChannelDraft>;
};

/** A trigger and the per-channel rows that exist for it. */
type Group = { triggerKey: string; rows: TemplateRow[] };

function emptyChannel(channel: NotifyChannel): ChannelDraft {
  return {
    channel,
    existingId: null,
    active: false,
    subject: "",
    body: "",
    dltTemplateId: "",
    whatsappTemplateName: "",
  };
}

function draftFor(triggerKey: string, rows: TemplateRow[], isNew: boolean): GroupDraft {
  const channels = {} as Record<NotifyChannel, ChannelDraft>;
  for (const ch of CHANNELS) {
    const r = rows.find((x) => x.channel === ch);
    channels[ch] = r
      ? {
          channel: ch,
          existingId: r.id,
          active: r.active,
          subject: r.subject ?? "",
          body: r.body,
          dltTemplateId: r.dltTemplateId ?? "",
          whatsappTemplateName: r.whatsappTemplateName ?? "",
        }
      : emptyChannel(ch);
  }
  return { triggerKey, isNew, channels };
}

export function NotificationTemplatesManager({
  templates,
}: Readonly<{ templates: TemplateRow[] }>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<GroupDraft | null>(null);

  // Group rows by trigger, ordered by the canonical lifecycle order.
  const byTrigger = new Map<string, TemplateRow[]>();
  for (const t of templates) {
    const list = byTrigger.get(t.triggerKey) ?? [];
    list.push(t);
    byTrigger.set(t.triggerKey, list);
  }
  const groups: Group[] = [...byTrigger.entries()]
    .map(([triggerKey, rows]) => ({ triggerKey, rows }))
    .sort((a, b) => triggerOrder(a.triggerKey) - triggerOrder(b.triggerKey));

  const unconfigured = TRIGGERS.filter((t) => !byTrigger.has(t.key));

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    start(async () => {
      const res = await fn();
      setMsg(res.message ?? (res.ok ? "Done." : "Something went wrong."));
      if (res.ok) after?.();
      router.refresh();
    });
  }

  function openEdit(g: Group) {
    setMsg(null);
    setDraft(draftFor(g.triggerKey, g.rows, false));
  }
  function openNew() {
    setMsg(null);
    const first = unconfigured[0]?.key ?? TRIGGERS[0].key;
    setDraft(draftFor(first, [], true));
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h3>Message templates</h3>
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
            <button
              className="btn btn-primary"
              disabled={pending || unconfigured.length === 0}
              title={unconfigured.length === 0 ? "Every event already has a template" : ""}
              onClick={openNew}
            >
              <Icon name="plus" className="icon-sm" /> New event
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Event</th>
                <th>Channels</th>
                <th style={{ width: 130 }}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const activeCount = g.rows.filter((r) => r.active).length;
                const sample = g.rows.find((r) => r.active) ?? g.rows[0];
                return (
                  <tr key={g.triggerKey}>
                    <td>
                      <div className="name" style={{ fontWeight: 550 }}>
                        {TRIGGER_LABEL[g.triggerKey] ?? g.triggerKey}
                      </div>
                      <div
                        className="text-xs text-muted"
                        style={{
                          maxWidth: 360,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {sample?.body}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {CHANNELS.flatMap((ch) => {
                          const r = g.rows.find((x) => x.channel === ch);
                          if (!r) return [];
                          return [
                            <span
                              key={ch}
                              className={"channel-chip " + CHANNEL_TAG[ch]}
                              style={r.active ? undefined : { opacity: 0.45 }}
                              title={
                                r.active
                                  ? `${CHANNEL_LABEL[ch]} — on`
                                  : `${CHANNEL_LABEL[ch]} — off`
                              }
                            >
                              {CHANNEL_LABEL[ch]}
                              {!r.active && " · off"}
                            </span>,
                          ];
                        })}
                        {activeCount === 0 && (
                          <span className="text-xs text-muted" style={{ alignSelf: "center" }}>
                            all off
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(g)}>
                          <Icon name="edit" className="icon-sm" /> Edit
                        </button>
                        <button
                          className="icon-btn"
                          aria-label="Delete event templates"
                          disabled={pending}
                          onClick={() => {
                            if (
                              confirm(
                                `Delete all messages for "${TRIGGER_LABEL[g.triggerKey] ?? g.triggerKey}"?`,
                              )
                            )
                              run(() => deleteTemplateGroupAction(g.triggerKey));
                          }}
                        >
                          <Icon name="trash" className="icon-sm" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={3}>
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
                          <Icon name="plus" className="icon-sm" /> New event
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
        <GroupEditor
          draft={draft}
          setDraft={setDraft}
          unconfigured={unconfigured.map((t) => t.key)}
          pending={pending}
          onClose={() => setDraft(null)}
          onSave={() =>
            run(
              () =>
                saveTemplateGroupAction({
                  triggerKey: draft.triggerKey,
                  channels: CHANNELS.map((ch) => {
                    const c = draft.channels[ch];
                    return {
                      channel: ch,
                      active: c.active,
                      subject: c.subject,
                      body: c.body,
                      dltTemplateId: c.dltTemplateId,
                      whatsappTemplateName: c.whatsappTemplateName,
                    };
                  }),
                }),
              () => setDraft(null),
            )
          }
        />
      )}
    </>
  );
}

function GroupEditor({
  draft,
  setDraft,
  unconfigured,
  pending,
  onClose,
  onSave,
}: Readonly<{
  draft: GroupDraft;
  setDraft: (d: GroupDraft) => void;
  unconfigured: string[];
  pending: boolean;
  onClose: () => void;
  onSave: () => void;
}>) {
  // Expand sections that are on or already have content; collapse the rest.
  const [expanded, setExpanded] = useState<Record<NotifyChannel, boolean>>(() => {
    const init = {} as Record<NotifyChannel, boolean>;
    for (const ch of CHANNELS) {
      const c = draft.channels[ch];
      init[ch] = c.active || c.body.trim().length > 0;
    }
    return init;
  });

  const triggerChoices = draft.isNew
    ? TRIGGERS.filter((t) => unconfigured.includes(t.key))
    : TRIGGERS.filter((t) => t.key === draft.triggerKey);

  const setChannel = (ch: NotifyChannel, patch: Partial<ChannelDraft>) =>
    setDraft({
      ...draft,
      channels: { ...draft.channels, [ch]: { ...draft.channels[ch], ...patch } },
    });

  function toggleChannel(ch: NotifyChannel) {
    const next = !draft.channels[ch].active;
    setChannel(ch, { active: next });
    if (next) setExpanded((e) => ({ ...e, [ch]: true }));
  }

  const anyContent = CHANNELS.some((ch) => draft.channels[ch].body.trim().length > 0);

  return (
    <>
      <button className="scrim open" aria-label="Close" onClick={onClose} />
      <div
        className="modal open"
        role="dialog"
        aria-label="Edit event templates"
        style={{ width: 640 }}
      >
        <div className="modal-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>
              {draft.isNew ? "New event" : (TRIGGER_LABEL[draft.triggerKey] ?? draft.triggerKey)}
            </h3>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" className="icon-sm" />
            </button>
          </div>
          {!draft.isNew && <div className="sub">{TRIGGER_WHEN[draft.triggerKey]}</div>}
        </div>
        <div className="modal-body">
          {draft.isNew && (
            <div className="field">
              <label>Event</label>
              <select
                value={draft.triggerKey}
                onChange={(e) => setDraft({ ...draft, triggerKey: e.target.value })}
              >
                {triggerChoices.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
              <div className="hint">{TRIGGER_WHEN[draft.triggerKey]}</div>
            </div>
          )}

          <div className="text-xs text-muted" style={{ fontWeight: 550 }}>
            Turn each channel on or off and edit its wording. Guests get one message per channel
            that&apos;s on.
          </div>

          {CHANNELS.map((ch) => (
            <ChannelSection
              key={ch}
              ch={ch}
              draft={draft.channels[ch]}
              expanded={expanded[ch]}
              onToggleExpand={() => setExpanded((e) => ({ ...e, [ch]: !e[ch] }))}
              onToggleActive={() => toggleChannel(ch)}
              setChannel={(patch) => setChannel(ch, patch)}
            />
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={pending || !anyContent}
            title={anyContent ? "" : "Add a message for at least one channel"}
            onClick={onSave}
          >
            <Icon name="check" className="icon-sm" /> Save changes
          </button>
        </div>
      </div>
    </>
  );
}

function ChannelSection({
  ch,
  draft,
  expanded,
  onToggleExpand,
  onToggleActive,
  setChannel,
}: Readonly<{
  ch: NotifyChannel;
  draft: ChannelDraft;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  setChannel: (patch: Partial<ChannelDraft>) => void;
}>) {
  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, startTest] = useTransition();

  const preview = renderTemplate(draft.body || "", SAMPLE_SCOPE);
  const subjectPreview = renderTemplate(draft.subject || "", SAMPLE_SCOPE);
  let summary = "Not set up";
  if (draft.body.trim()) summary = draft.body.trim();
  else if (draft.active) summary = "On — add a message";

  return (
    <div className="chan-section">
      <div className="chan-head">
        <button
          type="button"
          className="chan-head-main"
          onClick={onToggleExpand}
          aria-expanded={expanded}
        >
          <span className={"chan-icon channel-chip " + CHANNEL_TAG[ch]}>
            <Icon name={CHANNEL_ICON[ch]} className="icon-sm" />
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="chan-name">{CHANNEL_LABEL[ch]}</span>
            {!expanded && (
              <span className="chan-summary" title={summary}>
                {summary}
              </span>
            )}
          </span>
        </button>
        <span className={"pill " + (draft.active ? "pill-brand" : "pill-neutral")}>
          {draft.active ? "On" : "Off"}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={draft.active}
          aria-label={`Turn ${CHANNEL_LABEL[ch]} ${draft.active ? "off" : "on"}`}
          className={"switch" + (draft.active ? " on" : "")}
          onClick={onToggleActive}
        />
      </div>

      {expanded && (
        <div className="chan-body">
          {ch === "EMAIL" && (
            <div className="field">
              <label>Subject</label>
              <input
                value={draft.subject}
                placeholder="Your booking at {{property.name}} is confirmed"
                onChange={(e) => setChannel({ subject: e.target.value })}
              />
            </div>
          )}

          <div className="field">
            <label>Message</label>
            <textarea
              rows={4}
              value={draft.body}
              placeholder={`What the guest receives by ${CHANNEL_LABEL[ch]}…`}
              onChange={(e) => setChannel({ body: e.target.value })}
            />
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
                  onClick={() => setChannel({ body: (draft.body + " " + v).trim() })}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {ch === "SMS" && (
            <div className="field">
              <label>
                DLT template ID <span className="hint">(required for live SMS in India)</span>
              </label>
              <input
                value={draft.dltTemplateId}
                onChange={(e) => setChannel({ dltTemplateId: e.target.value })}
              />
            </div>
          )}
          {ch === "WHATSAPP" && (
            <div className="field">
              <label>
                WhatsApp template name <span className="hint">(approved in Meta)</span>
              </label>
              <input
                value={draft.whatsappTemplateName}
                onChange={(e) => setChannel({ whatsappTemplateName: e.target.value })}
              />
            </div>
          )}

          {draft.body.trim() && (
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
              {ch === "EMAIL" && draft.subject && (
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  {subjectPreview}
                </div>
              )}
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>
                {preview}
              </div>
            </div>
          )}

          <div className="field">
            <label>Send a test {ch === "EMAIL" ? "email" : "message"}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ flex: 1 }}
                placeholder={ch === "EMAIL" ? "you@example.com" : "+91 98xxx xxxxx"}
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
              <button
                className="btn"
                disabled={testing || !draft.existingId || !testTo.trim()}
                title={draft.existingId ? "" : "Save this channel first to test it"}
                onClick={() =>
                  startTest(async () => {
                    const res = await sendTestAction(draft.existingId!, testTo);
                    setTestMsg(res.message ?? (res.ok ? "Sent." : "Could not send."));
                  })
                }
              >
                <Icon name="send" className="icon-sm" /> Test
              </button>
            </div>
            {!draft.existingId && (
              <div className="hint">Save changes first, then come back to send a test.</div>
            )}
            {testMsg && <div className="dev-code">{testMsg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
