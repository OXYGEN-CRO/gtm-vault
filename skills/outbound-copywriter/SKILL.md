---
name: outbound-copywriter
description: Draft outbound campaign copy in Tim Scheuer's voice. Covers Instantly cold emails (subject + body) and HeyReach LinkedIn DMs (connection note + message). Grounded in Tim's live sent campaigns (corpus.md), runs every draft through the slop blacklist, and slots Oxygen offers (vault repo, YC discount, SF credits, coffee meet) into the existing patterns. Use when asked to "write a cold email", "draft a linkedin DM", "outbound copy for X", "new campaign variant", or "/outbound-copywriter".
---

# outbound-copywriter

Generate cold-outbound copy that sounds like Tim, not like Apollo Mail Merge or ChatGPT.

Voice is grounded in **Tim's currently-running campaigns** (see `corpus.md`). Email patterns come from Instantly (SF SaaS 5-50, YC Founders 2025-2026); LinkedIn patterns come from HeyReach (YC Founders, GTM Engineers SF, GTM Agencies). The corpus is the source of truth; SKILL.md is the routing + rules layer.

---

## When to invoke

Triggers: "write a cold email", "draft a linkedin DM / connection note", "outbound copy for X", "another variant for [campaign]", "new sequence step", "/outbound-copywriter".

Do **not** use for:
- LinkedIn **posts** (use `/linkedin-copywriter`)
- X tweets / threads (use `/x-copywriter`)
- Proposal copy (use `/proposal-creator`)
- Newsletter / long-form (use `/long-form`)
- Replies inside an existing thread (write them naturally; this skill is for the first-touch and follow-ups inside a campaign)

---

## Workflow

### 1. One-shot brief

Ask in a single batched message, parse what's there, only re-ask for missing bits:

```
Quick brief.

1. Channel: email (Instantly) or LinkedIn (HeyReach connection note / DM / follow-up)?
2. Audience anchor: YC batch / SF location / industry vertical / hiring signal / event attendee / something else?
3. The offer: vault repo, YC 44% discount, $10 SF credits, coffee meet, webinar, demo, custom thing?
4. CTA shape: 👍🏻 reply, sign-up link, calendar booking, conversation opener?
5. How many variants? (default: 2 for Instantly A/B, 1 for LinkedIn)
6. Custom variables available in the platform (so the placeholders match): firstName/cleaned_company_name/icp/batch_short/...?
```

### 2. Pick a hook from the corpus matrix

Lock the opener to a pattern Tim has actually shipped. Don't invent new ones.

**Email subject patterns (Instantly):**

| # | Pattern | Live example | Use when |
|---|---------|--------------|----------|
| ES1 | Short brand anchor | `Claude GTM Repo` | Repo offer, evergreen |
| ES2 | Specific number + offer | `$10 in GTM Data Credits` | Anything with a $ / % hook |
| ES3 | Audience-qualifier question | `YC Startup using CC for GTM?` | Vertical/segment-targeted blast |

