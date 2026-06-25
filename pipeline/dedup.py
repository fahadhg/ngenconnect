"""
NGen — Deduplication + Merge
=============================
157 duplicate groups exist (www.X and X scraped separately).
Strategy:
  - Canonical domain = strip www., strip trailing /
  - For each duplicate group: merge into one record
  - List fields  → union of both, deduplicated, order preserved
  - Scalar fields → prefer 2-pass record; fall back to 1-pass if null
  - embed_text   → rebuilt from merged fields

Input:  out2/extracted.jsonl    (5,899 records, 158 dupes)
Output: out2/extracted_dedup.jsonl  (5,741 unique records)
"""

import json, re
from pathlib import Path
from collections import defaultdict

IN_FILE  = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/out2/extracted.jsonl")
OUT_FILE = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/out2/extracted_dedup.jsonl")

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


def build_embed_text(r: dict) -> str:
    parts = [r.get("company_name", "")]
    if r.get("tagline"):
        parts.append(r["tagline"])
    for label, field in [
        ("Capabilities", "capabilities"),
        ("Specializations", "specializations"),
        ("Products", "products"),
        ("Technology", "technology"),
        ("Equipment", "equipment"),
        ("Certifications", "certifications"),
        ("Materials", "materials"),
        ("Industries", "industries_served"),
        ("Customers", "key_customers"),
        ("Compliance", "export_compliance"),
    ]:
        v = r.get(field)
        if v:
            parts.append(f"{label}: {'; '.join(v)}")
    if r.get("business_model"):
        parts.append(f"Model: {r['business_model']}")
    city, prov = r.get("city"), r.get("province")
    if city or prov:
        parts.append(f"Location: {city}, {prov}, Canada")
    if r.get("capacity"):
        parts.append(f"Capacity: {r['capacity']}")
    return " | ".join(p for p in parts if p)


def merge(records: list[dict]) -> dict:
    if len(records) == 1:
        return records[0]

    # Primary = 2-pass if available, else record with more non-empty fields
    def richness(r):
        score = sum(1 for f in LIST_FIELDS if r.get(f)) + \
                sum(1 for f in SCALAR_FIELDS if r.get(f))
        if r.get("extraction_mode") == "two_pass":
            score += 20
        return score

    records = sorted(records, key=richness, reverse=True)
    primary, secondary = records[0], records[1]

    merged = dict(primary)

    # Union list fields
    for field in LIST_FIELDS:
        merged[field] = dedup_list(primary.get(field, []), secondary.get(field, []))

    # Fill null scalar fields from secondary
    for field in SCALAR_FIELDS:
        if not merged.get(field) and secondary.get(field):
            merged[field] = secondary[field]

    # Canonical site (non-www preferred)
    sites = [r["site"] for r in records]
    non_www = [s for s in sites if not s.startswith("www.")]
    merged["site"]     = non_www[0] if non_www else sites[0]
    merged["homepage"] = f"https://{merged['site']}"
    merged["merged_from"] = sites

    # Rebuild embed_text from merged data
    merged["embed_text"] = build_embed_text(merged)

    return merged


def main():
    records = []
    with open(IN_FILE) as f:
        for line in f:
            try:
                records.append(json.loads(line))
            except Exception:
                pass

    print(f"Loaded {len(records):,} records")

    # Group by canonical domain
    groups: dict[str, list] = defaultdict(list)
    for r in records:
        groups[canonical(r.get("site", ""))].append(r)

    dupes  = sum(1 for v in groups.values() if len(v) > 1)
    extras = sum(len(v) - 1 for v in groups.values())
    print(f"Duplicate groups: {dupes}  |  Extra records removed: {extras}")

    merged_records = [merge(v) for v in groups.values()]
    merged_records.sort(key=lambda r: r.get("site", ""))

    with open(OUT_FILE, "w") as f:
        for r in merged_records:
            f.write(json.dumps(r) + "\n")

    print(f"Written {len(merged_records):,} unique records → {OUT_FILE}")

    # Spot-check a merged record
    sample = next((r for r in merged_records if r.get("merged_from")), None)
    if sample:
        print(f"\nSample merge: {sample.get('company_name')} ({sample.get('site')})")
        print(f"  Merged from:  {sample['merged_from']}")
        print(f"  Capabilities: {len(sample.get('capabilities',[]))} items")
        print(f"  Products:     {sample.get('products',[])}")
        print(f"  Customers:    {sample.get('key_customers',[])}")
        print(f"  Certs:        {sample.get('certifications',[])}")


if __name__ == "__main__":
    main()
