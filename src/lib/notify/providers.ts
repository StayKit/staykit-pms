/**
 * Notification provider interface. v1 ships MSG91 (SMS + WhatsApp) and Resend
 * (email) adapters behind one interface. When no credentials are configured the
 * ConsoleProvider logs instead of sending, so the app runs end-to-end in dev.
 *
 * DLT note: MSG91 expects DLT-approved content; we store {{var}} in our editor and
 * convert to MSG91's ##variable## at send-time. WhatsApp requires Meta-approved
 * template names. See docs/integrations/.
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

/**
 * Returns the configured provider for a channel, or the console fallback.
 * Real MSG91/Resend adapters would call their REST APIs here, guarded by env keys.
 */
export function providerFor(_channel: NotificationChannel): NotificationProvider {
  // TODO: instantiate Msg91Provider / ResendProvider when env keys are present.
  return new ConsoleProvider();
}
