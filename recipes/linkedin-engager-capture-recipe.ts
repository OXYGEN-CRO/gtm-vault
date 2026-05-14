import { defineRecipe } from "@oxygen/recipe-sdk";

const TIM_ACCOUNT_ID = "ZalGMSSTTCqmGGWfqv6qGA";
const TIM_PROFILE_ID = "ACoAADrpVucBKA0AJfvSCxrrJcLtEQF0AevEIrs";
const ENGAGERS_TABLE = "linkedin-engagers-master";
const LOG_TABLE = "linkedin-engagement-log";
const DEFAULT_MAX_POSTS = 20;
const POSTS_PAGE_LIMIT = 50;
const REACTIONS_PAGE_LIMIT = 100;
const COMMENTS_PAGE_LIMIT = 100;
const MAX_REACTION_PAGES_PER_POST = 30;
const MAX_COMMENT_PAGES_PER_POST = 30;
const UPSERT_BATCH_SIZE = 200;

type RecipeInput = {
  account_id?: string;
  profile_id?: string;
  max_posts?: number;
};

type Author = {
  id?: string;
  name?: string;
  headline?: string;
  profile_url?: string;
  network_distance?: string;
};

type ReactionItem = {
  value?: string;
  author?: Author;
};

type CommentItem = {
  id?: string;
  date?: string;
  text?: string;
  author?: string;
  author_details?: Author;
};

type PostItem = {
  social_id?: string;
  share_url?: string;
  parsed_datetime?: string;
  date?: string;
  is_repost?: boolean;
  reaction_counter?: number;
  comment_counter?: number;
};

type PageResponse<T> = {
  response?: {
    items?: T[];
    cursor?: string | null;
    paging?: { cursor?: string | null };
  };
};

type Engagement = {
  linkedin_profile_id: string;
  name: string;
  headline: string;
  profile_url: string;
  network_distance: string;
  post_id: string;
  engagement_type: "reaction" | "comment";
  reaction_type: string | null;
  engaged_at: string;
};

