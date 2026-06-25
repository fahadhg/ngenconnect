"""
NGen — Embedding Pipeline
==========================
1. Deduplicates extracted_final.jsonl (www vs non-www)
2. Rebuilds embed_text to include summary + capabilities_enhanced
3. Batches through Cohere Embed v4 (search_document)
4. Validates every record has a vector
5. Writes extracted_embedded.jsonl — final file ready for Supabase

Resume-safe: skips already-embedded sites if interrupted.

Usage:
    export COHERE_API_KEY=your_key
    python3 embed.py

Cost: ~$0.30  |  Time: ~5 min
"""

import json, os, re, time
from pathlib import Path
from collections import defaultdict
import cohere

OUT            = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/out2")
FINAL_FILE     = OUT / "extracted_final.jsonl"
OUTPUT_FILE    = OUT / "extracted_embedded.jsonl"

MODEL          = "embed-v4.0"
INPUT_TYPE     = "search_document"
BATCH_SIZE     = 90       # Cohere max is 96
MAX_EMBED_CHARS = 10000   # Cohere embed-v4 supports 128k tokens; 10k captures all signals

LIST_FIELDS = [
    "capabilities", "specializations", "products", "technology",
    "equipment", "materials", "industries_served", "certifications",
    "certifications_not_found", "key_customers", "export_compliance",
]
SCALAR_FIELDS = [
    "company_name", "city", "province", "tagline", "capacity",
    "headcount_range", "founded_year", "company_type", "business_model",
    "funding_stage", "languages", "health_canada_registered",
]


# ── Dedup helpers ────────────────────────────────────────────────────────────

def canonical(site: str) -> str:
    s = re.sub(r"^www\.", "", site.lower().strip())
    return re.sub(r"/$", "", s)

def to_list(v) -> list:
    if isinstance(v, list):  return v
    if isinstance(v, str) and v.strip(): return [v]
    return []

def dedup_list(a, b) -> list:
    seen, out = set(), []
    for item in to_list(a) + to_list(b):
        key = item.lower().strip() if isinstance(item, str) else str(item)
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out

def richness(r: dict) -> int:
    score = sum(1 for f in LIST_FIELDS if r.get(f)) + \
            sum(1 for f in SCALAR_FIELDS if r.get(f))
    if r.get("extraction_mode") == "two_pass": score += 20
    if r.get("summary"):                        score += 10
    return score

def merge(records: list[dict]) -> dict:
    if len(records) == 1:
        return records[0]
    records = sorted(records, key=richness, reverse=True)
    primary, secondary = records[0], records[1]
    merged = dict(primary)
    for field in LIST_FIELDS:
        merged[field] = dedup_list(primary.get(field, []), secondary.get(field, []))
    # capabilities_enhanced — union too
    merged["capabilities_enhanced"] = dedup_list(
        primary.get("capabilities_enhanced", []),
        secondary.get("capabilities_enhanced", []),
    )
    # summary — prefer primary (richer)
    if not merged.get("summary") and secondary.get("summary"):
        merged["summary"] = secondary["summary"]
    for field in SCALAR_FIELDS:
        if not merged.get(field) and secondary.get(field):
            merged[field] = secondary[field]
    sites = [r["site"] for r in records]
    non_www = [s for s in sites if not s.startswith("www.")]
    merged["site"]       = non_www[0] if non_www else sites[0]
    merged["homepage"]   = f"https://{merged['site']}"
    merged["merged_from"] = sites
    return merged

def dedup_records(records: list[dict]) -> list[dict]:
    groups: dict[str, list] = defaultdict(list)
    for r in records:
        groups[canonical(r.get("site", ""))].append(r)
    dupes  = sum(1 for v in groups.values() if len(v) > 1)
    extras = sum(len(v) - 1 for v in groups.values())
    print(f"  Duplicate groups: {dupes}  |  Extra records removed: {extras}")
    return [merge(v) for v in groups.values()]


# ── Embed text builder ───────────────────────────────────────────────────────