Rules for subject lines:
- 3-6 words max
- Title Case allowed (it's a subject, not body)
- Numbers beat adjectives (`$10`, `+90`, `44%`)
- Question marks are fine if the question is specific to the segment
- Never: ALL CAPS, emoji in subject, "Quick question", "Following up", names alone, generic intros

**Email body openers (line 1):**

| # | Pattern | Live example | When |
|---|---------|--------------|------|
| EO1 | "Heyo {{firstName}}:)" | All current variants | Default, always |
| EO2 | "Hey {{firstName}}:)" | LinkedIn DM cousin | Shorter / DM-style email |

**Email body context anchor (line 2-3):**

| # | Pattern | Live example | When |
|---|---------|--------------|------|
| EC1 | Just-checked-out + ICP assume | `Just checked out {{cleaned_company_name}} and I assume you target {{icp}}.` | SF / vertical play, when you have company-name var |
| EC2 | Batch + ICP confirm | `I've seen you've been in the YC {{batch_short}} batch and is it right that you are targeting {{icp}}?` | YC / cohort / accelerator play |
| EC3 | Hiring / event signal | (not yet shipped, propose only when signal exists) | When you have a specific behavior (hiring, attending, posting) |

Note the soft-confirm shape: **assume + verify** (EC1) or **observed + verify** (EC2). Tim does not lead with "I see you're the head of..." or generic title flattery.

**LinkedIn first-touch (connection note OR first DM):**

| # | Pattern | Live example | When |
|---|---------|--------------|------|
| LO1 | "Heyo {FIRST_NAME}:) I've seen you are in the [space] too and..." | `Heyo {FIRST_NAME}:) I've seen you are in the GTM Engineering space too and I'm actually coming to sf in june.` | Peer / community angle |
| LO2 | "Hey {FIRST_NAME}:) I've seen you were in the YC {Batch}..." | `Hey {FIRST_NAME}:) I've seen you were in the YC {Batch} and I assume you are currently targeting {ICP}.` | Cohort / accelerator |

LinkedIn vs email differences (apply when channel = LinkedIn):
- Placeholders use **single braces** with capitalized labels: `{FIRST_NAME}`, `{Batch}`, `{ICP}` (NOT `{{firstName}}`)
- ~50% shorter than the email equivalent — total 3-5 sentences
- No subject line
- Connection notes capped at 300 chars in HeyReach (don't include the offer there, just the hook)
- Direct link in body is fine: `https://github.com/OXYGEN-CRO/gtm-vault`
- "I'm coming to sf in june" / location-and-time framing is a Tim move for coffee asks

### 3. Build the body

Tim's body shape across email + LinkedIn (every shipped variant):

```
[opener: "Heyo {{firstName}}:)" or "Hey {FIRST_NAME}:)"]

[context anchor: 1-2 sentences. Reference SOMETHING specific (company,
 batch, location, hiring signal, post). Soft-confirm an assumption
 about who they sell to.]

[soft pivot or qualifier question: 1 sentence. "Are you currently
 using Claude Code in your GTM?" or "We know quite a few sf-based
 startups that are using Claude Code in their GTM and I was wondering
 if you also already use it?"]

[offer: 1-2 sentences. State what we have (vault repo / 44% YC
 discount / $10 SF credits / coffee). Drop one concrete proof number
 ("+90 GTM integrations and skills"). Mention Claude Code / Codex
 compatibility when the audience is technical.]

[CTA: 1 sentence. One of:
  - "If you want it, just send me a '👍🏻' and I'll send it over."
  - "Just reply with a '👍🏻' and I'll send over the sign up link."
  - "Let me know if I should send you over the link to the free tier
     with the discount code."
  - "I'd love to grab some coffee and chat about GTM and CC if you
     are down for it?"
]
```

Total length: **5-8 short lines** for email; **3-5 lines** for LinkedIn DM.

### 4. Slot the right offer

Map the segment to an offer Tim already runs:

| Segment | Default offer | Source variant |
|---------|---------------|----------------|
| YC batch (current or prior) | **44% off Oxygen** or **free vault repo** | YC Founders 2025-2026 (Instantly) |
| SF-based startup, no YC tag | **$10 GTM Data credits** or **vault repo** | SF SaaS 5-50 (Instantly) |
| GTM Engineer / IC peer | **vault repo** (direct link) | GTM Engineers SF (HeyReach) |
| GTM Agency owner | **connection-only**, no pitch first | GTM Agencies (HeyReach) |
| Local SF, peer angle | **coffee meet in june** | GTM Engineers SF / GTM Agencies (HeyReach) |
| Generic warm signal (event, hiring) | **vault repo + question** | propose; not yet shipped |

If the offer doesn't exist in Tim's stack, **say so** and propose one before drafting — don't invent fake discounts or credits.

### 5. Brand vocabulary (use these tokens, do not paraphrase)

Use the live brand language. Substituting synonyms breaks recognition.

**Always:**
- `Oxygen` (the product) · `GTM CLI/MCP` (the category) · `Claude Code` and `Codex` (compatible runtimes; abbreviated `CC` in casual LinkedIn DMs)
- `+90 GTM integrations` / `+90 prebuilt GTM integrations and skills` (the concrete proof number; do NOT round, do NOT vary the `+` glyph)
- `vault` (when offering the open repo: `https://github.com/OXYGEN-CRO/gtm-vault`)
- `GTM motion`, `outbound`, `prospecting` (audience verbs)
- `sf` lowercase when used in copy ("sf-based startups", "coming to sf in june"). Subject lines and proper sentence starts may capitalize.
- `GTM` always uppercase
- `👍🏻` (light-skin-tone thumbs up) as the reply trigger glyph. Do NOT swap for `👍`, `🙏`, or `+1`.

**Offer phrasings (verbatim, drop into copy):**
- "send you over our repo with +90 prebuilt GTM integrations and skills"
- "we actually offer YC Startups a 44% discount for our GTM CLI/MCP"
- "we actually give sf based startups $10 dollar worth of GTM Data credits"
- "the link to the free tier with the discount code"
- "I'd love to grab some coffee and chat about GTM and CC"

### 6. Slop blacklist (block before output)

If any of these survive in the draft, rewrite until none do.

**Phrases:**
- "I hope this finds you well" / "I hope you're doing well"
- "I wanted to reach out" / "I'm reaching out because"
- "Quick question" / "Quick one for you"
- "Circling back" / "Touching base" / "Bumping this"
- "Following up" (write the actual reason instead)
- "I noticed that you..." / "I came across your profile"
- "I'd love to learn more about..."
- "Hope to hear from you" / "Look forward to hearing"
- "Just checking in"
- "Let's hop on a quick call" (Tim never says "hop on")
- "Cheers,", "Best regards,", "Warm regards," (no formal sign-off; Tim signs none in cold)
- "synergy", "leverage", "robust", "world-class", "seamless", "intuitive", "powerful", "innovative", "cutting-edge"

**Punctuation:**
- **No em dashes (`—`)**. Replace with `.`, `,`, `:`, parens, or `·`. Project-wide rule (see CLAUDE.md).
- No double-space after period.
- No `Hey there,` / `Hi there,` — always personalize the first token.

**AI tells (rewrite if any appear):**
- "Imagine if..." opener
- Three-item lists separated by `,` and `and` ("X, Y, and Z") in the offer — Tim uses prose or hyphen-bullets
- Any sentence that could appear in a ChatGPT response to "write me a cold email"
- Em-dash + dependent clause ("— a game changer for outbound")
- Subject line longer than 7 words

### 7. Variants

When asked for multiple variants for the same campaign:

- Each variant changes EITHER the **subject** OR the **offer**, not both at once
- Body skeleton stays identical so A/B test isolates the change
- Don't reshuffle the body shape; keep the same opener → context → pivot → offer → CTA
- 2 variants is the default for Instantly steps (matches live SF SaaS + YC pattern)
- 1 variant per step for LinkedIn (HeyReach UX makes A/B per-step painful)

### 8. Output format

Return:
```
=== Campaign: [name] ===
Channel: email | linkedin

--- Variant 1 ---
Subject: [if email]
Body:
[draft]

--- Variant 2 (if requested) ---
Subject:
Body:
[draft]
```

Then a one-line note explaining what changed between variants if you produced more than one.

---

## Refreshing the corpus

When Tim says "the campaigns have changed" or "pull the latest copies" or "refresh the corpus", run the refresh procedure in `refresh.md`. The corpus is the ground truth for voice; outdated corpus → drifting voice.

Quarterly default, or any time Tim pauses an old campaign and launches a new one.

---

## Memory pointers

- Tim's GTM stack and channel strategy: [[project-gtm-stack]]
- Brand entity rules (Oxygen, single brand): [[user-oxygen]]
- No em dashes: [[feedback-no-em-dashes]]
- Sister skills that share voice DNA but different surface: [[reference-linkedin-copywriter]], [[reference-x-copywriter]]
- Instantly API gotchas (UA + plan cap): [[reference-instantly-api]]
