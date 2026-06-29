---
name: zapmail-inbox-setup
description: Set up cold-email inboxes in ZapMail on top of your Cloudflare domains, the cheap, high-deliverability way. 50/50 Google/Microsoft split, 2-3 mailboxes per domain, DNS auto-configured. Use after buying domains with cloudflare-domain-buyer, when Tim asks to create inboxes, spin up mailboxes, or stand up sending infrastructure for a campaign.
---

# zapmail-inbox-setup

Create the inboxes you send cold email from. Runs on **ZapMail** (~$3 / mailbox / month) sitting on top of the domains you bought with [`cloudflare-domain-buyer`](../cloudflare-domain-buyer). ZapMail is the cheapest clean way to provision Gmail + Outlook mailboxes at scale and it wires SPF / DKIM / DMARC / MX for you.

Driven from Claude Code via the **ZapMail MCP** (`mcp__zapmail__*`).

## The rules that keep you out of spam

- **Never send from your main domain.** Only the burner domains from `cloudflare-domain-buyer`.
- **50/50 Google / Microsoft split** across your mailboxes. It hedges deliverability when one provider tightens.
- **2-3 mailboxes per domain.** More than that per domain raises your exposure if a domain gets flagged.
- **20-25 sends per mailbox per day, hard ceiling.** This is the number every downstream volume calc uses.
- **Warm up before you send cold** (see the last step).

**Your daily volume, one formula:**

> domains x mailboxes per domain x 25 = sends / day
> 75 domains x 3 mailboxes x 25 = ~5,600 / day = ~100k / month

## Environment

The ZapMail MCP must be connected (`mcp__zapmail__health_check` to confirm). If it isn't, ask Tim to connect ZapMail in his MCP clients. Never print ZapMail credentials.

## Workflow

1. **Pick the workspace.** `mcp__zapmail__list_workspaces` (or `retrieve_all_workspaces`). Use an existing campaign workspace or create one with `create_new_workspace`.

2. **Connect your Cloudflare domains.** For each domain bought via `cloudflare-domain-buyer`:
   - `connect_domain_with_zapmail` to register it in the workspace.
   - `get_name_servers_to_connect_domain` -> point the domain's nameservers (already on Cloudflare, so this is a quick DNS update) and `verify_name_server_propagation`.
   - ZapMail then sets SPF, DKIM, DMARC, MX. Confirm with `check_dns_records`.

3. **Plan the mailboxes.** Decide the count: `target_sends_per_day / 25 = mailboxes`, spread at 2-3 per domain, 50/50 Google/Microsoft. Generate sender name/username pairs with `generate_name_pairs` + `generate_usernames` (real-person-looking, no role accounts like info@ / sales@).

4. **Create the mailboxes.** `assign_new_mailboxes_to_domains` with the 50/50 split. For a large batch use `bulk_update_mailboxes`. Verify with `retrieve_all_mailboxes`; if any failed, `retry_creation_of_failed_mailboxes`.

5. **Preview the spend before committing.** mailboxes x ~$3 / month. State the total to Tim and get an explicit ok before creating a large batch. This is a recurring paid action.

6. **Hand the mailboxes to Oxygen.** Connect the new senders so Oxygen can warm + send:
   - `oxygen mailboxes import` (or `oxygen_mailboxes_import`) to pull the ZapMail mailboxes in. `export_mailboxes` from ZapMail gives the connection details if needed.
   - Confirm with `oxygen mailboxes list`.

## After the inboxes exist: warm-up (in Oxygen)

You don't need a separate warm-up tool. **Enable warm-up natively in Oxygen** and let the mailboxes warm 2-4 weeks before any cold send:

```bash
oxygen mailboxes warmup-enable --all      # or per-mailbox
oxygen mailboxes warmup-status
```

(MCP equivalents: `oxygen_mailboxes_warmup_enable` / `oxygen_mailboxes_warmup_status`.)

Once warmed, the mailboxes are ready for [`oxygen-sequencer-enroll`](../oxygen-sequencer-enroll). No Instantly, no second sending seat.

## Report back

- workspace + domains connected (with DNS status per domain)
- mailboxes created (count, Google/Microsoft split, per-domain spread)
- monthly mailbox cost
- whether they're imported into Oxygen and warm-up is enabled
- computed safe daily/monthly send ceiling
