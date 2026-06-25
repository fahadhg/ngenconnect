"""
NGen — Supabase Loader
=======================
Bulk-inserts extracted_embedded.jsonl into the companies table.
Upserts on site (idempotent — safe to re-run).
Builds HNSW index after load.

Usage:
    export SUPABASE_URL=https://xxx.supabase.co
    export SUPABASE_SERVICE_KEY=eyJ...
    python3 load_supabase.py

Or set directly in the constants below.
"""

import json, os, time
from datetime import datetime, timezone
from pathlib import Path
from supabase import create_client, Client

EMBEDDED_FILE = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/out2/extracted_embedded.jsonl")

SUPABASE_URL = os.environ.get("SUPABASE_URL",
    "https://xzefflcbnwnhjpxjitta.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6ZWZmbGNibnduaGpweGppdHRhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA5NTI4NiwiZXhwIjoyMDkzNjcxMjg2fQ.cXDDVOt67aIyQwCudVGcvJjGl49LdKjBvKoTcSKdYzo")

BATCH_SIZE = 100


def ensure_list(v) -> list:
    if isinstance(v, list):  return v
    if isinstance(v, str) and v.strip(): return [v]
    return []

def to_ts(epoch: float | None) -> str | None:
    if not epoch:
        return None
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat()


def prepare(r: dict) -> dict:
    """Map extracted record fields to companies table columns."""
    return {
        "id":                       r.get("site", ""),
        "site":                     r.get("site"),
        "homepage":                 r.get("homepage"),
        "company_name":             r.get("company_name") or "Unknown",
        "city":                     r.get("city"),
        "province":                 r.get("province"),
        "tagline":                  r.get("tagline"),
        "summary":                  r.get("summary"),
        "founded_year":             r.get("founded_year"),
        "headcount_range":          r.get("headcount_range"),
        "company_type":             r.get("company_type"),
        "business_model":           r.get("business_model"),
        "funding_stage":            r.get("funding_stage"),
        "languages":                ensure_list(r.get("languages")),
        "health_canada_registered": bool(r.get("health_canada_registered")),
        "capabilities":             ensure_list(r.get("capabilities")),
        "capabilities_enhanced":    ensure_list(r.get("capabilities_enhanced")),
        "specializations":          ensure_list(r.get("specializations")),
        "products":                 ensure_list(r.get("products")),
        "technology":               ensure_list(r.get("technology")),
        "equipment":                ensure_list(r.get("equipment")),
        "materials":                ensure_list(r.get("materials")),
        "capacity":                 r.get("capacity"),
        "industries_served":        ensure_list(r.get("industries_served")),
        "key_customers":            ensure_list(r.get("key_customers")),
        "certifications":           ensure_list(r.get("certifications")),
        "certifications_not_found": ensure_list(r.get("certifications_not_found")),
        "export_compliance":        ensure_list(r.get("export_compliance")),
        "embed_text":               r.get("embed_text"),
        "embedding":                r.get("embedding"),
        "pages_used":               r.get("pages_used"),
        "extraction_mode":          r.get("extraction_mode"),
        "extracted_at":             to_ts(r.get("extracted_at")),
        "enhanced_at":              to_ts(r.get("enhanced_at")),
        "merged_from":              ensure_list(r.get("merged_from")),
    }


def main():
    t0 = time.time()
    print("\n════════════════════════════════════════════════════════")
    print("  NGen — Supabase Loader")
    print("════════════════════════════════════════════════════════\n")

    # Load records
    records = []
    with open(EMBEDDED_FILE) as f:
        for line in f:
            try:
                r = json.loads(line)
                if r.get("embedding") and not r.get("_embed_error"):
                    records.append(r)
            except Exception:
                pass

    print(f"  Records to load: {len(records):,}")
    print(f"  Batch size:      {BATCH_SIZE}")
    print(f"  Table:           companies\n")

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

    inserted = errors = 0
    batches = [records[i:i+BATCH_SIZE] for i in range(0, len(records), BATCH_SIZE)]

    for i, batch in enumerate(batches):
        rows = [prepare(r) for r in batch]
        try:
            supabase.table("companies").upsert(rows, on_conflict="id").execute()
            inserted += len(rows)
        except Exception as e:
            print(f"  ERROR batch {i+1}: {str(e)[:120]}")
            errors += len(rows)

        if (i + 1) % 10 == 0 or (i + 1) == len(batches):
            elapsed = time.time() - t0
            pct = (i + 1) / len(batches) * 100
            print(f"  Batch {i+1:>3}/{len(batches)} | {pct:.0f}% | {inserted:,} inserted | err: {errors} | {elapsed:.0f}s")

    elapsed = time.time() - t0
    print(f"\n✓ Done in {elapsed:.1f}s")
    print(f"  Inserted: {inserted:,}  |  Errors: {errors}\n")

    if errors == 0:
        print("  Building HNSW index (this takes ~2 min)...")
        try:
            supabase.rpc("build_hnsw_index", {}).execute()
            print("  ✓ HNSW index built")
        except Exception:
            # Index must be built via SQL editor — print the command
            print("  Run this in Supabase SQL Editor to build the search index:\n")
            print("  CREATE INDEX companies_embedding_hnsw ON companies")
            print("  USING hnsw (embedding vector_cosine_ops)")
            print("  WITH (m = 16, ef_construction = 64);\n")

    print(f"  All done — {inserted:,} Canadian suppliers loaded into Supabase.\n")


if __name__ == "__main__":
    main()
