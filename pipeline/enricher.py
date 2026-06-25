"""
NGen Enricher — Phase 1: Corporations Canada + Government Sources
=================================================================
Downloads federal corporation registry data and matches each scraped
company against it to get: province, city, legal name, BN, status.

Usage:
    python3 enricher.py

Outputs:
    out2/enrichment.jsonl   — one record per site, with all enriched fields
    out2/enricher_cache/    — cached CSV downloads (not re-downloaded on restart)
"""

import asyncio
import csv
import io
import json
import re
import sqlite3
import time
from pathlib import Path

import httpx
from rapidfuzz import fuzz, process as fuzz_process

# ── Config ───────────────────────────────────────────────────────────────────
OUT_DIR        = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/out2")
CACHE_DIR      = OUT_DIR / "enricher_cache"
SUMMARIES_FILE = OUT_DIR / "site_summaries.jsonl"
RESULTS_FILE   = OUT_DIR / "results_clean.jsonl"
OUTPUT_FILE    = OUT_DIR / "enrichment.jsonl"
CORPS_DB       = CACHE_DIR / "corps_canada.db"

CBCA_URL  = "https://d4bf66bykfyaf.cloudfront.net/corporations-active-cbca-en.csv"
OTHER_URL = "https://d4bf66bykfyaf.cloudfront.net/corporations-active-non-cbca-en.csv"

FUZZY_THRESHOLD = 85   # minimum score (0-100) to accept a match
CONCURRENT      = 1    # no external API calls yet, keep at 1

CACHE_DIR.mkdir(parents=True, exist_ok=True)


# ── Helpers ──────────────────────────────────────────────────────────────────

def extract_company_name(title: str, domain: str) -> str:
    """Extract company name from a page title like 'Products | Acme Corp'."""
    if not title:
        return domain_to_name(domain)
    # Strip leading noise phrases (with or without a separator following)
    noise_start = re.compile(
        r'^(?:home|welcome(?: to)?|about(?: us)?|contact(?: us)?|products?|services?|'
        r'capabilities|solutions|news)\s*(?:[\|\-–—]\s*|\s+(?=[A-Z]))',
        re.IGNORECASE
    )
    title = noise_start.sub('', title).strip()

    # Split on separators and pick the most likely company name part
    for sep in [' | ', ' – ', ' — ', ' - ']:
        parts = [p.strip() for p in title.split(sep) if p.strip()]
        if len(parts) >= 2:
            # Last part is usually the brand; first part if it looks like a page name
            last = parts[-1]
            first = parts[0]
            # If last part is short and looks like a company name, use it
            if len(last) < 60 and not re.search(r'\b(home|welcome|about|contact|product|service)\b', last, re.I):
                return last
            return first
    return title.strip()[:80] or domain_to_name(domain)


def domain_to_name(domain: str) -> str:
    """lxngen.com → LxNGen"""
    name = re.sub(r'\.(com|ca|net|org|io|co)$', '', domain, flags=re.I)
    name = re.sub(r'[-_.]', ' ', name)
    return name.strip().title()


