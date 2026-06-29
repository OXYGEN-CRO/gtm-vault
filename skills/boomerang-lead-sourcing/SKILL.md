---
name: boomerang-lead-sourcing
description: Source a tight, high-intent cold-email lead list from Apollo with Boomerang, then import it into an Oxygen table. A guided manual step. Use when Tim asks to source leads, build a TAM list, scrape Apollo, or start a new campaign's audience.
---

# boomerang-lead-sourcing

Get the lead list. This is the one **manual** step in the outbound flow: you scrape Apollo with **Boomerang**, then bring the CSV into Oxygen. The whole quality of the campaign is set here, so the job isn't "get a lot of leads," it's **narrow the list until every lead deserves a personalised email.**

> Boomerang (Apollo scraper): https://www.theboomerang.co/

## Why narrow beats broad

Personalisation only pays off if the audience is coherent. A tight list lets one angle land for everyone in it; a broad list forces generic copy, which dies. Narrow first, then [`personalize-ai-column`](../personalize-ai-column) has something real to work with.

## How to narrowly source the list

In Apollo (via Boomerang), stack filters until the list is **one clean audience**, not a mega-dump:

1. **One persona at a time.** Specific titles (e.g. `Founder`, `Head of Growth`), not a wide seniority net. One campaign = one persona.
2. **Tight firmographics.** Industry + headcount band (e.g. SaaS, 5-50) + geography. Keep the band narrow (10-50 and 50-200 are two different audiences, split them).
3. **An intent or fit signal where you can.** Hiring for a role, uses a given technology, recently funded, in a specific accelerator batch. The signal becomes your angle later.
4. **Exclude the obvious noise.** Existing customers, current pipeline, competitors, generic role inboxes.

Aim for clean audiences of a few thousand, each one a separate scrape, not one list of 100k. You'll run them as separate campaigns and split-test across them.

Export each audience from Boomerang as a CSV.

## Import into Oxygen

Pull each CSV into its own Oxygen table, that's the working list for the rest of the flow:

```bash
oxygen tables import-csv --file /path/to/audience.csv --name "saas-founders-5-50-us"
```

(MCP equivalent: `oxygen_tables_import_csv` / `oxygen_tables_csv_import_open`.)

Then continue the flow:

- **Enrich + verify** the emails in Oxygen: waterfall enrichment, then MillionVerifier on every row and BounceBan on the catch-alls only (`oxygen enrich-column`).
- **Personalise** with [`personalize-ai-column`](../personalize-ai-column).
- **Enroll** with [`oxygen-sequencer-enroll`](../oxygen-sequencer-enroll).

## Report back

- the audience definition (persona + firmographics + signal) for each list
- row count per audience and the table name it landed in
- anything you excluded and why
