"""
Re-extract company names for the 486 flagged mismatch sites using Claude API.

Reads page content from out2/results_clean.jsonl (no re-crawling needed).
Calls Anthropic Claude Haiku to get the correct company name.
Optionally patches Supabase.

Usage:
    python3 reextract_mismatches.py            # dry run — prints proposed changes
    python3 reextract_mismatches.py --fix      # apply fixes to Supabase
    python3 reextract_mismatches.py --limit 5  # test on first 5 sites
"""

import json, os, sys, time, argparse
from pathlib import Path
import requests
import anthropic

# ── Config ────────────────────────────────────────────────────────────────────

SCRAPER_DIR   = Path(__file__).parent
RESULTS_FILE  = SCRAPER_DIR / "out2" / "results_clean.jsonl"
FIXES_FILE    = SCRAPER_DIR / "mismatch_fixes.json"
OUTPUT_FILE   = SCRAPER_DIR / "reextract_results.json"

SUPABASE_URL  = "https://xzefflcbnwnhjpxjitta.supabase.co"
SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6ZWZmbGNibnduaGpweGppdHRhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA5NTI4NiwiZXhwIjoyMDkzNjcxMjg2fQ.cXDDVOt67aIyQwCudVGcvJjGl49LdKjBvKoTcSKdYzo"
SUPABASE_HDR  = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY")
if not ANTHROPIC_KEY:
    raise SystemExit("Set ANTHROPIC_API_KEY in your environment before running.")

MODEL          = "claude-haiku-4-5"  # cheap + fast; change to claude-opus-4-8 for higher accuracy
MAX_PAGES      = 4
CHARS_PER_PAGE = 1500
RATE_DELAY     = 0.3  # seconds between API calls

INPUT_COST_PER_M  = 1.00   # $ per 1M input tokens (haiku-4-5)
OUTPUT_COST_PER_M = 5.00
CHARS_PER_TOKEN   = 4

# ── Page helpers ──────────────────────────────────────────────────────────────

PAGE_PRIORITY = {
    "about": 8, "company": 7, "who": 6,
    "home": 9, "index": 9, "contact": 5,
    "capabilities": 4, "services": 3,
    "privacy": 0, "legal": 0, "career": 1, "blog": 1, "news": 1,
}


def page_score(page: dict) -> int:
    url   = (page.get("url") or "").lower()
    depth = page.get("depth", 99)
    score = 0
    for kw, pts in PAGE_PRIORITY.items():
        if kw in url:
            score = max(score, pts)
    if depth == 0 or url.rstrip("/").count("/") <= 2:
        score = max(score, 9)
    score -= depth
    if (page.get("word_count") or 0) < 30:
        score -= 5
    return score


def select_pages(pages: list[dict]) -> list[dict]:
    scored = sorted(pages, key=page_score, reverse=True)
    seen: set[str] = set()
    out: list[dict] = []
    for p in scored:
        slug = "/".join((p.get("url") or "").lower().rstrip("/").split("/")[:4])
        if slug not in seen:
            seen.add(slug)
            out.append(p)
        if len(out) >= MAX_PAGES:
            break
    return out


def build_content_block(pages: list[dict]) -> str:
    blocks = []
    for p in pages:
        text = (p.get("fit_markdown") or "").strip()[:CHARS_PER_PAGE]
        if text:
            blocks.append(f"--- {p.get('url', '')} ---\n{text}")
    return "\n\n".join(blocks)


# ── Claude extraction ─────────────────────────────────────────────────────────