def normalize_name(name: str) -> str:
    """Lowercase, strip legal suffixes and punctuation for fuzzy matching."""
    name = name.lower()
    name = re.sub(
        r'\b(inc|ltd|llc|corp|co|limited|incorporated|company|group|'
        r'international|industries|solutions|technologies|tech|manufacturing|'
        r'services|systems|enterprises|holdings|partners)\b\.?',
        '', name
    )
    name = re.sub(r'[^a-z0-9 ]', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


# ── Step 1: Download + Index Corporations Canada CSV ─────────────────────────

async def download_csv(client: httpx.AsyncClient, url: str, label: str) -> str:
    cache_file = CACHE_DIR / (label + ".csv")
    if cache_file.exists() and cache_file.stat().st_size > 1_000_000:
        print(f"  [cache] {label}.csv already downloaded ({cache_file.stat().st_size/1e6:.1f}MB)")
        return cache_file.read_text(encoding='utf-8-sig', errors='replace')
    print(f"  Downloading {label} ({url}) ...")
    r = await client.get(url, timeout=120)
    r.raise_for_status()
    cache_file.write_bytes(r.content)
    print(f"  Saved {label}.csv ({len(r.content)/1e6:.1f}MB)")
    return r.content.decode('utf-8-sig', errors='replace')


def build_corps_db(cbca_csv: str, other_csv: str):
    """Build a SQLite FTS5 database from both CSVs for fast lookup."""
    if CORPS_DB.exists() and CORPS_DB.stat().st_size > 1_000_000:
        print(f"  [cache] Corps DB already built ({CORPS_DB.stat().st_size/1e6:.1f}MB)")
        return

    print("  Building SQLite FTS5 index...")
    conn = sqlite3.connect(CORPS_DB)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS corps (
            corp_number TEXT,
            bn          TEXT,
            legal_name  TEXT,
            status      TEXT,
            province    TEXT,
            city        TEXT,
            postal_code TEXT,
            incorp_date TEXT,
            norm_name   TEXT
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_norm ON corps(norm_name)")

    def load_csv(text: str):
        reader = csv.DictReader(io.StringIO(text))
        rows = []
        for row in reader:
            name = (row.get('Corporate name - form 1') or '').strip()
            if not name or re.match(r'^\d+\s+CANADA', name, re.I):
                continue  # skip numbered companies
            rows.append((
                row.get('Corporation number', '').strip(),
                row.get('Business number (BN)', '').strip(),
                name,
                row.get('Status', '').strip(),
                row.get('Province/territory', '').strip(),
                row.get('City/town', '').strip(),
                row.get('Postal code', '').strip(),
                row.get('Anniversary date', '').strip(),
                normalize_name(name),
            ))
        return rows

    rows = load_csv(cbca_csv) + load_csv(other_csv)
    conn.executemany("INSERT INTO corps VALUES (?,?,?,?,?,?,?,?,?)", rows)
    conn.commit()
    conn.close()
    print(f"  Indexed {len(rows):,} corporations")


def lookup_corps(name: str, conn: sqlite3.Connection) -> dict | None:
    """Fuzzy-match a company name against the federal registry."""
    norm = normalize_name(name)
    if len(norm) < 3:
        return None

    # SQL prefix search first (fast)
    prefix = norm[:6]
    rows = conn.execute(
        "SELECT legal_name, norm_name, corp_number, bn, province, city, postal_code, incorp_date, status "
        "FROM corps WHERE norm_name LIKE ? LIMIT 200",
        (prefix + '%',)
    ).fetchall()

    if not rows:
        # Broader search — any word
        first_word = norm.split()[0] if norm.split() else norm
        rows = conn.execute(
            "SELECT legal_name, norm_name, corp_number, bn, province, city, postal_code, incorp_date, status "
            "FROM corps WHERE norm_name LIKE ? LIMIT 200",
            ('%' + first_word + '%',)
        ).fetchall()

    if not rows:
        return None

    candidates = [(r[0], r[1]) for r in rows]
    norm_candidates = [c[1] for c in candidates]
    match = fuzz_process.extractOne(norm, norm_candidates, scorer=fuzz.token_sort_ratio)
    if not match or match[1] < FUZZY_THRESHOLD:
        return None

    idx = match[2]
    r = rows[idx]
    return {
        "corp_number":  r[2],
        "bn":           r[3],
        "legal_name":   r[0],
        "province":     r[4],
        "city":         r[5],
        "postal_code":  r[6],
        "incorp_date":  r[7],
        "status":       r[8],
        "match_score":  match[1],
    }


# ── Step 2: Load scraped data ─────────────────────────────────────────────────

def load_homepage_titles() -> dict[str, dict]:
    """Load the homepage title + description per site from results_clean.jsonl."""
    site_data: dict[str, dict] = {}
    with open(RESULTS_FILE) as f:
        for line in f:
            try:
                r = json.loads(line)
                site = r.get('site', '')
                if not site:
                    continue
                depth = r.get('depth', 99)
                # Keep the shallowest page (homepage)
                if site not in site_data or depth < site_data[site]['depth']:
                    site_data[site] = {
                        'depth':       depth,
                        'title':       r.get('title', ''),
                        'description': r.get('description', ''),
                        'url':         r.get('url', ''),
                    }
            except Exception:
                pass
    return site_data


def load_done_sites() -> set[str]:
    """Sites already written to enrichment.jsonl (resumability)."""
    done = set()
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE) as f:
            for line in f:
                try:
                    done.add(json.loads(line)['site'])
                except Exception:
                    pass
    return done


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    t0 = time.time()
    print("\n════════════════════════════════════════")
    print("  NGen Enricher — Corporations Canada")
    print("════════════════════════════════════════\n")

    # Step 1: Download + index
    print("[1/4] Downloading Corporations Canada data...")
    async with httpx.AsyncClient(verify=False, follow_redirects=True) as client:
        cbca_csv  = await download_csv(client, CBCA_URL,  "cbca")
        other_csv = await download_csv(client, OTHER_URL, "other")

    print("\n[2/4] Building lookup index...")
    build_corps_db(cbca_csv, other_csv)
    db_conn = sqlite3.connect(CORPS_DB)

    # Step 2: Load scraped data
    print("\n[3/4] Loading scraped company data...")
    homepage_data = load_homepage_titles()
    done_sites    = load_done_sites()

    with open(SUMMARIES_FILE) as f:
        all_summaries = [json.loads(l) for l in f if l.strip()]

    # Deduplicate summaries
    seen, summaries = set(), []
    for s in all_summaries:
        k = s.get('homepage') or s.get('site')
        if k not in seen:
            seen.add(k)
            summaries.append(s)

    pending = [s for s in summaries if s['site'] not in done_sites]
    print(f"  {len(summaries):,} total sites | {len(done_sites):,} already enriched | {len(pending):,} to process")

    # Step 3: Enrich
    print(f"\n[4/4] Enriching {len(pending):,} companies...\n")
    matched, unmatched = 0, 0

    with open(OUTPUT_FILE, 'a') as out_f:
        for i, summary in enumerate(pending):
            site   = summary['site']
            hp     = homepage_data.get(site, {})
            title  = hp.get('title', '')
            desc   = hp.get('description', '')
            url    = summary.get('homepage', '')

            company_name = extract_company_name(title, site)
            corp_match   = lookup_corps(company_name, db_conn)

            record = {
                "site":            site,
                "homepage":        url,
                "extracted_name":  company_name,
                "corps_canada":    corp_match,
                "scraped_title":   title,
                "scraped_desc":    desc[:300] if desc else "",
                "pages_success":   summary.get('pages_success', 0),
                "total_words":     summary.get('total_word_count', 0),
                "blocked":         summary.get('blocked', False),
                "enriched_at":     time.time(),
            }

            out_f.write(json.dumps(record) + '\n')
            if corp_match:
                matched += 1
            else:
                unmatched += 1

            if (i + 1) % 500 == 0 or (i + 1) == len(pending):
                pct = (i + 1) / len(pending) * 100
                rate = (i + 1) / (time.time() - t0)
                print(f"  {i+1:>5}/{len(pending):,} ({pct:.0f}%) | matched: {matched} | no match: {unmatched} | {rate:.0f}/s")

    db_conn.close()
    elapsed = time.time() - t0
    print(f"\n✓ Done in {elapsed:.0f}s")
    print(f"  Matched:   {matched:,} / {len(pending):,} ({matched/max(len(pending),1)*100:.1f}%)")
    print(f"  No match:  {unmatched:,}")
    print(f"  Output:    {OUTPUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
