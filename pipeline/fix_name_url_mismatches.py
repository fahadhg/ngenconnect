"""
Fix company_name / site mismatches in Supabase.

For records where the extracted company_name has no plausible connection to
the domain, replace it with a clean name derived from the domain itself.

Usage:
    python3 fix_name_url_mismatches.py          # dry run — prints what would change
    python3 fix_name_url_mismatches.py --fix    # apply fixes to Supabase
"""

import json, re, sys, time
import requests
from pathlib import Path

SUPABASE_URL = "https://xzefflcbnwnhjpxjitta.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6ZWZmbGNibnduaGpweGppdHRhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA5NTI4NiwiZXhwIjoyMDkzNjcxMjg2fQ.cXDDVOt67aIyQwCudVGcvJjGl49LdKjBvKoTcSKdYzo"

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

PAGE_SIZE = 1000


def fetch_all() -> list[dict]:
    all_rows = []
    for offset in range(0, 10000, PAGE_SIZE):
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/companies?select=id,company_name,site&limit={PAGE_SIZE}&offset={offset}",
            headers=HEADERS,
        )
        batch = resp.json()
        if not isinstance(batch, list) or not batch:
            break
        all_rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
    return all_rows


def domain_from_site(site: str) -> str:
    """Extract the bare domain label (e.g. 'progressivemachining' from 'www.progressivemachining.ca')."""
    s = site.lower().replace("https://", "").replace("http://", "").replace("www.", "")
    return s.split(".")[0].split("/")[0]


def name_from_domain(domain: str) -> str:
    """Turn a domain label into a human-readable company name."""
    # Split on hyphens and underscores
    parts = re.split(r"[-_]", domain)
    # Split camelCase
    expanded = []
    for p in parts:
        words = re.sub(r"([a-z])([A-Z])", r"\1 \2", p).split()
        expanded.extend(words)
    return " ".join(w.capitalize() for w in expanded if w)


def is_mismatch(name: str, site: str) -> bool:
    """
    Returns True only when the extracted company_name has no plausible connection
    to the domain — i.e. it's almost certainly wrong.

    Deliberately conservative: we'd rather miss a mismatch than rename a
    company that legitimately uses a branded/abbreviated domain.
    """
    if not name or not site:
        return False

    domain = domain_from_site(site)
    if len(domain) <= 3:
        return False  # acronym domain — too short to verify

    name_lower = name.lower()
    name_alpha = re.sub(r"[^a-z]", "", name_lower)
    domain_lower = domain.lower()
    domain_alpha = re.sub(r"[^a-z]", "", domain_lower)

    # 1. Direct containment (handles "foresight" inside "foresightcac", etc.)
    if domain_alpha in name_alpha or name_alpha in domain_alpha:
        return False

    # 2. Any name token (3+ chars) appears as substring anywhere in the domain
    for tok in re.findall(r"[a-z]{3,}", name_lower):
        if tok in domain_alpha:
            return False

    # 3. Any domain token (3+ chars) appears as substring anywhere in the name
    for tok in re.findall(r"[a-z]{3,}", domain_lower):
        if tok in name_alpha:
            return False

    # 4. Acronym: initials of name words match start of domain
    words = re.findall(r"[a-zA-Z]+", name)
    initials = "".join(w[0].lower() for w in words)
    if len(initials) >= 2 and domain_alpha.startswith(initials[:2]):
        return False
    if len(initials) >= 3 and domain_alpha[:3] in initials:
        return False

    # 5. Only flag if domain has at least one long descriptive word (5+ chars)
    #    — short/opaque domains (bjtake, passivdom) are too ambiguous
    if not re.search(r"[a-z]{5,}", domain_alpha):
        return False

    return True


def main():
    fix_mode = "--fix" in sys.argv

    print("Fetching companies from Supabase...")
    companies = fetch_all()
    print(f"Loaded {len(companies):,} companies\n")

    fixes = []
    for c in companies:
        name = c.get("company_name") or ""
        site = c.get("site") or ""
        if is_mismatch(name, site):
            domain = domain_from_site(site)
            suggested = name_from_domain(domain)
            fixes.append({
                "id": c["id"],
                "old_name": name,
                "new_name": suggested,
                "site": site,
            })

    print(f"Found {len(fixes)} mismatches:\n")
    for f in fixes:
        print(f'  "{f["old_name"]}"  →  "{f["new_name"]}"  [{f["site"]}]')

    # Save report
    report_path = Path(__file__).parent / "mismatch_fixes.json"
    with open(report_path, "w") as fh:
        json.dump(fixes, fh, indent=2)
    print(f"\nFull list saved to {report_path}")

    if not fix_mode:
        print(f"\nDry run complete. Run with --fix to apply {len(fixes)} fixes to Supabase.")
        return

    print(f"\nApplying {len(fixes)} fixes...")
    ok = fail = 0
    for f in fixes:
        resp = requests.patch(
            f"{SUPABASE_URL}/rest/v1/companies?id=eq.{requests.utils.quote(f['id'])}",
            headers=HEADERS,
            json={"company_name": f["new_name"]},
        )
        if resp.status_code in (200, 204):
            ok += 1
        else:
            print(f"  FAILED {f['id']}: {resp.status_code} {resp.text[:80]}")
            fail += 1

        if (ok + fail) % 50 == 0:
            print(f"  {ok + fail}/{len(fixes)} done...")
        time.sleep(0.02)

    print(f"\n✓ Done — {ok} fixed, {fail} failed.")


if __name__ == "__main__":
    main()
