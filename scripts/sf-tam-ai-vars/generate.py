"""Generate {cleaned_company_name, icp} for the SF TAM table via OpenRouter.

Reads OPENROUTER_API_KEY from environment. Reads the Prospeo CSV (so we don't
re-fetch from Oxygen), writes an enriched CSV with person_linkedin_url as the
upsert key. Streaming writes after every row so a crash mid-run keeps progress.
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

MODEL = "deepseek/deepseek-v4-flash"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

SYSTEM_PROMPT = """You produce two variables for a cold-outreach email.

Return ONLY a JSON object with these exact keys:

{
  "cleaned_company_name": "...",
  "icp": "..."
}

cleaned_company_name rules:
- Strip parenthetical suffixes like "(YC X25)", "(YC W24)", "(LLC)".
- Strip legal suffixes: LLC, Inc, Inc., Corp, Co., Ltd, GmbH, Pty.
- Strip TLD-style suffixes (".ai", ".com", ".io", ".co", ".so", ".app",
  ".dev", ".xyz", ".cx", ".net", ".tech") whenever they appear with a
  leading dot. ALWAYS strip, even if the brand IS the domain.
  So "a0.dev" -> "a0", "Xuman.ai" -> "Xuman", "Flexi.cx" -> "Flexi".
  NOTE: a SUFFIX WORD like " AI" (preceded by a space) is NOT a TLD
  and must be kept. So "Conduit AI" -> "Conduit AI" (keep "AI").
- Strip subtitles after a dash, hyphen, em-dash, colon, or pipe
  (e.g. "pxCode - design to code with AI" -> "pxCode",
        "HOA and Rental Property Management Software - ManageCasa"
        -> "ManageCasa" — keep the BRAND token, not the descriptor).
- Normalize casing:
  - If the result is a SINGLE WORD (no spaces): lowercase the whole
    word, then uppercase the first letter only.
    "DataNovo" -> "Datanovo", "NEON" -> "Neon", "pxCode" -> "Pxcode",
    "XUMAN" -> "Xuman", "a0" -> "A0".
  - If the result has MULTIPLE WORDS: use Title Case (each word's
    first letter uppercase, including suffix words like AI / Labs /
    Studio / Inc-style words you didn't strip).
    "Sierra Studio" -> "Sierra Studio",
    "Conduit AI" -> "Conduit AI",
    "Active Theory" -> "Active Theory",
    "Hubbl Technologies" -> "Hubbl Technologies".

icp rules:
- HARD LIMIT: 2 to 3 words. Never longer. Pick the single dominant
  customer segment.
- A short noun phrase that fits naturally after "you target ".
- ALL LOWERCASE. No proper nouns capitalized. No trailing period.
- Use the provided company context (AI Description, One-Liner,
  Value Proposition, keywords) to ground the answer.
- If the company is clearly in stealth and you cannot tell, output
  "early stage builders".
- Good examples: "real estate companies", "it managers",
  "pharmaceutical manufacturers", "mobile game publishers",
  "primary care clinics", "ecommerce brands", "robotics teams".
- Bad: "enterprise teams in sales, finance, legal, marketing, data,
  and operations" -> too long. Pick one: "operations teams".
- Bad: "Series A B2B SaaS founders" -> too long, has caps. Pick one
  lowercase phrase: "saas founders".

Output JSON only. No prose, no markdown fences."""


def call_openrouter(api_key: str, company_name: str, domain: str, description: str) -> dict:
    user_prompt = (
        f"Company: {company_name}\n"
        f"Domain: {domain}\n"
        f"Context (may include AI description, one-liner, value prop, "
        f"keywords): {description[:1200]}"
    )

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        "max_tokens": 1500,
    }

    req = urllib.request.Request(
        OPENROUTER_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://oxygen-agent.com",
            "X-Title": "Oxygen SF TAM",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        body = json.loads(resp.read())

    choices = body.get("choices") or []
    if not choices:
        raise ValueError(f"no choices in response: {str(body)[:200]}")
    msg = choices[0].get("message") or {}
    content = msg.get("content")
    if not content:
        # OpenRouter sometimes returns empty content with a finish_reason like
        # "length" or upstream provider hiccups; surface it so retry kicks in.
        raise ValueError(
            f"empty content (finish_reason={choices[0].get('finish_reason')})"
        )
    content = content.strip()
    if content.startswith("```"):
        content = content.strip("`").lstrip("json").strip()
    return json.loads(content)


def process_row(api_key: str, row: dict) -> dict:
    company = row.get("Company name", "").strip()
    domain = row.get("Company domain", "").strip()
    # Stitch all available context — Prospeo already enriched these.
    parts = []
    for k in ("AI One-Liner", "AI Description", "Value Proposition", "Company description", "Company keywords"):
        v = (row.get(k) or "").strip()
        if v:
            parts.append(f"{k}: {v}")
    desc = "\n".join(parts)

    out = {
        "person_linkedin_url": row.get("Person LinkedIn URL", "").strip(),
        "company_name_raw": company,
        "cleaned_company_name": "",
        "icp": "",
        "error": "",
    }
    last_err = ""
    for attempt in range(3):
        try:
            result = call_openrouter(api_key, company, domain, desc)
            cleaned = (result.get("cleaned_company_name") or "").strip()
            icp = (result.get("icp") or "").strip()
            # Sanity bounds — reject runaway / empty outputs and retry.
            if len(cleaned) > 60 or len(icp) > 60:
                last_err = f"output_too_long cleaned={len(cleaned)} icp={len(icp)}"
                continue
            if not cleaned and not icp:
                last_err = "both fields empty"
                continue
            out["cleaned_company_name"] = cleaned
            out["icp"] = icp
            out["error"] = ""
            return out
        except urllib.error.HTTPError as e:
            try:
                detail = e.read().decode()[:200]
            except Exception:
                detail = ""
            last_err = f"HTTP {e.code}: {detail}"
            time.sleep(0.5 * (attempt + 1))
        except Exception as e:
            last_err = f"{type(e).__name__}: {str(e)[:200]}"
            time.sleep(0.3 * (attempt + 1))
    out["error"] = last_err
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="Source CSV")
    ap.add_argument("--output", required=True, help="Destination CSV")
    ap.add_argument("--limit", type=int, default=0, help="Process only N rows (0 = all)")
    ap.add_argument("--workers", type=int, default=8, help="Concurrent API calls")
    args = ap.parse_args()

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        print("ERROR: OPENROUTER_API_KEY not set", file=sys.stderr)
        sys.exit(2)

    rows = []
    with open(args.input, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    if args.limit:
        rows = rows[: args.limit]

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["person_linkedin_url", "company_name_raw", "cleaned_company_name", "icp", "error"]

    start = time.time()
    done = 0
    errors = 0
    with open(out_path, "w", newline="", encoding="utf-8") as out_f:
        writer = csv.DictWriter(out_f, fieldnames=fieldnames)
        writer.writeheader()
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futures = {ex.submit(process_row, api_key, r): r for r in rows}
            for fut in as_completed(futures):
                result = fut.result()
                writer.writerow(result)
                out_f.flush()
                done += 1
                if result["error"]:
                    errors += 1
                if done % 25 == 0 or done == len(rows):
                    elapsed = time.time() - start
                    rate = done / elapsed if elapsed else 0
                    print(
                        f"  [{done}/{len(rows)}]  errors={errors}  "
                        f"elapsed={elapsed:.0f}s  rate={rate:.1f}/s",
                        flush=True,
                    )

    print(f"\nDONE  rows={done}  errors={errors}  out={out_path}")


if __name__ == "__main__":
    main()
