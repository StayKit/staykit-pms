/**
 * MCP prompts (§B.9) — reusable instructions an owner can invoke in Claude.ai. Each
 * returns a single user message; Claude then calls the read tools to fulfil it.
 */
export interface PromptArg {
  name: string;
  description: string;
  required: boolean;
}
export interface PromptDescriptor {
  name: string;
  description: string;
  arguments: PromptArg[];
}

export const PROMPTS: PromptDescriptor[] = [
  {
    name: "daily_briefing",
    description: "Summarise today's check-ins, check-outs, pending payments and issues.",
    arguments: [],
  },
  {
    name: "revenue_report",
    description: "Summarise revenue, occupancy, ADR and RevPAR for a date range.",
    arguments: [
      { name: "from", description: "Start date YYYY-MM-DD", required: true },
      { name: "to", description: "End date YYYY-MM-DD", required: true },
    ],
  },
  {
    name: "guest_outreach_draft",
    description: "Draft a guest message for an audience, theme and channel.",
    arguments: [
      { name: "audience", description: "e.g. guests who stayed in March", required: true },
      { name: "theme", description: "e.g. monsoon offer", required: true },
      { name: "channel", description: "sms | email | whatsapp", required: false },
    ],
  },
];

function userText(text: string) {
  return { messages: [{ role: "user", content: { type: "text", text } }] };
}

export function getPrompt(name: string, args: Record<string, unknown> = {}) {
  switch (name) {
    case "daily_briefing":
      return userText(
        "Using the StayKit tools, give me today's briefing across all my properties: " +
          "today's arrivals and departures (list_bookings), who still owes money (the amountPaid vs " +
          "totalAmount on each booking), foreign-national guests who still need FRRO Form C filed " +
          "(list_form_c_pending), and the headline occupancy (get_kpis). Flag anything that needs action.",
      );
    case "revenue_report": {
      const from = String(args.from ?? "");
      const to = String(args.to ?? "");
      return userText(
        `Produce a revenue report from ${from} to ${to}. Call get_kpis for occupancy, ADR and ` +
          `RevPAR, and source_mix for the breakdown by booking channel. Present it as a short table.`,
      );
    }
    case "guest_outreach_draft": {
      const audience = String(args.audience ?? "past guests");
      const theme = String(args.theme ?? "a seasonal offer");
      const channel = String(args.channel ?? "whatsapp");
      return userText(
        `Draft a friendly ${channel} message for ${audience} about ${theme}. Keep it short, in ` +
          `Indian English, with a clear call to action. Use search_guests (its stayedFrom/stayedTo and ` +
          `marketingConsent filters) to find who qualifies, and only include guests who have opted in to ` +
          `marketing. Do not send anything — just draft it for my approval.`,
      );
    }
    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}
