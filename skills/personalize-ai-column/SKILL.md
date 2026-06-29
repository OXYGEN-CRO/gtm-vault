---
name: personalize-ai-column
description: Configure an Oxygen AI column that writes one personalised cold-email line (or full message) per lead, grounded in a swipe file of proven copy and run on your own OpenRouter key (BYOK) for cents. Use after the lead list is sourced and verified, when Tim asks to personalise, add AI variables, or write the icebreaker per lead.
---

# personalize-ai-column

Give every lead one unique, true line. This skill configures an **Oxygen AI column** on your leads table that generates the personalisation per row, so 40k leads cost about $30, not a fortune.

Two things make it cheap and good:
- **BYOK via OpenRouter.** You pay the raw token price of a cheap model, not a per-enrichment markup.
- **A swipe file of proven copy** as the style reference, so the output reads like Tim's winning campaigns, not generic AI.

## The swipe file

The reference copy lives in [`../outbound-copywriter/corpus.md`](../outbound-copywriter/corpus.md), verbatim from Tim's currently-running, replying campaigns. The AI column's prompt points at those patterns. (Keep it fresh via `outbound-copywriter/refresh.md`.) For full new copy, drive [`outbound-copywriter`](../outbound-copywriter); this skill is specifically the per-row AI column that fills the personalisation variable.

## What the column produces

Default: a short **icebreaker** line that references one true, specific insight about the lead (their ICP, a hiring signal, their funding/batch, a recent post) in Tim's voice. It becomes the `{{personalization}}` variable the sequencer drops into the template. Keep the templated body short; the AI column carries the specificity.

## Configure it

1. **Pre-reqs.** The leads table exists (from [`boomerang-lead-sourcing`](../boomerang-lead-sourcing)), emails are enriched + verified, and there's at least one column with raw context to personalise from (title, company, ICP, signal). If context is thin, add an enrichment/research column first.

2. **Set your BYOK key.** Add your OpenRouter key so the column bills to you at cost. Pick a cheap, capable model. Good picks: `deepseek/deepseek-chat`, `google/gemini-2.0-flash`, or similar. (Confirm the house default with Tim.)

3. **Add the AI column.**

   ```bash
   oxygen columns add \
     --table "saas-founders-5-50-us" \
     --name personalization \
     --type ai \
     --model "openrouter/deepseek/deepseek-chat" \
     --prompt-file /tmp/personalization-prompt.md
   ```

   (MCP equivalent: `oxygen_columns_add` with `type: "ai"`.)

4. **Write the prompt** (`/tmp/personalization-prompt.md`). It must:
   - Take the row's context columns as input (reference them as `{{column_name}}`).
   - Follow the swipe patterns in `outbound-copywriter/corpus.md`: casual, specific, one insight, no fluff, the slop blacklist applies (no em dashes, no "I came across your profile", no "I hope this finds you well").
   - Output **one line only**, the icebreaker. No greeting, no signature, no pitch (the template handles those).
   - Be honest: only claim what's in the data. If context is thin, output a safe generic-but-clean line rather than a hallucinated specific.

5. **Preview on a sample, then run.**

   ```bash
   oxygen columns run --table "saas-founders-5-50-us" --column personalization --limit 10   # preview
   oxygen columns run --table "saas-founders-5-50-us" --column personalization --max-credits 5000
   ```

   (MCP: `oxygen_columns_run` / `oxygen_enrich_column_preview`.) Eyeball the 10 before the full run, that's your quality gate.

6. **Cost check.** At ~$0.0008 / row on a cheap BYOK model, report the projected cost before the full run (rows x ~$0.0008).

## Report back

- the column name + model used
- 3-5 sample outputs so Tim can sanity-check voice
- rows processed and total token cost
- next step: enroll with [`oxygen-sequencer-enroll`](../oxygen-sequencer-enroll)
