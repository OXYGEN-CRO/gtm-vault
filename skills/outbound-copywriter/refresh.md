# Refreshing the outbound corpus

When voice drifts or Tim launches new campaigns, refresh `corpus.md` from the live platforms. Quarterly default; on-demand when Tim says "the campaigns changed" / "pull the latest copy".

---

## Inputs

Credentials live in `GTM/.env` (gitignored):

- `INSTANTLY_API_KEY` — base64 string, passed as `Authorization: Bearer ...`
- HeyReach is wired through MCP tools (`mcp__heyreach__*`). No key needed once the connector is authorized.

---

## Step 1 — Pull Instantly

```bash
set -a && source .env && set +a
python3 <<'PY'
import urllib.request, json, os, re

api_key = os.environ['INSTANTLY_API_KEY']
ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 Chrome/126'
hdr = {'Authorization': f'Bearer {api_key}', 'User-Agent': ua}

# List campaigns
req = urllib.request.Request('https://api.instantly.ai/api/v2/campaigns?limit=100', headers=hdr)
items = json.loads(urllib.request.urlopen(req).read()).get('items', [])

# Detail each campaign with full sequence
out = []
for c in items:
    req2 = urllib.request.Request(f'https://api.instantly.ai/api/v2/campaigns/{c["id"]}', headers=hdr)
    full = json.loads(urllib.request.urlopen(req2).read())
    out.append(full)
    print(f'{full.get("status")}  {full["name"]}  '
          f'{len(full.get("sequences",[]))} sequences')

# Save raw dump for the writer to draft from
with open('scripts/instantly_dump.json', 'w') as f:
    json.dump(out, f, indent=2)
print(f'\nsaved scripts/instantly_dump.json — {len(out)} campaigns')
PY
```

The dump contains every `sequences[].steps[].variants[]` with `subject` and `body` (HTML). Strip tags via `re.sub(r'<[^>]+>', '', body)` for readability.

**Filter:** only campaigns with `status` in `1` (running) or `2` (active) contribute to the voice corpus. Skip drafts (`status: 0`) and archived (`status: -1`) unless Tim says otherwise.

---

## Step 2 — Pull HeyReach

HeyReach's `get_campaign` MCP returns stats but **not the message body**. There are two paths:

### Option A — ask Tim to paste

Default for now. The HeyReach API does not expose sequence text via the public endpoints; Tim copies them from the HeyReach UI's sequence editor. This is what we did for the 2026-05-18 refresh.

### Option B — scrape via authenticated browser

If/when `/browse` or a similar tool is wired with HeyReach cookies, navigate to each campaign's sequence editor and read the copy from the DOM. Not yet automated.

List campaigns first:

```
mcp__heyreach__get_all_campaigns({ limit: 100, offset: 0 })
```

Filter to `status in ["IN_PROGRESS", "PAUSED"]` (drop `DRAFT`, `FINISHED`).

---

## Step 3 — Update corpus.md

For each running campaign, write a section:

```markdown
### Campaign: `<name>` (status: running)

Audience: <one-liner>. Custom variables: `<list>`.

**Variant N · subject: `<subject>`**

\`\`\`
<verbatim body, HTML stripped, smart-quotes preserved>
\`\`\`
```

Keep variants in the order Instantly returns them. Strip `<br />` to `\n`, `<div>` and `</div>` to nothing (with trailing `\n` where appropriate), collapse 3+ newlines to 2.

For HeyReach, no subject line; write the body directly.

After updating, regenerate the **Pattern matrix** section at the bottom of `corpus.md` by scanning the new variants. The current matrix has 4 rows (openers, context anchors, pivots, offers, CTAs) — keep those headings; refresh the cells from the new corpus.

Bump the "Last refreshed" date at the top.

---

## Step 4 — Sanity-check the brand tokens

Grep the new corpus for tokens that must stay locked:

```bash
grep -nE '\+90 |Claude Code|Codex|Oxygen|GTM CLI/MCP|sf-based|👍🏻' \
  .claude/skills/outbound-copywriter/corpus.md
```

If a campaign uses different brand language (different proof number, different product name, different reply glyph), call it out to Tim before updating SKILL.md's "Brand vocabulary" section. Brand drift in outbound is a signal Tim is testing a new positioning — don't quietly assume.

---

## Step 5 — Diff + commit

```bash
git diff -- .claude/skills/outbound-copywriter/
```

Re-read the SKILL.md sections "Brand vocabulary" and "Slop blacklist" against the new corpus. If a token used to be locked but is no longer in any live variant, drop it. If a new offer or CTA appears in 2+ variants, add it.

Commit per the GTM auto-push rule (see CLAUDE.md):

```
git add .claude/skills/outbound-copywriter/
git commit -m "outbound-copywriter · corpus refresh YYYY-MM-DD"
git push origin main
```
