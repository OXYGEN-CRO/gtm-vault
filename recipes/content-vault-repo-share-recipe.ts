import { defineRecipe } from "@oxygen/recipe-sdk";

type Lead = {
  linkedin_profile_id: string;
  first_name: string;
  pending_comment_id: string;
  post_id: string;
};

type RecipeInput = {
  account_id: string;
  repo_url: string;
  leads: Lead[];
};

type ChatsCreateResponse = {
  response?: {
    chat_id?: string;
    message_id?: string;
  };
};

type CommentCreateResponse = {
  response?: {
    object?: string;
    id?: string;
    comment_id?: string;
  };
};

const REPLY_VARIATIONS = [
  "Sent it over:)",
  "It’s in your inbox xD",
  "Just dropped it in your DMs",
  "Slid it into your inbox 😄",
];

const TABLE_SLUG = "content-vault-pending-linkedin-leads-2026-05-10";
const TERMINAL_STATUS = "workflow_done";

export default defineRecipe({
  id: "content-vault-repo-share-recipe",
  name: "Content vault repo share",
  tools: [
    "linkedin.chats_create",
    "linkedin.posts_comment_create",
    "oxygen.rows_upsert",
  ],
  trigger: { type: "api" },
  inputSchema: {
    type: "object",
    required: ["account_id", "repo_url", "leads"],
    properties: {
      account_id: { type: "string" },
      repo_url: { type: "string" },
      leads: {
        type: "array",
        items: {
          type: "object",
          required: [
            "linkedin_profile_id",
            "first_name",
            "pending_comment_id",
            "post_id",
          ],
          properties: {
            linkedin_profile_id: { type: "string" },
            first_name: { type: "string" },
            pending_comment_id: { type: "string" },
            post_id: { type: "string" },
          },
        },
      },
    },
  },
  async run(ctx) {
    const input = (ctx.input ?? {}) as RecipeInput;
    const leads = Array.isArray(input.leads) ? input.leads : [];
    if (!input.account_id || !input.repo_url || leads.length === 0) {
      ctx.log("warn", "content-vault-repo-share: missing required input", {
        has_account_id: Boolean(input.account_id),
        has_repo_url: Boolean(input.repo_url),
        lead_count: leads.length,
      });
      return { ok: false, reason: "missing_input" };
    }

    const startedAt = await ctx.now();
    ctx.log("info", "content-vault-repo-share started", {
      lead_count: leads.length,
      mode: ctx.mode,
    });

    const results: Array<Record<string, unknown>> = [];
    let sent = 0;
    let failed = 0;

    for (const lead of leads) {
      const dmText =
        "Heyo " + lead.first_name + ":)\n\n" +
        "Thanks for your patience! Here is the repo: \n\n" +
        input.repo_url + "\n\n" +
        "Curious to hear wether you are already using Claude Code in your GTM? " +
        "If yes, I'd love to learn how, because we are building a product in the space.";

      const replyToken = await ctx.uuid();
      const replyIndex = parseInt(replyToken.slice(0, 1), 16) % REPLY_VARIATIONS.length;
      const replyText = REPLY_VARIATIONS[replyIndex] ?? REPLY_VARIATIONS[0];

      try {
        const dmResult = await ctx.tools.run<ChatsCreateResponse>(
          "linkedin.chats_create",
          {
            account_id: input.account_id,
            attendees_ids: [lead.linkedin_profile_id],
            text: dmText,
          },
          { key: "dm:" + lead.linkedin_profile_id },
        );

        const commentResult = await ctx.tools.run<CommentCreateResponse>(
          "linkedin.posts_comment_create",
          {
            post_id: lead.post_id,
            account_id: input.account_id,
            text: replyText,
            comment_id: lead.pending_comment_id,
          },
          { key: "reply:" + lead.pending_comment_id },
        );

        const newReplyId =
          commentResult?.response?.id ??
          commentResult?.response?.comment_id ??
          null;

        await ctx.tools.run(
          "oxygen.rows_upsert",
          {
            table: TABLE_SLUG,
            key: "linkedin_profile_id",
            rows: [
              {
                linkedin_profile_id: lead.linkedin_profile_id,
                lead_magnet_status: TERMINAL_STATUS,
                tim_replied: true,
                tim_reply_ids: newReplyId ? [newReplyId] : [],
              },
            ],
            return: "summary",
          },
          { key: "row:" + lead.linkedin_profile_id },
        );

        sent += 1;
        results.push({
          linkedin_profile_id: lead.linkedin_profile_id,
          first_name: lead.first_name,
          ok: true,
          dm_chat_id: dmResult?.response?.chat_id ?? null,
          dm_message_id: dmResult?.response?.message_id ?? null,
          reply_id: newReplyId,
          reply_text: replyText,
        });
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "unknown_error";
        ctx.log("error", "content-vault-repo-share lead failed", {
          linkedin_profile_id: lead.linkedin_profile_id,
          first_name: lead.first_name,
          message,
        });
        results.push({
          linkedin_profile_id: lead.linkedin_profile_id,
          first_name: lead.first_name,
          ok: false,
          error: message,
        });
      }
    }

    return {
      ok: failed === 0,
      started_at: startedAt,
      lead_count: leads.length,
      sent,
      failed,
      results,
    };
  },
});
