"""
NGen — Summary & Capabilities Enhancer
=======================================
Reads extracted.jsonl + raw scraped pages to generate:
  - summary:               5-8 sentence BI profile (what they are, scale, certs, customers, differentiation)
  - capabilities_enhanced: comprehensive deduplicated capabilities list from extraction + raw content

Uses Cohere Command R (not R+) — sufficient for synthesis, much cheaper.

Usage:
    export COHERE_API_KEY=your_key
    python3 generate_summaries.py

Output: out2/extracted_final.jsonl   (~$12, ~30 min)
Resumes automatically if interrupted.
"""

import asyncio, json, os, re, time
from pathlib import Path
import cohere
from extractor import select_pages, build_page_block, page_priority

OUT            = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/out2")
EXTRACTED_FILE = OUT / "extracted.jsonl"
RESULTS_FILE   = OUT / "results_clean.jsonl"
OUTPUT_FILE    = OUT / "extracted_final.jsonl"

MODEL       = "command-r-08-2024"   # cheaper than R+, good for synthesis
CONCURRENT  = 64
MAX_PAGES   = 5
CHARS_PAGE  = 1500


SUMMARY_PROMPT = """\
You are writing a business intelligence profile for a Canadian company.
Use ONLY the structured data and raw website content provided below.
Do not invent or assume anything not present in the inputs.

Return ONLY valid JSON with exactly two fields:

{
  "summary": "5-8 sentence profile covering: (1) what the company is and does, (2) specific capabilities or products, (3) scale — headcount, facility size, capacity, (4) certifications and compliance, (5) key customers or industries, (6) what makes them notable or differentiated. Be specific — name actual processes, materials, certifications, customers. No generic phrases like 'committed to quality' or 'customer-focused'. Never null.",
  "capabilities_enhanced": ["comprehensive deduplicated list — include everything from the structured extraction PLUS any additional specific capabilities found in the raw content. Be specific and granular. Group related items together. Remove vague duplicates."]
}

STRUCTURED EXTRACTION:
"""


def build_structured_block(r: dict) -> str:
    lines = []
    lines.append(f"Company:        {r.get('company_name')}")
    lines.append(f"Location:       {r.get('city')}, {r.get('province')}, Canada")
    lines.append(f"Type:           {r.get('company_type')} | Model: {r.get('business_model')}")
    lines.append(f"Founded:        {r.get('founded_year')} | Headcount: {r.get('headcount_range')} | Stage: {r.get('funding_stage')}")
    lines.append(f"Tagline:        {r.get('tagline')}")
    if r.get('capabilities'):
        lines.append(f"Capabilities:   {'; '.join(r['capabilities'])}")
    if r.get('specializations'):
        lines.append(f"Specializations:{'; '.join(r['specializations'])}")
    if r.get('products'):
        lines.append(f"Products:       {'; '.join(r['products'])}")
    if r.get('technology'):
        lines.append(f"Technology:     {'; '.join(r['technology'])}")
    if r.get('equipment'):
        lines.append(f"Equipment:      {'; '.join(r['equipment'])}")
    if r.get('capacity'):
        lines.append(f"Capacity:       {r['capacity']}")
    if r.get('materials'):
        lines.append(f"Materials:      {'; '.join(r['materials'])}")
    if r.get('industries_served'):
        lines.append(f"Industries:     {'; '.join(r['industries_served'])}")
    if r.get('certifications'):
        lines.append(f"Certifications: {'; '.join(r['certifications'])}")
    if r.get('key_customers'):
        lines.append(f"Key Customers:  {'; '.join(r['key_customers'])}")
    if r.get('export_compliance'):
        lines.append(f"Compliance:     {'; '.join(r['export_compliance'])}")
    if r.get('health_canada_registered'):
        lines.append(f"Health Canada:  Registered")
    return "\n".join(lines)


def parse_json(raw: str) -> dict:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    result = json.loads(raw)
    if isinstance(result, list):
        result = result[0] if result else {}
    return result if isinstance(result, dict) else {}


def load_all_pages() -> dict[str, list]:
    pages: dict[str, list] = {}
    print("  Loading raw scraped pages...")
    with open(RESULTS_FILE) as f:
        for line in f:
            try:
                r = json.loads(line)
                site = r.get("site", "")
                if site:
                    pages.setdefault(site, []).append(r)
            except Exception:
                pass
    print(f"  Loaded pages for {len(pages):,} sites")
    return pages


def load_extracted() -> list[dict]:
    records = []
    with open(EXTRACTED_FILE) as f:
        for line in f:
            try:
                records.append(json.loads(line))
            except Exception:
                pass
    return records


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


