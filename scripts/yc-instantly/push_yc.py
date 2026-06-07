"""Push YC Founders rows-with-email to Instantly v2 with batch_short + icp custom vars.

Reads scripts/yc-instantly/yc_with_emails.json (produced by `oxygen tables query`).
POSTs to the YC Founders 2025-2026 campaign with Batch Short / ICP as custom variables.
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

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)


def post_lead(api_key: str, lead: dict) -> dict:
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(lead).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": UA,
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
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(1.5 ** attempt)
                continue
            break
        except Exception as e:
            last_err = f"{type(e).__name__}: {str(e)[:200]}"
            time.sleep(0.5 * (attempt + 1))
    return {"ok": False, "id": None, "email": lead["email"], "error": last_err}


def build_lead(row: dict) -> dict | None:
    email = (row.get("email") or "").strip()
    if not email:
        return None
    return {
        "campaign": CAMPAIGN_ID,
        "email": email,
        "first_name": (row.get("first_name") or "").strip(),
        "last_name": (row.get("last_name") or "").strip(),
        "company_name": (row.get("company_name") or "").strip(),
        "website": (row.get("company_website") or "").strip(),
        "custom_variables": {
            "batch_short": (row.get("batch_short") or "").strip(),
            "icp": (row.get("icp") or "").strip(),
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="Oxygen query JSON output")
    ap.add_argument("--output", required=True, help="Result log CSV")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=10)
    ap.add_argument("--retry-from", default="", help="Prior result CSV — only push leads whose row has ok=False there")
    args = ap.parse_args()

    api_key = os.environ.get("INSTANTLY_API_KEY")
    if not api_key:
        print("ERROR: INSTANTLY_API_KEY not set", file=sys.stderr)
        sys.exit(2)

    with open(args.input) as f:
        envelope = json.load(f)
    data = envelope.get("data", envelope)
    rows = data.get("rows", data.get("items", []))
    print(f"loaded {len(rows)} source rows")

    retry_emails: set[str] = set()
    if args.retry_from:
        with open(args.retry_from, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r.get("ok") != "True" and r.get("email"):
                    retry_emails.add(r["email"].strip().lower())
        print(f"retry mode: {len(retry_emails)} failed emails to re-push")

    leads = []
    skipped_no_email = 0
    skipped_not_in_retry = 0
    for row in rows:
        lead = build_lead(row)
        if lead is None:
            skipped_no_email += 1
            continue
        if retry_emails and lead["email"].strip().lower() not in retry_emails:
            skipped_not_in_retry += 1
            continue
        leads.append(lead)

    if args.limit:
        leads = leads[: args.limit]
    print(f"pushing {len(leads)} leads (skipped: no_email={skipped_no_email}, not_in_retry={skipped_not_in_retry})")

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