def extract_company_name(client: anthropic.Anthropic, site: str, content: str, old_name: str) -> str | None:
    prompt = f"""Extract the official company name from this website content.

Domain: {site}

Content:
{content}

Rules:
- Reply with ONLY the company name, nothing else
- One line, no punctuation around it, no explanation
- If the company name is not clear, reply with exactly: UNKNOWN"""

    msg = client.messages.create(
        model=MODEL,
        max_tokens=32,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = msg.content[0].text.strip().strip('"').strip("'")
    first_line = raw.splitlines()[0].strip()
    if "UNKNOWN" in first_line.upper() or len(first_line) < 2:
        return None
    return first_line


# ── Cost estimate ─────────────────────────────────────────────────────────────

def estimate_cost(site_pages: dict[str, list[dict]]) -> tuple[float, int]:
    total_chars = 0
    sites_with_content = 0
    for pages in site_pages.values():
        content = build_content_block(select_pages(pages))
        if content:
            total_chars += len(content) + 300
            sites_with_content += 1
    input_tokens  = total_chars / CHARS_PER_TOKEN
    output_tokens = sites_with_content * 15
    cost = (input_tokens / 1_000_000 * INPUT_COST_PER_M +
            output_tokens / 1_000_000 * OUTPUT_COST_PER_M)
    return cost, sites_with_content


# ── Main ──────────────────────────────────────────────────────────────────────

def apply_saved_results(results_path: Path) -> None:
    """Read reextract_results.json and patch Supabase — no Claude calls."""
    results = json.loads(results_path.read_text())
    changed = [r for r in results if r["changed"]]
    print(f"Loaded {len(results)} results from {results_path.name}")
    print(f"Applying {len(changed)} changed records to Supabase...")
    patched = failed = 0
    for r in changed:
        resp = requests.patch(
            f"{SUPABASE_URL}/rest/v1/companies?id=eq.{requests.utils.quote(r['id'])}",
            headers=SUPABASE_HDR,
            json={"company_name": r["new_name"]},
        )
        if resp.status_code in (200, 204):
            patched += 1
        else:
            print(f"  FAILED {r['id']}: {resp.status_code} {resp.text[:80]}")
            failed += 1
        if (patched + failed) % 50 == 0:
            print(f"  {patched + failed}/{len(changed)} done...")
        time.sleep(0.02)
    print(f"\nDone — {patched} patched, {failed} failed.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fix",          action="store_true", help="Apply fixes to Supabase")
    parser.add_argument("--from-results", action="store_true", help="Skip Claude; apply saved reextract_results.json to Supabase")
    parser.add_argument("--limit",        type=int, default=0, help="Process only first N sites (for testing)")
    args = parser.parse_args()

    if args.from_results:
        apply_saved_results(OUTPUT_FILE)
        return

    fixes = json.loads(FIXES_FILE.read_text())
    if args.limit:
        fixes = fixes[:args.limit]
    target_sites = {f["site"]: f for f in fixes}
    print(f"Target sites: {len(target_sites)}")

    # Build normalized site lookup (handles www. prefix mismatches)
    site_pages: dict[str, list[dict]] = {s: [] for s in target_sites}
    site_lookup: dict[str, str] = {}
    for s in target_sites:
        site_lookup[s] = s
        without_www = s.replace("www.", "")
        site_lookup[without_www] = s
        site_lookup["www." + without_www] = s

    # Stream results_clean.jsonl
    print(f"Scanning {RESULTS_FILE.name} for page content...")
    scanned = 0
    with open(RESULTS_FILE) as fh:
        for line in fh:
            scanned += 1
            if scanned % 50_000 == 0:
                found = sum(1 for v in site_pages.values() if v)
                print(f"  Scanned {scanned:,} lines, {found}/{len(target_sites)} sites found...")
            try:
                page = json.loads(line)
            except Exception:
                continue
            raw_site = page.get("site", "")
            canonical = site_lookup.get(raw_site)
            if canonical and page.get("status") in ("success", 200) and page.get("fit_markdown"):
                site_pages[canonical].append(page)

    found_count = sum(1 for v in site_pages.values() if v)
    no_content  = [s for s, v in site_pages.items() if not v]
    print(f"\nFound page content for {found_count}/{len(target_sites)} sites")
    if no_content:
        print(f"No content for {len(no_content)} sites (domain-name heuristic will be used)")

    cost, sites_with_content = estimate_cost(site_pages)
    print(f"\nEstimated API cost ({MODEL}): ${cost:.2f}")
    print(f"  Sites with content → Claude: {sites_with_content}")
    print(f"  Sites without content → heuristic: {len(no_content)}")

    client  = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    results = []

    for i, (site, fix_record) in enumerate(target_sites.items(), 1):
        old_name = fix_record["old_name"]
        fallback = fix_record["new_name"]  # domain-name heuristic

        pages = site_pages[site]
        if pages:
            content = build_content_block(select_pages(pages))
            try:
                result   = extract_company_name(client, site, content, old_name)
                if result:
                    new_name = result
                    source   = "claude"
                else:
                    new_name = fallback
                    source   = "unknown-fallback"
            except Exception as e:
                print(f"  ERROR {site}: {e}")
                new_name = fallback
                source   = "error-fallback"
        else:
            new_name = fallback
            source   = "no-content-fallback"

        changed = new_name != old_name
        results.append({
            "id":       fix_record["id"],
            "site":     site,
            "old_name": old_name,
            "new_name": new_name,
            "source":   source,
            "changed":  changed,
        })
        tag = "CHANGED" if changed else "same"
        print(f"[{i:>3}/{len(target_sites)}] {tag:7} | {old_name!r}  →  {new_name!r}  [{source}]")
        time.sleep(RATE_DELAY)

    OUTPUT_FILE.write_text(json.dumps(results, indent=2))
    changed_results = [r for r in results if r["changed"]]
    print(f"\nResults saved to {OUTPUT_FILE}")
    print(f"Total: {len(results)}  |  Changed: {len(changed_results)}  |  Same: {len(results) - len(changed_results)}")

    if not args.fix:
        print(f"\nDry run done. Run with --fix to patch {len(changed_results)} Supabase records.")
        return

    print(f"\nPatching Supabase ({len(changed_results)} records)...")
    patched = failed = 0
    for r in changed_results:
        resp = requests.patch(
            f"{SUPABASE_URL}/rest/v1/companies?id=eq.{requests.utils.quote(r['id'])}",
            headers=SUPABASE_HDR,
            json={"company_name": r["new_name"]},
        )
        if resp.status_code in (200, 204):
            patched += 1
        else:
            print(f"  FAILED {r['id']}: {resp.status_code} {resp.text[:80]}")
            failed += 1
        if (patched + failed) % 50 == 0:
            print(f"  {patched + failed}/{len(changed_results)} done...")
        time.sleep(0.02)

    print(f"\nDone — {patched} patched, {failed} failed.")


if __name__ == "__main__":
    main()
