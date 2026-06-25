"""
NGen Enricher — Health Canada GMP / Drug Manufacturers
=======================================================
Downloads all Canadian drug manufacturers from Health Canada's
public API and matches against our scraped companies.

Usage:  python3 enricher_health_canada.py
Output: out2/enrichment_hc.jsonl
"""

import asyncio, json, time
from pathlib import Path
import httpx
from rapidfuzz import fuzz, process as fuzz_process
from enricher import extract_company_name, normalize_name

OUT_DIR      = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/out2")
CACHE_DIR    = OUT_DIR / "enricher_cache"
OUTPUT_FILE  = OUT_DIR / "enrichment_hc.jsonl"
RESULTS_FILE = OUT_DIR / "results_clean.jsonl"
SUMMARIES    = OUT_DIR / "site_summaries.jsonl"

HC_API = "https://health-products.canada.ca/api/drug/company/?lang=en&type=json&limit=100000"
FUZZY_THRESHOLD = 85
CACHE_DIR.mkdir(parents=True, exist_ok=True)


async def fetch_hc_companies() -> list[dict]:
    cache = CACHE_DIR / "hc_companies.json"
    if cache.exists() and cache.stat().st_size > 10_000:
        print("  [cache] HC companies already downloaded")
        return json.loads(cache.read_text())

    print("  Downloading Health Canada company list...")
    async with httpx.AsyncClient(verify=False, timeout=60, follow_redirects=True) as client:
        r = await client.get(HC_API, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        data = r.json()

    canadian = [c for c in data if c.get("country_name") == "Canada"]
    cache.write_text(json.dumps(canadian))
    print(f"  {len(data):,} total returned | {len(canadian):,} Canadian")
    return canadian


def build_index(companies: list[dict]) -> list[tuple]:
    return [(normalize_name(c.get("company_name", "")), c)
            for c in companies if c.get("company_name", "").strip()]


def lookup(name: str, index: list[tuple]) -> dict | None:
    norm = normalize_name(name)
    if len(norm) < 3:
        return None
    norm_names = [row[0] for row in index]
    match = fuzz_process.extractOne(norm, norm_names, scorer=fuzz.token_sort_ratio)
    if not match or match[1] < FUZZY_THRESHOLD:
        return None
    rec = index[match[2]][1]
    return {
        "hc_company_name": rec.get("company_name"),
        "hc_company_type": rec.get("company_type"),
        "hc_province":     rec.get("province_name"),
        "hc_city":         rec.get("city_name"),
        "hc_postal_code":  rec.get("postal_code"),
        "hc_match_score":  match[1],
    }


def load_titles() -> dict[str, str]:
    titles: dict[str, tuple] = {}
    with open(RESULTS_FILE) as f:
        for line in f:
            try:
                r = json.loads(line)
                site, depth = r.get("site", ""), r.get("depth", 99)
                if site and (site not in titles or depth < titles[site][1]):
                    titles[site] = (r.get("title", ""), depth)
            except Exception:
                pass
    return {s: v[0] for s, v in titles.items()}


def load_done() -> set[str]:
    done: set[str] = set()
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE) as f:
            for line in f:
                try:
                    done.add(json.loads(line)["site"])
                except Exception:
                    pass
    return done


async def main():
    t0 = time.time()
    print("\n════════════════════════════════════════")
    print("  NGen Enricher — Health Canada GMP")
    print("════════════════════════════════════════\n")

    print("[1/3] Fetching Health Canada manufacturers...")
    companies = await fetch_hc_companies()
    index     = build_index(companies)
    print(f"  Index: {len(index):,} Canadian companies\n")

    print("[2/3] Loading scraped sites...")
    titles = load_titles()
    done   = load_done()

    seen, summaries = set(), []
    with open(SUMMARIES) as f:
        for line in f:
            try:
                s = json.loads(line)
                k = s.get("homepage") or s.get("site")
                if k not in seen:
                    seen.add(k)
                    summaries.append(s)
            except Exception:
                pass

    pending = [s for s in summaries if s["site"] not in done]
    print(f"  {len(summaries):,} total | {len(done):,} done | {len(pending):,} to process\n")

    print(f"[3/3] Matching against Health Canada...\n")
    matched = 0

    with open(OUTPUT_FILE, "a") as f:
        for i, summary in enumerate(pending):
            site  = summary["site"]
            name  = extract_company_name(titles.get(site, ""), site)
            match = lookup(name, index)

            f.write(json.dumps({
                "site":           site,
                "homepage":       summary.get("homepage", ""),
                "extracted_name": name,
                "health_canada":  match,
                "enriched_at":    time.time(),
            }) + "\n")

            if match:
                matched += 1

            if (i + 1) % 1000 == 0 or (i + 1) == len(pending):
                pct = (i + 1) / len(pending) * 100
                print(f"  {i+1:>5}/{len(pending):,} ({pct:.0f}%) | matched: {matched} | {(i+1)/(time.time()-t0):.0f}/s")

    print(f"\n✓ Done in {time.time()-t0:.0f}s")
    print(f"  HC GMP matched: {matched:,} / {len(pending):,} ({matched/max(len(pending),1)*100:.1f}%)")
    print(f"  Output: {OUTPUT_FILE}")

    # Quick sample of matches
    print("\n── Sample matches ──────────────────────────────")
    with open(OUTPUT_FILE) as f:
        count = 0
        for line in f:
            r = json.loads(line)
            hc = r.get("health_canada")
            if hc and hc["hc_match_score"] >= 90:
                print(f"  {r['extracted_name']:<35} → {hc['hc_company_name']:<35} {hc['hc_province']} / {hc['hc_city']} [{hc['hc_company_type']}]")
                count += 1
                if count >= 8:
                    break


if __name__ == "__main__":
    asyncio.run(main())
