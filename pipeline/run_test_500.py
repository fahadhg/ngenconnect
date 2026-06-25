"""
NGen — 500-company test run
===========================
100 CORE/RELATED (2-pass) + 400 WEAK/NOISE (1-pass) ≈ $10

Usage:
    export COHERE_API_KEY=your_key
    python3 run_test_500.py

Output: out2/extracted_test500.jsonl
"""

import asyncio, json, os, time
from pathlib import Path
import cohere
from extractor import (
    extract_two_pass, extract_one_pass,
    load_classified, load_site_pages, load_summaries, load_jsonl,
    ENRICH_CORPS, ENRICH_HC, ENRICH_WEB,
    TIERS_TWO_PASS, TIERS_ONE_PASS,
    MODEL,
)

OUT         = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/out2")
OUTPUT_FILE = OUT / "extracted_test500.jsonl"
CONCURRENT  = 6
N_TWO_PASS  = 100
N_ONE_PASS  = 400


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
    api_key = os.environ.get("COHERE_API_KEY")
    if not api_key:
        print("\nERROR: export COHERE_API_KEY=your_key\n")
        return

    t0 = time.time()
    print("\n════════════════════════════════════════════════════")
    print("  NGen — 500-company test run  (~$10 budget)")
    print("════════════════════════════════════════════════════\n")

    print("Loading data...")
    tiers     = load_classified()
    all_pages = load_site_pages()
    summaries = load_summaries()
    corps_map = load_jsonl(ENRICH_CORPS)
    hc_map    = load_jsonl(ENRICH_HC)
    web_map   = load_jsonl(ENRICH_WEB)
    done      = load_done()

    # Sample: first N_TWO_PASS from CORE+RELATED, first N_ONE_PASS from WEAK+NOISE
    # Pick sites that have at least 1 page so there's something to extract
    two_sites = [
        s for s, t in tiers.items()
        if t in TIERS_TWO_PASS and len(all_pages.get(s, [])) >= 1 and s not in done
    ][:N_TWO_PASS]

    one_sites = [
        s for s, t in tiers.items()
        if t in TIERS_ONE_PASS and len(all_pages.get(s, [])) >= 1 and s not in done
    ][:N_ONE_PASS]

    already_done = len(done)
    total = len(two_sites) + len(one_sites)

    c2 = 7743 * 2.50/1e6 + 2000 * 10.0/1e6
    c1 = 3083 * 2.50/1e6 +  750 * 10.0/1e6
    est_cost = len(two_sites) * c2 + len(one_sites) * c1

    print(f"  CORE/RELATED (2-pass): {len(two_sites):>3} sites  ~${len(two_sites)*c2:.2f}")
    print(f"  WEAK/NOISE   (1-pass): {len(one_sites):>3} sites  ~${len(one_sites)*c1:.2f}")
    print(f"  Already done:          {already_done:>3} sites  (resuming)")
    print(f"  ────────────────────────────────────────────────")
    print(f"  Total:                 {total:>3} sites  ~${est_cost:.2f}")
    print(f"  Model:                 {MODEL}")
    print(f"  Output:                {OUTPUT_FILE}\n")

    co        = cohere.AsyncClientV2(api_key=api_key)
    semaphore = asyncio.Semaphore(CONCURRENT)

    def make_task(site: str, mode: str):
        s  = summaries.get(site, {})
        hp = s.get("homepage", f"https://{site}")
        pg = all_pages.get(site, [])
        fn = extract_two_pass if mode == "two" else extract_one_pass
        return fn(co, site, hp, pg, corps_map.get(site), hc_map.get(site), web_map.get(site), semaphore)

    tasks = [(s, "two") for s in two_sites] + [(s, "one") for s in one_sites]

    processed = two_done = one_done = errors = parse_err = 0

    out_f = open(OUTPUT_FILE, "a")
    try:
        for coro in asyncio.as_completed([make_task(s, m) for s, m in tasks]):
            r = await coro
            out_f.write(json.dumps(r) + "\n")
            out_f.flush()
            processed += 1

            mode = r.get("extraction_mode", "")
            if mode == "two_pass": two_done += 1
            if mode == "one_pass": one_done += 1
            if r.get("_error"):      errors    += 1
            if r.get("_parse_error"):parse_err += 1

            if processed % 25 == 0 or processed == total:
                elapsed = time.time() - t0
                rate    = processed / elapsed * 60
                eta     = (total - processed) / max(processed / elapsed, 0.001) / 60
                print(
                    f"  {processed:>3}/{total} | 2-pass:{two_done} 1-pass:{one_done} "
                    f"err:{errors} | {rate:.0f}/min | ETA {eta:.0f}min"
                )
    finally:
        out_f.close()

    elapsed = time.time() - t0
    print(f"\n✓ Done in {elapsed/60:.1f} min")
    print(f"  Output: {OUTPUT_FILE}")

    # Quality summary
    print("\n── Results by company type ─────────────────────────────────")
    type_counts: dict[str, int] = {}
    has_certs = has_products = has_tech = has_customers = 0
    total_read = 0

    with open(OUTPUT_FILE) as f:
        for line in f:
            r = json.loads(line)
            if r.get("_error"):
                continue
            total_read += 1
            ct = r.get("company_type", "unknown")
            type_counts[ct] = type_counts.get(ct, 0) + 1
            if r.get("certifications"):   has_certs    += 1
            if r.get("products"):         has_products += 1
            if r.get("technology"):       has_tech     += 1
            if r.get("key_customers"):    has_customers+= 1

    for ct, n in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  {ct:<30} {n:>4} companies")
    print(f"\n  Has certifications: {has_certs}/{total_read} ({has_certs/max(total_read,1)*100:.0f}%)")
    print(f"  Has products:       {has_products}/{total_read} ({has_products/max(total_read,1)*100:.0f}%)")
    print(f"  Has technology:     {has_tech}/{total_read} ({has_tech/max(total_read,1)*100:.0f}%)")
    print(f"  Has key customers:  {has_customers}/{total_read} ({has_customers/max(total_read,1)*100:.0f}%)")

    # Show 3 sample extractions
    print("\n── Sample extractions ──────────────────────────────────────")
    with open(OUTPUT_FILE) as f:
        shown = 0
        for line in f:
            r = json.loads(line)
            if r.get("capabilities") and not r.get("_error") and shown < 3:
                print(f"\n  [{r.get('extraction_mode','?')}] {r.get('company_name')}  ({r['site']})")
                print(f"  Type: {r.get('company_type')} | Model: {r.get('business_model')} | Stage: {r.get('funding_stage')}")
                print(f"  Tagline:    {(r.get('tagline') or '')[:140]}")
                print(f"  Capabilities: {r.get('capabilities',[])[:5]}")
                print(f"  Products:   {r.get('products',[])[:4]}")
                print(f"  Technology: {r.get('technology',[])[:4]}")
                print(f"  Certs:      {r.get('certifications',[])}")
                print(f"  Missing:    {r.get('certifications_not_found',[])[:5]}")
                shown += 1


if __name__ == "__main__":
    asyncio.run(main())
