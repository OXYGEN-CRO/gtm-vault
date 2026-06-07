---
name: cloudflare-domain-buyer
description: Buy Cloudflare Registrar domains from a CSV through the guarded local script. Use when Tim asks to check, preview, or purchase domains for Oxygen cold email, campaign inboxes, landing pages, or GTM experiments.
---

# cloudflare-domain-buyer

Use this skill to buy domains through Cloudflare Registrar without turning
a chat request into an accidental paid action.

The repo script is:

```bash
scripts/cloudflare-bulk-domains.mjs
```

It uses Cloudflare Registrar API through Doppler-managed environment
variables. It checks availability and pricing first, previews the exact
purchase, then only registers domains when an explicit execution command is
run.

## Safety rules

- Never register a domain before a fresh preview in the same session.
- Never run `purchase --execute` unless Tim explicitly approves the exact
  domain(s) and spend cap.
- Use a narrow spend cap. For one standard `.com`, use a cap just above
  the returned price.
- Keep `auto_renew` false unless Tim explicitly asks for it.
- Skip premium, unavailable, unsupported, Unicode, or typo-risk domains.
- Do not print Cloudflare secrets.

## Environment

Run through Doppler:

```bash
doppler run --project <your-project> --config <your-config> -- \
  scripts/cloudflare-bulk-domains.mjs --help
```

Required secrets:

- `CLOUDFLARE_ACCOUNT_ID` or `ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

If either is missing, ask Tim to set it in Doppler:

```bash
doppler secrets set CLOUDFLARE_ACCOUNT_ID=<account_id> CLOUDFLARE_API_TOKEN=<token> \
  --project <your-project> \
  --config <your-config>
```

## CSV shape

Create a temporary CSV outside the repo unless Tim asks to keep it:

```csv
domain,years,auto_renew,privacy_mode,note
tryoxygenhq.com,1,false,redaction,cold email candidate
```

Columns:

- `domain`: required.
- `years`: optional, 1 to 10.
- `auto_renew`: optional, defaults to false.
- `privacy_mode`: optional, defaults to `redaction`.
- `note`: optional, report metadata only.

## Workflow

1. Build a short candidate list.

   For Oxygen cold email, prefer clean brand-adjacent `.com` domains such as
   `tryoxygen...`, `getoxygen...`, `oxygenmail...`, or campaign-specific
   names. Avoid typo domains unless Tim explicitly asks.

2. Check availability and pricing.

   ```bash
   doppler run --project <your-project> --config <your-config> -- \
     scripts/cloudflare-bulk-domains.mjs check \
     --csv /tmp/oxygen-domain-candidates.csv \
     --out /tmp/oxygen-domain-check.json
   ```

3. Pick one recommendation.

   Summarize:

   - domain
   - price returned by Cloudflare
   - auto-renew setting
   - privacy setting
   - skipped candidates and reasons

4. Run a purchase preview for the exact domain(s).

   ```bash
   doppler run --project <your-project> --config <your-config> -- \
     scripts/cloudflare-bulk-domains.mjs purchase \
     --csv /tmp/oxygen-domain-purchase.csv \
     --max-total-usd 11 \
     --out /tmp/oxygen-domain-purchase-preview.json
   ```

5. Ask for explicit approval if Tim has not already given it.

   Required approval content:

   ```text
   Approve registering <domain> with max spend $<cap>; I understand this is billable and non-refundable.
   ```

6. Execute only after approval.

   ```bash
   doppler run --project <your-project> --config <your-config> -- \
     env CLOUDFLARE_BULK_DOMAINS_CONFIRM=I_UNDERSTAND_THIS_BUYS_DOMAINS \
     scripts/cloudflare-bulk-domains.mjs purchase \
     --csv /tmp/oxygen-domain-purchase.csv \
     --max-total-usd 11 \
     --execute \
     --poll \
     --out /tmp/oxygen-domain-purchase-result.json
   ```

7. Verify the registration resource.

   ```bash
   doppler run --project <your-project> --config <your-config> -- \
     sh -lc 'ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-$ACCOUNT_ID}"; curl -fsS "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/registrar/registrations/<domain>" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"'
   ```

8. Report the result.

   Include:

   - `domain_name`
   - `status`
   - `created_at`
   - `expires_at`
   - `auto_renew`
   - `privacy_mode`
   - `locked`

## After buying a cold email domain

Tell Tim the next setup work:

- Create the mailbox.
- Configure SPF, DKIM, DMARC, and MX.
- Add a tracking subdomain if the sending platform needs one.
- Warm up the inbox before live outreach.