export default defineRecipe({
  id: "linkedin-engager-capture-recipe",
  name: "LinkedIn engager capture",
  tools: [
    "linkedin.users_posts",
    "linkedin.posts_reactions_list",
    "linkedin.posts_comments_list",
    "oxygen.rows_upsert",
    "oxygen.column_run_enqueue",
  ],
  trigger: { type: "cron", cron: "0 6 * * *", timezone: "UTC" },
  inputSchema: {
    type: "object",
    properties: {
      account_id: { type: "string" },
      profile_id: { type: "string" },
      max_posts: { type: "number" },
    },
  },
  async run(ctx) {
    const input = (ctx.input ?? {}) as RecipeInput;
    const accountId = input.account_id ?? TIM_ACCOUNT_ID;
    const profileId = input.profile_id ?? TIM_PROFILE_ID;
    const maxPosts =
      typeof input.max_posts === "number" && input.max_posts > 0
        ? Math.min(input.max_posts, 100)
        : DEFAULT_MAX_POSTS;

    const startedAt = await ctx.now();
    ctx.log("info", "engager-capture started", {
      account_id: accountId,
      profile_id: profileId,
      max_posts: maxPosts,
    });

    // 1. Fetch up to maxPosts of Tim's most recent posts (skip reposts of others' content)
    const posts: PostItem[] = [];
    let postsCursor: string | null = null;
    let postsPage = 0;
    while (posts.length < maxPosts) {
      postsPage += 1;
      const payload: Record<string, unknown> = {
        account_id: accountId,
        identifier: profileId,
        limit: POSTS_PAGE_LIMIT,
      };
      if (postsCursor) payload.cursor = postsCursor;
      const page = await ctx.tools.run<PageResponse<PostItem>>(
        "linkedin.users_posts",
        payload,
        { key: "posts:" + postsPage },
      );
      const items = page?.response?.items ?? [];
      for (const p of items) {
        if (p.is_repost) continue;
        if (!p.social_id) continue;
        posts.push(p);
        if (posts.length >= maxPosts) break;
      }
      const next = page?.response?.cursor ?? null;
      if (!next || items.length === 0) break;
      postsCursor = next;
    }

    ctx.log("info", "posts collected", {
      count: posts.length,
      first_post_id: posts[0]?.social_id ?? null,
      last_post_id: posts[posts.length - 1]?.social_id ?? null,
    });

    // 2. For each post, paginate reactions + comments
    const engagements: Engagement[] = [];
    for (let i = 0; i < posts.length; i += 1) {
      const post = posts[i];
      const postId = post?.social_id;
      if (!postId) continue;

      // reactions
      let reactCursor: string | null = null;
      for (let p = 0; p < MAX_REACTION_PAGES_PER_POST; p += 1) {
        const payload: Record<string, unknown> = {
          account_id: accountId,
          post_id: postId,
          limit: REACTIONS_PAGE_LIMIT,
        };
        if (reactCursor) payload.cursor = reactCursor;
        const page = await ctx.tools.run<PageResponse<ReactionItem>>(
          "linkedin.posts_reactions_list",
          payload,
          { key: "react:" + postId + ":" + (p + 1) },
        );
        const items = page?.response?.items ?? [];
        for (const r of items) {
          const a = r.author;
          if (!a?.id) continue;
          engagements.push({
            linkedin_profile_id: a.id,
            name: a.name ?? "",
            headline: a.headline ?? "",
            profile_url: a.profile_url ?? "",
            network_distance: a.network_distance ?? "",
            post_id: postId,
            engagement_type: "reaction",
            reaction_type: r.value ?? null,
            engaged_at: startedAt,
          });
        }
        const next = page?.response?.paging?.cursor ?? page?.response?.cursor ?? null;
        if (!next || items.length === 0) break;
        reactCursor = next;
      }

      // comments
      let commentCursor: string | null = null;
      for (let p = 0; p < MAX_COMMENT_PAGES_PER_POST; p += 1) {
        const payload: Record<string, unknown> = {
          account_id: accountId,
          post_id: postId,
          limit: COMMENTS_PAGE_LIMIT,
        };
        if (commentCursor) payload.cursor = commentCursor;
        const page = await ctx.tools.run<PageResponse<CommentItem>>(
          "linkedin.posts_comments_list",
          payload,
          { key: "comm:" + postId + ":" + (p + 1) },
        );
        const items = page?.response?.items ?? [];
        for (const c of items) {
          const a = c.author_details;
          if (!a?.id) continue;
          engagements.push({
            linkedin_profile_id: a.id,
            name: c.author ?? a.name ?? "",
            headline: a.headline ?? "",
            profile_url: a.profile_url ?? "",
            network_distance: a.network_distance ?? "",
            post_id: postId,
            engagement_type: "comment",
            reaction_type: null,
            engaged_at: c.date ?? startedAt,
          });
        }
        const next = page?.response?.cursor ?? null;
        if (!next || items.length === 0) break;
        commentCursor = next;
      }
    }

    ctx.log("info", "engagements collected", { count: engagements.length });

    // 3. Build engagement-log rows (compound dedupe key: profile + post + type + reaction)
    const logRows: Array<Record<string, unknown>> = engagements.map((e) => ({
      dedupe_key:
        e.linkedin_profile_id +
        "|" +
        e.post_id +
        "|" +
        e.engagement_type +
        (e.reaction_type ? "|" + e.reaction_type : ""),
      linkedin_profile_id: e.linkedin_profile_id,
      post_id: e.post_id,
      engagement_type: e.engagement_type,
      reaction_type: e.reaction_type,
      engaged_at: e.engaged_at,
      captured_at: startedAt,
    }));

    // 4. Aggregate to master rows (one per profile)
    const masterByProfile = new Map<string, Record<string, unknown>>();
    for (const e of engagements) {
      const existing = masterByProfile.get(e.linkedin_profile_id);
      const candidate = {
        linkedin_profile_id: e.linkedin_profile_id,
        linkedin_profile_url: e.profile_url || null,
        name: e.name || null,
        first_name: firstNameOf(e.name),
        headline: e.headline || null,
        network_distance: e.network_distance || null,
        first_engaged_at: e.engaged_at,
        last_engaged_at: e.engaged_at,
        last_engaged_post_id: e.post_id,
        last_engagement_type: e.reaction_type
          ? "reaction:" + e.reaction_type
          : e.engagement_type,
      };
      if (!existing) {
        masterByProfile.set(e.linkedin_profile_id, candidate);
        continue;
      }
      // Merge: keep earliest first_engaged_at, latest last_engaged_at
      if (
        typeof existing.first_engaged_at === "string" &&
        typeof candidate.first_engaged_at === "string" &&
        candidate.first_engaged_at < existing.first_engaged_at
      ) {
        existing.first_engaged_at = candidate.first_engaged_at;
      }
      if (
        typeof existing.last_engaged_at === "string" &&
        typeof candidate.last_engaged_at === "string" &&
        candidate.last_engaged_at > existing.last_engaged_at
      ) {
        existing.last_engaged_at = candidate.last_engaged_at;
        existing.last_engaged_post_id = candidate.last_engaged_post_id;
        existing.last_engagement_type = candidate.last_engagement_type;
      }
      if (!existing.headline && candidate.headline) existing.headline = candidate.headline;
      if (!existing.linkedin_profile_url && candidate.linkedin_profile_url) {
        existing.linkedin_profile_url = candidate.linkedin_profile_url;
      }
      if (!existing.name && candidate.name) {
        existing.name = candidate.name;
        existing.first_name = candidate.first_name;
      }
    }
    const masterRows = Array.from(masterByProfile.values());

    // 5. Batch-upsert log + master in chunks
    let logBatches = 0;
    for (let i = 0; i < logRows.length; i += UPSERT_BATCH_SIZE) {
      logBatches += 1;
      const slice = logRows.slice(i, i + UPSERT_BATCH_SIZE);
      await ctx.tools.run(
        "oxygen.rows_upsert",
        {
          table: LOG_TABLE,
          key: "dedupe_key",
          rows: slice,
          return: "summary",
        },
        { key: "log:upsert:" + logBatches },
      );
    }
    let masterBatches = 0;
    for (let i = 0; i < masterRows.length; i += UPSERT_BATCH_SIZE) {
      masterBatches += 1;
      const slice = masterRows.slice(i, i + UPSERT_BATCH_SIZE);
      await ctx.tools.run(
        "oxygen.rows_upsert",
        {
          table: ENGAGERS_TABLE,
          key: "linkedin_profile_id",
          rows: slice,
          return: "summary",
        },
        { key: "master:upsert:" + masterBatches },
      );
    }

    // 6. Enqueue the qualification AI column to run on freshly-captured rows.
    // The column definition (prompt + schema + Exa web search) lives on the
    // table — this recipe just tells the worker queue which rows to process.
    let qualificationEnqueue: Record<string, unknown> | null = null;
    if (masterRows.length > 0) {
      const enqueueResult = await ctx.tools.run<Record<string, unknown>>(
        "oxygen.column_run_enqueue",
        {
          table: ENGAGERS_TABLE,
          column: "qualification",
          selection: { mode: "all" },
          force: false,
          max_credits: 2000,
        },
        { key: "enqueue:qualification:" + startedAt },
      );
      qualificationEnqueue = enqueueResult ?? null;
    }

    return {
      ok: true,
      started_at: startedAt,
      posts_processed: posts.length,
      engagements_seen: engagements.length,
      master_unique_profiles: masterRows.length,
      log_batches: logBatches,
      master_batches: masterBatches,
      qualification_enqueue: qualificationEnqueue,
    };
  },
});

function firstNameOf(fullName: string): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  return parts[0] ?? null;
}
