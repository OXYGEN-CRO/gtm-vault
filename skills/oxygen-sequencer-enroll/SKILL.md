---
name: oxygen-sequencer-enroll
description: Enroll a verified, personalised leads table into Oxygen's native cold-email sequencer and launch the campaign. No Instantly, no second sending seat. Use when the list is sourced, verified, and personalised and Tim asks to enroll, sequence, or launch the campaign.
---

# oxygen-sequencer-enroll

Send the campaign. The list is sourced, verified, and personalised, this skill enrolls it into **Oxygen's native sequencer** running on your warmed ZapMail mailboxes. This is the step that used to live in Instantly; it's now native, so there's no extra tool or seat.

## Pre-flight (don't skip)

- Mailboxes exist and are **warmed** (`oxygen mailboxes warmup-status`). Never enroll onto cold-from-zero inboxes.
- The leads table has: a **verified** email per row (MillionVerifier + BounceBan passed) and the **`personalization`** column populated ([`personalize-ai-column`](../personalize-ai-column)).
- You have body copy. For the template + variants, drive [`outbound-copywriter`](../outbound-copywriter); keep the static body short and let `{{personalization}}` carry the specificity.

## Workflow

1. **Create the sequence.**

   ```bash
   oxygen sequences create --name "saas-founders-5-50-us" --from-mailboxes warmed
   ```

   (MCP: `oxygen_sequences_create`.) Attach the warmed ZapMail mailbox pool so sends spread across them at the 20-25/inbox/day ceiling.

2. **Add the steps.** A short first touch + 1-2 follow-ups. Each step references the lead's variables:

   - Subject + body use `{{first_name}}`, `{{company}}`, and the AI `{{personalization}}` line.
   - Keep the gap realistic (e.g. day 0, day 3, day 6).

   (`oxygen sequences update` / `oxygen_sequences_update`.)

3. **Enroll the table.**

   ```bash
   oxygen sequences enroll --sequence "saas-founders-5-50-us" --table "saas-founders-5-50-us" --only-verified
   ```

   (MCP: `oxygen_sequences_enroll`.) Enroll **only verified** rows. Report how many enrolled vs skipped.

4. **Review the end state before it goes live.** Pull a few rendered previews (real lead, real variables) and show Tim. This is the human gate, the agent builds it, Tim approves the final state.

5. **Launch.**

   ```bash
   oxygen sequences start --sequence "saas-founders-5-50-us"
   ```

   (MCP: `oxygen_sequences_start`.) Respect the daily cap; the sequencer paces across mailboxes automatically.

6. **Close the loop.** Replies flow back through Oxygen. Wire [`cold-reply-to-crm-recipe`](../../recipes/cold-reply-to-crm-recipe.ts) so every reply lands in the CRM and informs the next batch.

## Report back

- sequence name, steps, and mailbox pool
- rows enrolled vs skipped (and why skipped)
- the rendered previews you showed for approval
- confirmation it's live + the daily send ceiling
- reminder that the reply -> CRM workflow is (or needs) wiring
