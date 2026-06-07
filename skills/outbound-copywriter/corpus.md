# Outbound corpus — Tim's live sent campaigns

Source of truth for `/outbound-copywriter` voice. Verbatim copy from Tim's currently-running campaigns. Refresh via `refresh.md` quarterly or whenever Tim launches a new campaign.

Last refreshed: **2026-05-18** (pulled live from Instantly + HeyReach APIs + Tim).

---

## Instantly (cold email)

### Campaign: `SF SaaS 5-50` (status: running)

Audience: SF-based software development startups, 5-50 FTE. ICP-targeted at founders/CEO/CMO/CRO. Custom variables: `firstName`, `cleaned_company_name`, `icp`.

**Variant 1 · subject: `Claude GTM Repo`**

```
Heyo {{firstName}}:) 

Just checked out {{cleaned_company_name}} and I assume you target {{icp}}. 

We know quite a few sf-based startups that are using Claude Code in their GTM and I was wondering if you also already using it? 

If yes I can actually send you over our repo with +90 prebuilt GTM integrations and skills. If you want it, just send me a '👍🏻' and I'll send it over.
```

**Variant 2 · subject: `$10 in GTM Data Credits`**

```
Heyo {{firstName}}:) 

Just checked out {{cleaned_company_name}} and I assume you target {{icp}}. 

Are you already using Claude Code in your GTM motion. We actually give sf based startups $10 dollar worth of GTM Data credits if they sign up to our GTM CLI/MCP (Oxygen) with +90 integrations and skills. 

Just reply with a '👍🏻' and I'll send over the sign up link.
```

---

### Campaign: `YC Founders 2025-2026` (status: running)

Audience: YC founders, current and recent batches. Custom variables: `firstName`, `batch_short`, `icp`.

**Variant 1 · subject: `YC Startup using CC for GTM?`**

```
Heyo {{firstName}}:) 

I've seen you've been in the YC {{batch_short}} batch and is it right that you are targeting {{icp}}?

We actually offer YC Startups a 44% discount for our GTM CLI/MCP which can be used with Claude Code or Codex. It has +90 GTM to CRM's, sequencers and data providers.

Let me know if I should send you over the link to the free tier with the discount code.
```

**Variant 2 · subject: `Claude GTM Repo`**

```
Heyo {{firstName}}:) 

I've seen you've been in the YC {{batch_short}} batch and is it right that you are targeting {{icp}}?

Are you currently using Claude Code in your GTM? 

If yes I can actually send you over our repo with +90 prebuilt GTM integrations and skills. If you want it, just send me a '👍🏻' and I'll send it over.
```

---

## HeyReach (LinkedIn DM)

LinkedIn placeholders use single braces with capitalized labels (`{FIRST_NAME}`, `{Batch}`, `{ICP}`). This is the HeyReach convention, do not switch to Instantly's `{{firstName}}` shape.

### Campaign: `YC Founders 2025-2026` (status: running)

```
Hey {FIRST_NAME}:) I've seen you were in the YC {Batch} and I assume you are currently targeting {ICP}. 

Are you currently using Claude Code in your GTM? If yes this repo might help: 

https://github.com/OXYGEN-CRO/gtm-vault
```

---

### Campaign: `GTM Engineers SF` / `GTM Engineers SF (LinkedIn Search)` (status: running)

Peer / community angle. Coffee meet ask, no pitch in the first touch.

```
Heyo {FIRST_NAME}:) I've seen you are in the GTM Engineering space too and I'm actually coming to sf in june. 

I'd love to grab some coffee and chat about GTM and CC if you are down for it?
```

---

### Campaign: `GTM Agencies (Connection only)` (status: running)

Connection-only — no pitch, no DM. The campaign is named for the strategy: send the connection request and stop. Body intentionally left blank in HeyReach.

---

## Pattern matrix (distilled)

### Openers

| Pattern | Email | LinkedIn |
|---------|-------|----------|
| Casual smiley + first name | `Heyo {{firstName}}:)` | `Heyo {FIRST_NAME}:)` |
| Shorter smiley | `Hey {{firstName}}:)` | `Hey {FIRST_NAME}:)` |

### Context anchors

| Pattern | Example |
|---------|---------|
| Just-checked-out + assume | `Just checked out {{cleaned_company_name}} and I assume you target {{icp}}.` |
| Batch + verify-Q | `I've seen you've been in the YC {{batch_short}} batch and is it right that you are targeting {{icp}}?` |
| Peer + relocation hook | `I've seen you are in the GTM Engineering space too and I'm actually coming to sf in june.` |

### Pivots

- `Are you currently using Claude Code in your GTM?`
- `Are you already using Claude Code in your GTM motion.` (period, not question — Tim uses both)
- `We know quite a few sf-based startups that are using Claude Code in their GTM and I was wondering if you also already use it?`

### Offers

- `our repo with +90 prebuilt GTM integrations and skills`
- `a 44% discount for our GTM CLI/MCP which can be used with Claude Code or Codex. It has +90 GTM to CRM's, sequencers and data providers`
- `$10 dollar worth of GTM Data credits if they sign up to our GTM CLI/MCP (Oxygen) with +90 integrations and skills`
- (LinkedIn direct link) `https://github.com/OXYGEN-CRO/gtm-vault`

### CTAs

- `If you want it, just send me a '👍🏻' and I'll send it over.`
- `Just reply with a '👍🏻' and I'll send over the sign up link.`
- `Let me know if I should send you over the link to the free tier with the discount code.`
- `I'd love to grab some coffee and chat about GTM and CC if you are down for it?`

### Brand tokens used (lock these)

- `Oxygen` (product · once per email max in casual outbound)
- `GTM CLI/MCP` (category description, paired with Oxygen)
- `Claude Code` (full name) · `CC` (LinkedIn DM abbreviation only, never email)
- `Codex` (paired with Claude Code when describing compatibility)
- `+90 GTM integrations` / `+90 prebuilt GTM integrations and skills` / `+90 integrations and skills`
- `sf-based startups`, `sf based startups`, `coming to sf in june` (lowercase sf in body)
- `GTM` always uppercase
- `gtm-vault` repo name (lowercase, hyphenated)
- `👍🏻` (light-skin thumbs up — exact glyph) as reply trigger
