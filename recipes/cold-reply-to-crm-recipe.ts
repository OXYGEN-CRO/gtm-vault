import { defineRecipe } from "@oxygen/recipe-sdk";

// Cold-reply -> CRM.
//
// When a lead replies to a cold-email sequence, Oxygen's inbox fires this
// webhook. The recipe upserts the contact into the CRM (HubSpot) and logs the
// reply into an Oxygen table so the next batch knows which sequence + angle
// actually earned a reply. That feedback loop is the whole point: the data
// flywheel is yours.
//
// Pair it with oxygen-sequencer-enroll (which launches the campaign) so every
// reply closes the loop automatically.

const REPLY_LOG_TABLE = "cold-reply-log";

type ReplyInput = {
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  sequence?: string;
  campaign?: string;
  reply_text?: string;
  replied_at?: string;
  // Optional sentiment if the inbox classifier already labelled it.
  sentiment?: "positive" | "neutral" | "negative" | string;
};

type HubspotResult = {
  ok?: boolean;
  contact?: { id?: string; email?: string };
};

export default defineRecipe({
  id: "cold-reply-to-crm-recipe",
  name: "Cold reply -> CRM",
  tools: ["hubspot.contacts_create", "oxygen.rows_upsert"],
  trigger: {
    type: "webhook",
    trigger_id: "cold-reply",
    secret_required: true,
    idempotency_key_path: "email",
  },
  inputSchema: {
    type: "object",
    properties: {
      email: { type: "string" },
      first_name: { type: "string" },
      last_name: { type: "string" },
      company: { type: "string" },
      sequence: { type: "string" },
      campaign: { type: "string" },
      reply_text: { type: "string" },
      replied_at: { type: "string" },
      sentiment: { type: "string" },
    },
    required: ["email"],
  },
  async run(ctx) {
    const reply = (ctx.input ?? {}) as ReplyInput;
    if (!reply.email || typeof reply.email !== "string") {
      ctx.log("warn", "reply missing email — skipping", { reply });
      return { ok: false, reason: "missing_email" };
    }

    const email = reply.email.toLowerCase();
    const repliedAt = reply.replied_at ?? (await ctx.now());

    ctx.log("info", "cold reply received", {
      email,
      sequence: reply.sequence ?? null,
      sentiment: reply.sentiment ?? null,
    });

    // 1. Upsert the contact into the CRM and stamp the reply.
    const upserted = await ctx.tools.run<HubspotResult>(
      "hubspot.contacts_create",
      {
        email,
        properties: {
          firstname: reply.first_name ?? null,
          lastname: reply.last_name ?? null,
          company: reply.company ?? null,
          // Lifecycle bump: a reply means they're a live lead, not raw TAM.
          lifecyclestage: "lead",
          oxygen_last_reply_at: repliedAt,
          oxygen_last_sequence: reply.sequence ?? reply.campaign ?? null,
          oxygen_last_reply_sentiment: reply.sentiment ?? null,
        },
      },
      { key: `hubspot-contact:${email}` },
    );

    // 2. Log the reply into Oxygen so the next batch learns which sequence +
    //    angle converted. One row per reply (dedupe on email + timestamp).
    await ctx.tools.run(
      "oxygen.rows_upsert",
      {
        table: REPLY_LOG_TABLE,
        key: "dedupe_key",
        rows: [
          {
            dedupe_key: `${email}|${repliedAt}`,
            email,
            company: reply.company ?? null,
            sequence: reply.sequence ?? reply.campaign ?? null,
            sentiment: reply.sentiment ?? null,
            reply_text: reply.reply_text ?? null,
            replied_at: repliedAt,
            hubspot_id: upserted?.contact?.id ?? null,
          },
        ],
        return: "summary",
      },
      { key: `reply-log:${email}:${repliedAt}` },
    );

    return {
      ok: true,
      email,
      hubspot_id: upserted?.contact?.id ?? null,
      sequence: reply.sequence ?? reply.campaign ?? null,
      sentiment: reply.sentiment ?? null,
      logged_at: repliedAt,
    };
  },
});
