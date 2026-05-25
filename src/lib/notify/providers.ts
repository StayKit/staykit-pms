/**
 * Notification provider interface. v1 ships MSG91 (SMS + WhatsApp) and Resend
 * (email) adapters behind one interface. When no credentials are configured the
 * ConsoleProvider logs instead of sending, so the app runs end-to-end in dev.
 *
 * DLT note: MSG91 expects DLT-approved content; we store {{var}} in our editor and
 * render the final body at send-time, passing the registered DLT template id
 * (dltTemplateId) alongside. WhatsApp requires a Meta-approved template name.
 *
 * Env is read per send() call (like the Razorpay client) so an owner can paste keys
 * in Settings → Integrations and have sending switch on without a server restart.
 */
import type { NotificationChannel } from "@prisma/client";

export interface SendInput {
  channel: NotificationChannel;
  to: string;
  body: string;
  subject?: string;
  dltTemplateId?: string;
  whatsappTemplateName?: string;
}

export interface SendResult {
  providerMessageId: string;
  provider: string;
}

export interface NotificationProvider {
  readonly name: string;
  supports(channel: NotificationChannel): boolean;
  send(input: SendInput): Promise<SendResult>;
}

class ConsoleProvider implements NotificationProvider {
  readonly name = "console";
  supports() {
    return true;
  }
  async send(input: SendInput): Promise<SendResult> {
    console.log(`[notify:${input.channel}] → ${input.to}\n${input.body}`);
    return { providerMessageId: `console_${Date.now()}`, provider: this.name };
  }
}

/** Strip a phone number to bare digits with country code (MSG91 wants 91XXXXXXXXXX). */
function msg91Mobile(to: string): string {
  const digits = to.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`; // bare Indian mobile
  return digits;
}

/**
 * MSG91 SMS via the v2 send API. We render the message ourselves and pass the
 * registered DLT template id so the message clears the operator's DLT scrubbing.
 */
class Msg91SmsProvider implements NotificationProvider {
  readonly name = "msg91-sms";
  constructor(
    private readonly authKey: string,
    private readonly senderId: string,
  ) {}
  supports(channel: NotificationChannel) {
    return channel === "SMS";
  }
  async send(input: SendInput): Promise<SendResult> {
    const res = await fetch("https://api.msg91.com/api/v2/sendsms", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: this.authKey },
      body: JSON.stringify({
        sender: this.senderId,
        route: "4", // transactional
        country: "91",
        sms: [
          {
            message: input.body,
            to: [msg91Mobile(input.to)],
            ...(input.dltTemplateId ? { DLT_TE_ID: input.dltTemplateId } : {}),
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`MSG91 SMS failed (${res.status}): ${await res.text()}`);
    const data = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (data.type && data.type !== "success") {
      throw new Error(`MSG91 SMS rejected: ${data.message ?? "unknown error"}`);
    }
    return { providerMessageId: data.message ?? `msg91_${Date.now()}`, provider: this.name };
  }
}

/**
 * MSG91 WhatsApp (Meta Cloud API behind MSG91). WhatsApp only allows pre-approved
 * templates outside the 24h window, so a whatsappTemplateName is required; the
 * rendered body rides as the single body-component parameter.
 */
class Msg91WhatsAppProvider implements NotificationProvider {
  readonly name = "msg91-whatsapp";
  constructor(
    private readonly authKey: string,
    private readonly from: string,
  ) {}
  supports(channel: NotificationChannel) {
    return channel === "WHATSAPP";
  }
  async send(input: SendInput): Promise<SendResult> {
    if (!input.whatsappTemplateName) {
      throw new Error("WhatsApp template name is required for outbound messages.");
    }
    const res = await fetch(
      "https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", authkey: this.authKey },
        body: JSON.stringify({
          integrated_number: this.from,
          content_type: "template",
          payload: {
            messaging_product: "whatsapp",
            to: msg91Mobile(input.to),
            type: "template",
            template: {
              name: input.whatsappTemplateName,
              language: { code: "en", policy: "deterministic" },
              components: [
                {
                  type: "body",
                  parameters: [{ type: "text", text: input.body }],
                },
              ],
            },
          },
        }),
      },
    );
    if (!res.ok) throw new Error(`MSG91 WhatsApp failed (${res.status}): ${await res.text()}`);
    const data = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[] };
    return {
      providerMessageId: data.messages?.[0]?.id ?? `wa_${Date.now()}`,
      provider: this.name,
    };
  }
}

/** Transactional email via Resend. */
class ResendProvider implements NotificationProvider {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  supports(channel: NotificationChannel) {
    return channel === "EMAIL";
  }
  async send(input: SendInput): Promise<SendResult> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject: input.subject || "Update on your booking",
        // Our bodies are plain text; wrap newlines so email clients keep line breaks.
        html: input.body.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll("\n", "<br/>"),
        text: input.body,
      }),
    });
    if (!res.ok) throw new Error(`Resend email failed (${res.status}): ${await res.text()}`);
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { providerMessageId: data.id ?? `resend_${Date.now()}`, provider: this.name };
  }
}

/** True when at least one real (non-console) provider is configured. Drives the
 * "messages are only logged" warning on the Integrations page. */
export function notificationsConfigured(): { sms: boolean; whatsapp: boolean; email: boolean } {
  const msg91 = !!process.env.MSG91_AUTH_KEY;
  return {
    sms: msg91 && !!process.env.MSG91_SENDER_ID,
    whatsapp: msg91 && !!process.env.MSG91_WHATSAPP_NUMBER,
    email: !!process.env.RESEND_API_KEY,
  };
}

/**
 * Returns the configured provider for a channel, or the console fallback. Real
 * adapters activate only when their env keys are present; otherwise messages are
 * logged so the app still runs end-to-end without provider accounts.
 */
export function providerFor(channel: NotificationChannel): NotificationProvider {
  if (channel === "EMAIL" && process.env.RESEND_API_KEY) {
    return new ResendProvider(
      process.env.RESEND_API_KEY,
      process.env.EMAIL_FROM || "bookings@example.in",
    );
  }
  if (channel === "SMS" && process.env.MSG91_AUTH_KEY && process.env.MSG91_SENDER_ID) {
    return new Msg91SmsProvider(process.env.MSG91_AUTH_KEY, process.env.MSG91_SENDER_ID);
  }
  if (channel === "WHATSAPP" && process.env.MSG91_AUTH_KEY && process.env.MSG91_WHATSAPP_NUMBER) {
    return new Msg91WhatsAppProvider(process.env.MSG91_AUTH_KEY, process.env.MSG91_WHATSAPP_NUMBER);
  }
  return new ConsoleProvider();
}
