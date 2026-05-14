# oxygen-gtm-vault

The outbound playbook we run at Oxygen. Open-sourced.

Most "skills repos" are just markdown. Instructions for skills your agent doesn't actually have. You still have to wire Postgres, integrate 12 GTM tools, build a UI, and figure out where the runtime lives. We already did that part.

```bash
npm install -g https://oxygen-agent.com/downloads/oxygen-cli-latest.tgz
```

One command. After that you have:

- A CLI Claude Code and Codex can drive (`oxygen tables`, `oxygen tools`, `oxygen workflows`, `oxygen skills`).
- 120+ GTM tools pre-wired (LinkedIn, Apollo, Clay-style enrichment, HubSpot, Smartlead, Instantly, Heyreach, Findymail, more).
- A Postgres-backed tables layer with a Clay-like column model. AI columns, enrichment columns, joins. Built in.
- A web UI for tables, runs, logs, workflows, approvals at [oxygen-agent.com](https://oxygen-agent.com).
- A free tier that's actually useful for solo founders, not a 14-day teaser.

Same stack we use to run our own outbound.

## Want the content stack too?

The 10 content skills from [content-vault](https://github.com/timscheuerai/content-vault) (linkedin-copywriter, x-copywriter, youtube-script, long-form, lead-magnet-creator, repurpose, researcher, graphics-designer, launch-video, video-use) install alongside the GTM vault. Run them in the same Claude Code workspace.

```bash
git clone https://github.com/timscheuerai/content-vault.git \
  ~/.claude/skills/content-vault
```

After that, every `/linkedin-copywriter`, `/repurpose`, `/researcher` call writes its outputs to the same Notion Content DB and Oxygen workspace as your outbound runs. Inbound and outbound, one install.

Full content-vault docs: [github.com/timscheuerai/content-vault](https://github.com/timscheuerai/content-vault).

## Two ways to run this

**Cloud.** Sign up at [oxygen-agent.com](https://oxygen-agent.com). The UI is the dashboard. Skills, integrations, Postgres, observability already wired. `oxygen login` connects the CLI to your workspace.

**Local-first via Claude Code or Codex.** Install the CLI globally, sign in once, then call it from any agent loop. Tables and tool runs persist server-side so a Codex run on Monday and a Claude Code run on Friday share state.

```bash
npm install -g https://oxygen-agent.com/downloads/oxygen-cli-latest.tgz
oxygen login
oxygen whoami --json
```

## The 60-second sanity check

A quickstart that exercises every primitive without spending provider credits.

```bash
oxygen session start \
  --steps '["Check identity","Inspect tool catalog","Create demo table","Insert demo rows","Query demo rows"]' \
  --user-prompt "GTM Vault quickstart" --json

oxygen whoami --json

oxygen tools search email --json
oxygen tools get blitzapi.person_enrich --json

oxygen tables create "GTM Demo Leads" \
  --columns-json '[{"label":"Company Name"},{"label":"Domain"},{"label":"LinkedIn URL"}]' --json

oxygen tables insert gtm-demo-leads \
  --rows-json '[{"company_name":"Acme","domain":"acme.test"},{"company_name":"Globex","domain":"globex.test"}]' --json

oxygen tables query gtm-demo-leads --limit 5 --json
oxygen session usage --json
```

If anything fails, the failing command + a structured error code is enough to debug in one screenshot.

## What's actually inside

### The outbound primitives

Cover the things every B2B GTM team rebuilds badly in Clay + Make + n8n:

- **Lead sourcing.** `oxygen lead-sourcing` pulls accounts from Apollo, LinkedIn Sales Navigator, Crustdata, ProspectingAgent, or a CSV.
- **Waterfall enrichment.** `oxygen enrich-column` runs provider chains. Try Findymail → Hunter → Apollo for email, stop at the first hit, persist provenance per cell.
- **Signal capture.** Recipes for LinkedIn post engagers, hiring signals, funding rounds, tech-stack changes, intent. Each lands as rows in a typed table.
- **AI columns.** Bring your prompt, point at columns, get a typed cell back. Same model as Clay's "Use AI" column. Server-side, observable, retryable.
- **Activation.** Push qualified rows to Smartlead, Instantly, Heyreach, your CRM, or a webhook. Idempotency keys, retry policy, audit log.

Run any of these from the CLI, from the web UI, or from a Claude Code / Codex agent loop.

### Three real recipes (in `recipes/`)

These are not pseudocode. Same files Oxygen ships in `docs/examples/`.

- [`lead-enrich-recipe.ts`](./recipes/lead-enrich-recipe.ts). Webhook → HubSpot contact upsert with idempotency. The minimal shape every signal-driven enrichment workflow has.
- [`linkedin-engager-capture-recipe.ts`](./recipes/linkedin-engager-capture-recipe.ts). Pulls reactions + comments from your last 20 LinkedIn posts via Unipile, joins authors into a master engagers table, logs every touch. The engine behind "who reacted to my last 10 posts and is in my ICP".
- [`content-vault-repo-share-recipe.ts`](./recipes/content-vault-repo-share-recipe.ts). The recipe that DMs you this repo when you comment "GTM Vault" on the launch post. Yes, it's literally meta.

Drop any of these into your Oxygen workspace and they run as durable workflows with run history.

### The UI nobody else ships

Skills repos don't have a UI. They ship `.md` and call it a day.

You get a real one for free:

- Tables view with column-level enrichment, AI-column previews, run status per cell.
- Workflow runs with span-level traces. Click a row, see every tool call, every cost, every retry.
- Approvals queue for human-in-the-loop steps (e.g., "review this DM before send").
- Cost breakdown per provider, per workspace, per period.

Live at [oxygen-agent.com](https://oxygen-agent.com) the second you sign up.

## The content side (paired install)

Already covered at the top: clone [content-vault](https://github.com/timscheuerai/content-vault) alongside, and `/researcher`, `/repurpose`, `/lead-magnet-creator` write to the same Notion Content DB schema this repo expects. One workspace covers inbound and outbound.

## What this is not

Honest list. Save you the install if it's wrong for you.

- **Not a Clay replacement for non-technical operators.** The CLI assumes you're comfortable in a terminal or driving it through Claude Code / Codex. The UI is operator-grade, not ops-grade.
- **Not free at scale.** Free tier covers the demo, the quickstart, a few hundred enrichments. Past that you pay for what providers charge plus a small Oxygen margin. No SaaS seat tax.
- **Not magic.** Provider data is still provider data. We make routing, caching, and retries less awful. We don't fabricate emails.

## Free tier honest pricing

| What | Included | Past that |
|---|---|---|
| Workspaces | 1 | $0 per extra |
| Seats | 1 | $19 / seat / mo |
| Provider runs | 200 / month | pass-through cost + 10% |
| Tables, columns, AI columns | Unlimited | Unlimited |
| UI, observability, runs history | Full | Full |

Full pricing: [oxygen-agent.com/pricing](https://oxygen-agent.com/pricing).

## Common questions

**Do I have to use Claude Code?** No. The CLI is a normal Node binary. Use it from a terminal, a Codex session, a GitHub Action, a cron job. Claude Code is the most pleasant driver, not the only one.

**Where do the tables actually live?** Postgres in your Oxygen workspace. Inspect them via the UI, export to CSV from `oxygen tables export`, or query them in your own warehouse via a connector.

**How is this different from `content-vault`?** That repo is 10 markdown skill packages for content. This repo is the GTM runtime: integrations, tables, UI, observability. Different layer. Install both, they cooperate.

**Can I run it offline?** No. Oxygen is hosted because the tables, runs, and cost ledger have to be durable across sessions and machines. The CLI is local; the state isn't.

**Why is this open source?** The skills, recipes, schemas, and prompts are. The runtime (provider routing, billing, observability) is the product. Generosity on the playbook, charge for the infrastructure.

## Next Steps

**Install the CLI and ship your first table in 10 minutes.**

```bash
npm install -g https://oxygen-agent.com/downloads/oxygen-cli-latest.tgz
oxygen login
```

[oxygen-agent.com](https://oxygen-agent.com)

**Stuck? Hit me up.**

`tim@oxygen-agent.com` · [cal.com/tim-scheuer-mxbib9/45](https://cal.com/tim-scheuer-mxbib9/45)

Built by [Tim Scheuer](https://www.linkedin.com/in/tim-scheuer-7a8aa1264/) and [Philip Hirte](https://www.linkedin.com/in/philip-hirte/) at Oxygen. MIT. Fork it, ship it, send us what you build :)
