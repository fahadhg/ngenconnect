"""
Audit company_name vs website mismatches in Supabase.
Flags cases where the stored company_name has no plausible connection to the domain.
Outputs a CSV for review + optionally applies fixes.

Usage:
    python3 audit_name_mismatches.py             # audit only, outputs audit_results.csv
    python3 audit_name_mismatches.py --fix       # apply auto-fixes for clear mismatches
"""

import csv
import json
import re
import sys
import urllib.parse
import requests
from pathlib import Path

SUPABASE_URL = "https://xzefflcbnwnhjpxjitta.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6ZWZmbGNibnduaGpweGppdHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwOTUyODYsImV4cCI6MjA5MzY3MTI4Nn0.MihWBH0ADbz1RFgR_Mt_YTzHqORHtHQJBCmilDjc7ag"

PIPELINE_FILE = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/out2/extracted_final.jsonl")

# Well-known brand names that should NEVER appear as a Canadian manufacturer
FALSE_POSITIVES = {
    "air canada", "linktree", "clickfunnels", "elo gaming", "matthews international",
    "lippert", "tiktok", "facebook", "google", "amazon", "shopify", "netflix",
    "microsoft", "apple inc", "tesla", "1win",
}

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


def supabase_get(path: str) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()


def supabase_patch(table: str, match_field: str, match_value: str, updates: dict):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{match_field}=eq.{urllib.parse.quote(str(match_value))}"
    resp = requests.patch(url, headers={**HEADERS, "Prefer": "return=minimal"}, json=updates)
    return resp.status_code


def domain_from_site(site: str) -> str:
    s = site.lower().replace("www.", "").replace("http://", "").replace("https://", "")
    s = s.split("/")[0].split("?")[0]
    return s.split(".")[0].replace("-", "").replace("_", "")


def name_tokens(name: str) -> list[str]:
    tokens = re.findall(r"[a-z]{3,}", name.lower())
    return tokens


def has_plausible_overlap(name: str, domain: str) -> bool:
    d = domain_from_site(domain)
    n = name.lower().replace(" ", "").replace(".", "").replace(",", "").replace("-", "").replace("'", "")
    # Direct substring check
    if len(d) >= 4 and d in n: return True
    if len(n) >= 4 and n[:8] in d: return True
    # Token overlap
    for tok in name_tokens(name):
        if len(tok) >= 4 and tok in d: return True
    # Acronym check: initials of name words match start of domain
    words = [w for w in re.findall(r"[a-zA-Z]+", name) if len(w) > 1]
    acronym = "".join(w[0].lower() for w in words[:6])
    if len(acronym) >= 3 and d.startswith(acronym[:3]): return True
    return False


def suggested_name_from_domain(site: str) -> str:
    """Derive a candidate company name from the domain as a fallback."""
    d = site.lower().replace("www.", "").split(".")[0]
    d = re.sub(r"[-_]", " ", d)
    return d.title()


def main():
    fix_mode = "--fix" in sys.argv

    print("Fetching companies from Supabase...")
    companies = supabase_get("companies?select=id,company_name,website&limit=5000")
    print(f"Loaded {len(companies)} companies")

    # Build pipeline lookup: site → extracted_final company_name
    pipeline_lookup: dict[str, str] = {}
    if PIPELINE_FILE.exists():
        seen = set()
        for line in PIPELINE_FILE.read_text().splitlines():
            if not line.strip(): continue
            d = json.loads(line)
            site = (d.get("site") or "").replace("www.", "")
            name = d.get("company_name") or ""
            if site and site not in seen:
                seen.add(site)
                pipeline_lookup[site] = name

    results = []
    auto_fixes = []

    for co in companies:
        cid   = co.get("id")
        name  = co.get("company_name") or ""
        site  = co.get("website") or ""
        if not name or not site:
            continue

        site_clean = site.lower().replace("www.", "").replace("https://", "").replace("http://", "").split("/")[0]

        overlap = has_plausible_overlap(name, site)
        is_false_positive = name.lower().rstrip(".").rstrip(",") in FALSE_POSITIVES

        if not overlap or is_false_positive:
            pipeline_name = pipeline_lookup.get(site_clean, "")
            suggested = pipeline_name or suggested_name_from_domain(site)
            severity = "HIGH" if is_false_positive else "MEDIUM"
            results.append({
                "id": cid,
                "current_name": name,
                "website": site,
                "suggested_name": suggested,
                "severity": severity,
                "note": "Known brand mismatch" if is_false_positive else "No name/domain overlap",
            })
            if fix_mode and is_false_positive and suggested and suggested != name:
                auto_fixes.append((cid, name, suggested, site))

    # Write CSV
    out = Path("audit_results.csv")
    with open(out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "current_name", "website", "suggested_name", "severity", "note"])
        writer.writeheader()
        writer.writerows(results)

    print(f"\nAudit complete: {len(results)} flagged ({sum(1 for r in results if r['severity']=='HIGH')} HIGH)")
    print(f"Results saved to {out.absolute()}")

    if fix_mode:
        print(f"\nApplying {len(auto_fixes)} auto-fixes (HIGH severity only)...")
        for cid, old_name, new_name, site in auto_fixes:
            print(f"  Fixing: '{old_name}' → '{new_name}' ({site})")
            try:
                supabase_patch("companies", "id", str(cid), {"company_name": new_name})
                print(f"    OK")
            except Exception as e:
                print(f"    FAILED: {e}")
    else:
        print("\nRun with --fix to auto-correct HIGH severity mismatches.")
        print("Review audit_results.csv and manually fix MEDIUM severity entries.")


if __name__ == "__main__":
    main()
