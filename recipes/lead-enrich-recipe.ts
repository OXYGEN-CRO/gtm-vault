import { defineRecipe } from "@oxygen/recipe-sdk";

type LeadInput = {
  email?: string;
  first_name?: string;
  last_name?: string;
  source?: string;
};

type HubspotResult = {
  ok?: boolean;
  contact?: { id?: string; email?: string };
};

export default defineRecipe({
  id: "lead-enrich-recipe",
  name: "Lead enrichment (recipe)",
  tools: ["hubspot.contacts_create"],
  trigger: {
    type: "webhook",
    trigger_id: "lead-form",
    secret_required: false,
    idempotency_key_path: "email",
  },
  inputSchema: {
    type: "object",
    properties: {
      email: { type: "string" },
      first_name: { type: "string" },
      last_name: { type: "string" },
      source: { type: "string" },
    },
    required: ["email"],
  },
  async run(ctx) {
    const lead = (ctx.input ?? {}) as LeadInput;
    if (!lead.email || typeof lead.email !== "string") {
      ctx.log("warn", "lead missing email — skipping", { lead });
      return { ok: false, reason: "missing_email" };
    }

    const upserted = await ctx.tools.run<HubspotResult>("hubspot.contacts_create", {
      email: lead.email.toLowerCase(),
      properties: {
        firstname: lead.first_name ?? null,
        lastname: lead.last_name ?? null,
      },
    }, { key: `hubspot-contact:${lead.email.toLowerCase()}` });

    return {
      ok: true,
      email: lead.email.toLowerCase(),
      hubspot_id: upserted?.contact?.id ?? null,
    };
  },
});