def build_embed_text(r: dict) -> str:
    """
    Field order: identity → markets/customers → compliance → capabilities → products → tech/materials
    High-signal fields first so truncation (if any) never cuts the most important signals.
    """
    parts = [r.get("company_name", "")]
    if r.get("tagline"):
        parts.append(r["tagline"])
    if r.get("summary"):
        parts.append(r["summary"])
    # 1. Markets & customers — who they serve (high signal for defence/sector queries)
    if r.get("industries_served"):
        parts.append(f"Industries: {'; '.join(r['industries_served'])}")
    if r.get("key_customers"):
        parts.append(f"Key Customers: {'; '.join(r['key_customers'])}")
    # 2. Compliance — certifications & export (high signal for cert-gated queries)
    if r.get("certifications"):
        parts.append(f"Certifications: {'; '.join(r['certifications'])}")
    if r.get("export_compliance"):
        parts.append(f"Compliance: {'; '.join(r['export_compliance'])}")
    # 3. Capabilities
    if r.get("capabilities_enhanced"):
        parts.append(f"Capabilities: {'; '.join(r['capabilities_enhanced'])}")
    if r.get("specializations"):
        parts.append(f"Specializations: {'; '.join(r['specializations'])}")
    # 4. Products & technology
    if r.get("products"):
        parts.append(f"Products: {'; '.join(r['products'])}")
    if r.get("technology"):
        parts.append(f"Technology: {'; '.join(r['technology'])}")
    # 5. Materials & equipment
    if r.get("materials"):
        parts.append(f"Materials: {'; '.join(r['materials'])}")
    if r.get("equipment"):
        parts.append(f"Equipment: {'; '.join(r['equipment'])}")
    if r.get("capacity"):
        parts.append(f"Capacity: {r['capacity']}")
    # 6. Business context
    if r.get("business_model"):
        parts.append(f"Model: {r['business_model']}")
    city, prov = r.get("city"), r.get("province")
    if city or prov:
        parts.append(f"Location: {city}, {prov}, Canada")
    text = " | ".join(p for p in parts if p)
    return text[:MAX_EMBED_CHARS]


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    api_key = os.environ.get("COHERE_API_KEY")
    if not api_key:
        print("\nERROR: export COHERE_API_KEY=your_key\n")
        return

    t0 = time.time()
    print("\n════════════════════════════════════════════════════════")
    print("  NGen — Embedding Pipeline")
    print("════════════════════════════════════════════════════════\n")

    # Load
    print("  Loading extracted_final.jsonl...")
    records = []
    with open(FINAL_FILE) as f:
        for line in f:
            try:
                r = json.loads(line)
                if not r.get("_error") and not r.get("_parse_error"):
                    records.append(r)
            except Exception:
                pass
    print(f"  Loaded {len(records):,} records")

    # Dedup
    print("  Deduplicating...")
    records = dedup_records(records)
    print(f"  After dedup: {len(records):,} unique records")

    # Rebuild embed_text with summary included
    for r in records:
        r["embed_text"] = build_embed_text(r)

    # Load already-embedded sites (resume)
    done_sites: set[str] = set()
    done_records: list[dict] = []
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE) as f:
            for line in f:
                try:
                    r = json.loads(line)
                    done_sites.add(r["site"])
                    done_records.append(r)
                except Exception:
                    pass
        print(f"  Already embedded: {len(done_sites):,} (resuming)")

    pending = [r for r in records if r.get("site") not in done_sites]

    # Cost estimate: embed-v4 $0.10/M tokens, ~500 tokens per record
    est_tokens = len(pending) * 500
    est_cost   = est_tokens * 0.10 / 1_000_000
    print(f"\n  To embed:   {len(pending):,}")
    print(f"  Model:      {MODEL}  ($0.10/M tokens)")
    print(f"  Est. cost:  ~${est_cost:.2f}")
    print(f"  Output:     {OUTPUT_FILE}\n")

    co = cohere.ClientV2(api_key=api_key)

    embedded_records: list[dict] = list(done_records)
    errors = 0

    # Batch embed
    batches = [pending[i:i+BATCH_SIZE] for i in range(0, len(pending), BATCH_SIZE)]
    for i, batch in enumerate(batches):
        texts = [r["embed_text"] for r in batch]

        for attempt in range(4):
            try:
                resp = co.embed(
                    texts=texts,
                    model=MODEL,
                    input_type=INPUT_TYPE,
                    embedding_types=["float"],
                )
                vectors = resp.embeddings.float_
                break
            except Exception as e:
                err = str(e)
                if ("429" in err or "rate" in err.lower()) and attempt < 3:
                    wait = 2 ** attempt
                    print(f"  Rate limit — waiting {wait}s (attempt {attempt+1})")
                    time.sleep(wait)
                    continue
                print(f"  ERROR batch {i}: {err[:100]}")
                vectors = [None] * len(batch)
                errors += len(batch)
                break

        # Validate — every record must have a vector
        for record, vec in zip(batch, vectors):
            if vec is None:
                record["_embed_error"] = True
                errors += 1
            else:
                record["embedding"] = vec
            embedded_records.append(record)

        # Progress
        done_count = (i + 1) * BATCH_SIZE
        if (i + 1) % 10 == 0 or (i + 1) == len(batches):
            elapsed = time.time() - t0
            pct     = min(done_count / len(pending) * 100, 100)
            cost    = (i + 1) * BATCH_SIZE * 500 * 0.10 / 1_000_000
            print(f"  Batch {i+1:>3}/{len(batches)} | {pct:.0f}% | err: {errors} | ~${cost:.3f}")

    # Write all at once — atomically overwrite
    tmp = OUTPUT_FILE.with_suffix(".tmp")
    with open(tmp, "w") as f:
        for r in embedded_records:
            f.write(json.dumps(r) + "\n")
    tmp.rename(OUTPUT_FILE)

    elapsed = time.time() - t0
    missing = sum(1 for r in embedded_records if r.get("_embed_error"))
    print(f"\n✓ Done in {elapsed:.1f}s")
    print(f"  Total records: {len(embedded_records):,}")
    print(f"  With vectors:  {len(embedded_records) - missing:,}")
    print(f"  Missing:       {missing}")
    print(f"  Output:        {OUTPUT_FILE}\n")

    if missing:
        print(f"  ⚠ {missing} records missing embeddings — re-run embed.py to retry\n")

    # Spot-check
    sample = next((r for r in embedded_records if r.get("embedding")), None)
    if sample:
        vec = sample["embedding"]
        print(f"  Sample: {sample.get('company_name')} → vector dim={len(vec)}, first3={vec[:3]}")


if __name__ == "__main__":
    main()