async def enhance_one(
    co: cohere.AsyncClientV2,
    record: dict,
    pages: list[dict],
    semaphore: asyncio.Semaphore,
) -> dict:
    async with semaphore:
        site = record.get("site", "")

        # Build structured block from extraction
        structured = build_structured_block(record)

        # Build raw page block — top 5 pages
        selected   = select_pages(pages, n=MAX_PAGES)
        page_block = build_page_block(selected)

        prompt = (
            SUMMARY_PROMPT
            + structured
            + "\n\nRAW WEBSITE CONTENT:\n"
            + page_block
        )

        enhanced = {}
        for attempt in range(4):
            try:
                resp = await co.chat(
                    model=MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.0,
                    max_tokens=900,
                )
                enhanced = parse_json(resp.message.content[0].text)
                break
            except json.JSONDecodeError as e:
                enhanced = {"_parse_error": str(e)[:80]}
                break
            except Exception as e:
                err = str(e)
                if "429" in err or "rate" in err.lower():
                    await asyncio.sleep(2 ** attempt)  # 1s, 2s, 4s backoff
                    continue
                enhanced = {"_error": err[:120]}
                break

        # Merge back into original record
        out = dict(record)
        out["summary"]               = enhanced.get("summary") or record.get("tagline")
        out["capabilities_enhanced"] = enhanced.get("capabilities_enhanced") or record.get("capabilities", [])
        out["enhanced_at"]           = time.time()
        return out


async def main():
    api_key = os.environ.get("COHERE_API_KEY")
    if not api_key:
        print("\nERROR: export COHERE_API_KEY=your_key\n")
        return

    t0 = time.time()
    print("\n════════════════════════════════════════════════════════")
    print("  NGen — Summary & Capabilities Enhancer")
    print("════════════════════════════════════════════════════════\n")

    all_pages = load_all_pages()
    records   = load_extracted()
    done      = load_done()

    # Only enhance records that extracted cleanly
    pending = [
        r for r in records
        if r.get("site") not in done
        and not r.get("_error")
        and r.get("capabilities")
    ]

    # Cost estimate: Command R $0.50/M input, $1.50/M output
    # ~2500 tokens in, ~600 out per company
    est_cost = len(pending) * (2500 * 0.50 + 600 * 1.50) / 1_000_000
    est_min  = len(pending) / CONCURRENT / 60 * 8

    print(f"  Records to enhance: {len(pending):,}  (already done: {len(done):,})")
    print(f"  Model:              {MODEL}  ($0.50/M in, $1.50/M out)")
    print(f"  Estimated cost:     ~${est_cost:.0f}")
    print(f"  Estimated time:     ~{est_min:.0f} min")
    print(f"  Output:             {OUTPUT_FILE}\n")

    co        = cohere.AsyncClientV2(api_key=api_key)
    semaphore = asyncio.Semaphore(CONCURRENT)

    processed = errors = parse_err = 0

    out_f = open(OUTPUT_FILE, "a")
    try:
        coros = [
            enhance_one(co, r, all_pages.get(r["site"], []), semaphore)
            for r in pending
        ]
        for coro in asyncio.as_completed(coros):
            result = await coro
            out_f.write(json.dumps(result) + "\n")
            out_f.flush()
            processed += 1
            if result.get("_error"):      errors    += 1
            if result.get("_parse_error"):parse_err += 1

            if processed % 100 == 0 or processed == len(pending):
                elapsed = time.time() - t0
                rate    = processed / elapsed * 60
                eta     = (len(pending) - processed) / max(processed / elapsed, 0.001) / 60
                cost    = processed * (2500 * 0.50 + 600 * 1.50) / 1_000_000
                print(
                    f"  {processed:>5}/{len(pending):,} | "
                    f"err: {errors} | {rate:.0f}/min | "
                    f"ETA {eta:.0f}min | ~${cost:.2f} spent"
                )
    finally:
        out_f.close()

    elapsed = time.time() - t0
    print(f"\n✓ Done in {elapsed/60:.1f} min")
    print(f"  Output: {OUTPUT_FILE}\n")

    # Show 2 sample summaries
    print("── Sample summaries ────────────────────────────────────────")
    with open(OUTPUT_FILE) as f:
        shown = 0
        for line in f:
            r = json.loads(line)
            if r.get("summary") and not r.get("_error") and shown < 2:
                print(f"\n  {r.get('company_name')}  ({r['site']})")
                print(f"  SUMMARY:")
                # Word-wrap at 80 chars
                words = r['summary'].split()
                line_buf, col = "    ", 4
                for w in words:
                    if col + len(w) > 84:
                        print(line_buf)
                        line_buf, col = "    " + w + " ", 4 + len(w) + 1
                    else:
                        line_buf += w + " "
                        col += len(w) + 1
                if line_buf.strip():
                    print(line_buf)
                print(f"\n  CAPABILITIES ENHANCED ({len(r.get('capabilities_enhanced',[]))} items):")
                for c in r.get("capabilities_enhanced", [])[:8]:
                    print(f"    • {c}")
                if len(r.get("capabilities_enhanced", [])) > 8:
                    print(f"    ... +{len(r['capabilities_enhanced'])-8} more")
                shown += 1


if __name__ == "__main__":
    asyncio.run(main())
