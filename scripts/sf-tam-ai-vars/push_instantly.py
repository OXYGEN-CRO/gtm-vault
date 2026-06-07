"""Push SF TAM leads to Instantly v2 with cleaned_company_name + icp as custom vars.

Joins the Prospeo source CSV (email, name, company) with full_run.csv
(cleaned_company_name, icp) on person_linkedin_url, then POSTs each
lead to Instantly's /api/v2/leads endpoint.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

API_URL = "https://api.instantly.ai/api/v2/leads"
CAMPAIGN_ID = os.environ.get("INSTANTLY_CAMPAIGN_ID", "")  # set to your Instantly campaign id


def post_lead(api_key: str, lead: dict) -> dict:
    payload = json.dumps(lead).encode()
    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        },
        method="POST",
    )
    last_err = ""
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read())
                return {"ok": True, "id": body.get("id"), "email": lead["email"], "error": ""}
        except urllib.error.HTTPError as e:
            try:
                detail = e.read().decode()[:200]
            except Exception:
                detail = ""
            last_err = f"HTTP {e.code}: {detail}"
            # 429 / 5xx → backoff and retry
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(1.5 ** attempt)
                continue
            # 4xx other → don't retry
            break
        except Exception as e:
            last_err = f"{type(e).__name__}: {str(e)[:200]}"
            time.sleep(0.5 * (attempt + 1))
    return {"ok": False, "id": None, "email": lead["email"], "error": last_err}


def build_lead(prospeo_row: dict, enrich: dict) -> dict | None:
    email = (prospeo_row.get("Email") or "").strip()
    if not email or prospeo_row.get("Email status") != "VERIFIED":
        return None
    return {
        "campaign": CAMPAIGN_ID,
        "email": email,
        "first_name": (prospeo_row.get("First name") or "").strip(),
        "last_name": (prospeo_row.get("Last name") or "").strip(),
        "company_name": (prospeo_row.get("Company name") or "").strip(),
        "website": (prospeo_row.get("Company website") or "").strip(),
        "custom_variables": {
            "cleaned_company_name": enrich.get("cleaned_company_name", ""),
            "icp": enrich.get("icp", ""),
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prospeo", required=True, help="Source Prospeo CSV")
    ap.add_argument("--enriched", required=True, help="full_run.csv with cleaned_company_name + icp")
    ap.add_argument("--output", required=True, help="Result log CSV")
    ap.add_argument("--limit", type=int, default=0, help="Only push first N leads (0 = all)")
    ap.add_argument("--workers", type=int, default=8, help="Concurrent API calls")
    ap.add_argument("--retry-from", default="", help="Prior result CSV — only push leads whose row has ok=False there")
    args = ap.parse_args()

    api_key = os.environ.get("INSTANTLY_API_KEY")
    if not api_key:
        print("ERROR: INSTANTLY_API_KEY not set", file=sys.stderr)
        sys.exit(2)

    # Index enrichment by person_linkedin_url
    enrich_by_url = {}
    with open(args.enriched, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            url = (r.get("person_linkedin_url") or "").strip()
            if url:
                enrich_by_url[url] = {
                    "cleaned_company_name": (r.get("cleaned_company_name") or "").strip(),
                    "icp": (r.get("icp") or "").strip(),
                }
    print(f"loaded {len(enrich_by_url)} enrichment rows")

    retry_emails: set[str] = set()
    if args.retry_from:
        with open(args.retry_from, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r.get("ok") != "True" and r.get("email"):
                    retry_emails.add(r["email"].strip().lower())
        print(f"retry mode: {len(retry_emails)} failed emails to re-push")

    leads = []
    skipped_no_email = 0
    skipped_unverified = 0
    skipped_no_enrich = 0
    skipped_not_in_retry = 0
    with open(args.prospeo, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            url = (r.get("Person LinkedIn URL") or "").strip()
            enrich = enrich_by_url.get(url, {})
            if not enrich:
                skipped_no_enrich += 1
            lead = build_lead(r, enrich)
            if lead is None:
                if not (r.get("Email") or "").strip():
                    skipped_no_email += 1
                else:
                    skipped_unverified += 1
                continue
            if retry_emails and lead["email"].strip().lower() not in retry_emails:
                skipped_not_in_retry += 1
                continue
            leads.append(lead)

    if args.limit:
        leads = leads[: args.limit]
    print(f"pushing {len(leads)} leads (skipped: no_email={skipped_no_email}, unverified={skipped_unverified}, no_enrich={skipped_no_enrich})")

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    start = time.time()
    ok = 0
    err = 0
    with open(out_path, "w", newline="", encoding="utf-8") as out_f:
        w = csv.DictWriter(out_f, fieldnames=["email", "id", "ok", "error"])
        w.writeheader()
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futures = {ex.submit(post_lead, api_key, lead): lead for lead in leads}
            done = 0
            for fut in as_completed(futures):
                r = fut.result()
                w.writerow({"email": r["email"], "id": r["id"] or "", "ok": r["ok"], "error": r["error"]})
                out_f.flush()
                done += 1
                if r["ok"]:
                    ok += 1
                else:
                    err += 1
                if done % 50 == 0 or done == len(leads):
                    elapsed = time.time() - start
                    rate = done / elapsed if elapsed else 0
                    print(
                        f"  [{done}/{len(leads)}]  ok={ok}  err={err}  "
                        f"elapsed={elapsed:.0f}s  rate={rate:.1f}/s",
                        flush=True,
                    )

    print(f"\nDONE  pushed={ok}  errors={err}  out={out_path}")


if __name__ == "__main__":
    main()
