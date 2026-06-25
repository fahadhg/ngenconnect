"""
NGen Extractor — Tiered Two-Pass / One-Pass Extraction
=======================================================
CORE + RELATED  → 2 calls: fact extraction then schema fill
WEAK + NOISE    → 1 call:  direct schema fill (shorter, cheaper)
NO_DATA         → skipped  (no pages to extract from)

Usage:
    export COHERE_API_KEY=your_key
    python3 extractor.py

Output: out2/extracted.jsonl   (~$115 total, ~120 min)
Resumes automatically if interrupted.
"""

import asyncio, json, os, re, time
from pathlib import Path
import cohere
from enricher import extract_company_name

OUT          = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/out2")
RESULTS_FILE = OUT / "results_clean.jsonl"
SUMMARIES    = OUT / "site_summaries.jsonl"
CLASS_FILE   = OUT / "classification.jsonl"
ENRICH_CORPS = OUT / "enrichment.jsonl"
ENRICH_HC    = OUT / "enrichment_hc.jsonl"
ENRICH_WEB   = OUT / "enrichment_web.jsonl"
OUTPUT_FILE  = OUT / "extracted.jsonl"

MODEL        = "command-r-plus-08-2024"
CONCURRENT   = 12
MAX_PAGES    = 10
CHARS_PER_PAGE = 2000

TIERS_TWO_PASS  = {"CORE", "RELATED"}      # full 2-call extraction
TIERS_ONE_PASS  = {"WEAK", "NOISE"}       # single call, lighter prompt
TIERS_SKIP      = {"NO_DATA"}             # skip — no pages scraped

CERT_CHECKLIST = [
    "ISO 9001", "ISO 14001", "ISO 13485", "ISO 45001", "ISO 27001",
    "AS9100", "AS9120", "AS9110",
    "NADCAP", "IATF 16949",
    "GMP", "Health Canada GMP",
    "SQF", "BRC", "HACCP",
    "CSA", "UL", "CE Marking",
    "ASME", "R2",
    "ITAR registered", "CCATS",
]

PAGE_PRIORITY = {
    "capabilities": 10, "capability": 10,
    "services":      9,  "service":    9,
    "manufacturing": 10,
    "products":      8,  "product":    8,
    "certif":        10, "quality":    9, "iso": 9,
    "about":         7,  "company":    6, "who": 5,
    "equipment":     9,  "machines":   8, "tech": 6,
    "aerospace":     8,  "defense":    8, "defence": 8,
    "materials":     7,  "export":     6, "itar": 9,
    "news":          3,  "blog":       2,
    "contact":       2,  "privacy":    0, "legal": 0, "career": 1,
}


# ── Page selection ────────────────────────────────────────────────────────────

def page_priority(page: dict) -> int:
    url   = (page.get("url") or "").lower()
    depth = page.get("depth", 99)
    score = 0
    for kw, pts in PAGE_PRIORITY.items():
        if kw in url:
            score = max(score, pts)
    if depth == 0 or url.rstrip("/").count("/") <= 2:
        score = max(score, 8)
    score -= depth
    if len((page.get("fit_markdown") or "").split()) < 50:
        score -= 5
    return score


def select_pages(pages: list[dict], n: int = MAX_PAGES) -> list[dict]:
    scored = sorted(pages, key=page_priority, reverse=True)
    seen: set[str] = set()
    out: list[dict] = []
    for p in scored:
        slug = "/".join((p.get("url") or "").lower().rstrip("/").split("/")[:4])
        if slug not in seen:
            seen.add(slug)
            out.append(p)
        if len(out) >= n:
            break
    return out


# ── Input builders ────────────────────────────────────────────────────────────

def build_page_block(pages: list[dict]) -> str:
    blocks = []
    for p in pages:
        text = (p.get("fit_markdown") or "")[:CHARS_PER_PAGE]
        if text.strip():
            blocks.append(
                f"=== PAGE: {p.get('title','')} | {p.get('url','')} ===\n{text}"
            )
    return "\n\n".join(blocks)


def build_enrichment_block(corps: dict | None, hc: dict | None, web: dict | None) -> str:
    lines = []
    if corps and corps.get("corps_canada"):
        c = corps["corps_canada"]
        lines.append(
            f"[Corporations Canada] Legal: {c.get('legal_name')} | "
            f"Province: {c.get('province')} | City: {c.get('city')} | "
            f"Founded: {(c.get('incorp_date') or '')[:4]} | Status: {c.get('status')}"
        )
    if hc and hc.get("health_canada"):
        h = hc["health_canada"]
        lines.append(
            f"[Health Canada GMP] {h.get('hc_company_name')} | "
            f"Type: {h.get('hc_company_type')} | Province: {h.get('hc_province')}"
        )
    if web:
        k = web.get("kompass") or {}
        if k:
            lines.append(
                f"[Kompass] Employees: {k.get('employees')} | "
                f"Founded: {k.get('year_founded')} | "
                f"SIC: {', '.join(k.get('sic_codes', []))} | "
                f"Address: {k.get('address')} | "
                f"Categories: {', '.join(k.get('categories', []))}"
            )
        if web.get("employees"):
            lines.append(f"[Web] Employees: {web['employees']}")
        if web.get("certs"):
            lines.append(f"[Web] Certs found on 3rd-party sites: {', '.join(web['certs'].keys())}")
        if web.get("contracts"):
            lines.append(f"[Web] Contracts/awards: {' | '.join(web['contracts'][:2])}")
        if web.get("news"):
            lines.append(f"[Web] News: {' | '.join(web['news'][:2])}")
    return "\n".join(lines)


# ── Prompts ───────────────────────────────────────────────────────────────────

CALL1_FACT_PROMPT = """\
You are reading a Canadian company's website and external data sources.
Extract every factual claim — do not summarize, do not infer, do not generalize.
Only include what is explicitly stated. One fact per line, prefixed with category.
This applies to ALL company types: manufacturers, distributors, tech startups, SaaS, biotech, cleantech, engineering services, consulting firms — capture everything relevant.

Categories to extract:
IDENTITY       — official name, city, province, founding year, employee count, sq footage, funding stage
CAPABILITIES   — every specific process, service, or capability mentioned (manufacturing ops, software features, consulting services, R&D activities — anything)
PRODUCTS       — physical products made or sold, software products, SaaS platforms, APIs, product lines distributed, branded goods carried
TECHNOLOGY     — software platforms, proprietary technology, patents, IP, algorithms, tech stack, hardware developed
EQUIPMENT      — specific machines, tools, lab equipment, systems named (brand/model if given)
CAPACITY       — production volume, shifts, throughput, lead times, server capacity, delivery timelines
MATERIALS      — every material, alloy, grade, chemical, biological input mentioned
CERTIFICATIONS — every standard, cert, approval, registration, accreditation explicitly stated
INDUSTRIES     — every end market, industry, vertical, or sector mentioned
CUSTOMERS      — named customers, partners, OEM relationships, reseller agreements, program names
BUSINESS_MODEL — how they make money: contract manufacturing, SaaS subscription, licensing, distribution, consulting, project-based, grant-funded R&D
COMPLIANCE     — ITAR, CCATS, export controls, military clearances, regulatory approvals (FDA, Health Canada, Transport Canada, etc.)
LANGUAGE       — primary language(s) of the website

If something is NOT mentioned, do not include it — absence is important for the next step.

COMPANY DATA:
"""

CALL2_SCHEMA_PROMPT = """\
Fill this company profile using ONLY the verified facts below. Do not infer or assume.

COMPANY NAME RULE: Use the legal/official company name found in the facts.
If the domain is "protocase.com" and the facts mention "Protocase", use "Protocase Inc." not
a different company name that appeared incidentally on the page.

TAGLINE RULE: You MUST write a 2-3 sentence tagline. Never return null or empty string.
Write it for a procurement manager evaluating this company as a supplier.
Name actual processes, materials, and industries. Example of good tagline:
"JGW Machine is a full-service metal fabrication shop certified to ISO 9001, ISO 13485, and IATF
16949, specializing in laser cutting, robotic welding, and powder coating for automotive and
industrial customers. Founded in 1953 and operating from Princeton, Ontario, they offer contract
manufacturing from prototype through production."

CERTIFICATION CHECKLIST — for certifications_not_found, use FAMILY MATCHING:
- If facts contain "AS9100" in ANY form (AS9100D, AS9100 Rev D, AS9100:2016), do NOT list AS9100 variants as missing
- If facts contain "ISO 9001" in ANY form (ISO 9001:2015, ISO 9001-2015, ISO 9001 certified), do NOT list ISO 9001 as missing
- If facts contain "ISO" generically without a number, list specific ISO standards as missing
- Only list a cert as missing if there is zero mention of it or its family
""" + "\n".join(f"- {c}" for c in CERT_CHECKLIST) + """

Return ONLY valid JSON. No markdown fences. No explanation.
For any field with no evidence in the facts, use null (scalars) or [] (arrays). Never omit a field.

{
  "company_name": "official company name — use the brand name on the website, not a page title",
  "city": "city or null",
  "province": "2-letter code e.g. ON, QC, BC or null",
  "tagline": "REQUIRED — 2-3 sentences, never null, never empty. For any company type: name what they make/do, who they serve, and what makes them distinct.",

  "capabilities": ["every specific capability regardless of company type: CNC milling, SaaS analytics, genomic sequencing, customs brokerage, RF circuit design — all go here"],
  "specializations": ["narrow niches or unique differentiators: airfoil milling, single-cell RNA seq, cold-chain pharma distribution, quantum-safe encryption"],

  "products": ["physical products manufactured or sold, software products, SaaS platforms, APIs, product lines distributed — e.g. 'AutoStore warehouse robot', 'graphene oxide powder', 'predictive maintenance SaaS'"],
  "technology": ["proprietary tech, patents, algorithms, platforms, hardware developed, tech stack if notable — e.g. 'QKD photonic chip', 'spray cooling patent CA2948432', 'built on AWS + PyTorch'"],

  "equipment": ["specific machines, instruments, lab equipment with brand+model if mentioned — null for pure software/services companies"],
  "capacity": "capacity signals: sq footage, machine count, shifts, production volume, server throughput, delivery timelines — or null",
  "materials": ["materials, alloys, chemicals, biological inputs, grades — e.g. Ti-6Al-4V, graphene oxide, mRNA lipid nanoparticles — [] if none"],

  "industries_served": ["every end market, vertical, sector — e.g. aerospace, automotive, SaaS HR, agricultural biotech, municipal water"],
  "key_customers": ["named customers, partners, OEMs, resellers, distribution agreements, notable programs"],

  "certifications": ["exactly as stated — e.g. ISO 9001:2015, AS9100D, FDA 510(k), SOC 2 Type II, Transport Canada AMO"],
  "certifications_not_found": ["certs from checklist NOT in the facts"],
  "export_compliance": ["ITAR registered, CCATS, EAR99, FDA export, Transport Canada approvals, or other regulatory export controls"],

  "business_model": "MUST be exactly one of: contract_manufacturing | saas | licensing | distribution | engineering_services | consulting | research_and_development | grant_funded | other",
  "funding_stage": "MUST be exactly one of: bootstrapped | pre-seed | seed | series_a | series_b | growth | public | null",

  "headcount_range": "MUST be exactly one of: 1-10 | 11-50 | 51-200 | 201-500 | 500+ | null",
  "founded_year": 1995,
  "company_type": "MUST be exactly one of: manufacturer | distributor | engineering_services | technology | biotech | cleantech | other",
  "languages": ["en", "fr"],
  "health_canada_registered": true
}

ENUM RULE: business_model, funding_stage, headcount_range, and company_type MUST be one of the exact values listed above. Do not combine, invent, or modify them. If unsure, use "other" or null.

VERIFIED FACTS:
"""

CALL1_WEAK_PROMPT = """\
Extract a structured profile from this company's website. Works for any company type:
manufacturers, distributors, SaaS, biotech, cleantech, engineering services, startups.
Use only what is explicitly stated. Return ONLY valid JSON, no markdown fences.
For any field with no evidence, use null (scalars) or [] (arrays). Never omit a field.

{
  "company_name": "official name",
  "city": "city or null",
  "province": "2-letter code or null",
  "tagline": "1-2 sentence description of what they make, sell, or do and who they serve",

  "capabilities": ["specific processes, services, or features — works for any company type"],
  "products": ["physical products, software products, SaaS platforms, product lines distributed — [] if none"],
  "technology": ["proprietary tech, patents, platforms, algorithms, hardware — [] if none"],
  "materials": ["materials, chemicals, biological inputs, alloys — [] if none"],
  "industries_served": ["industries, verticals, or sectors served"],

  "equipment": ["specific machines, instruments, tools with brand/model if mentioned — [] if none"],
  "capacity": "production volume, sq footage, shifts, throughput, lead times, tolerances — or null",

  "certifications": ["certs explicitly mentioned — [] if none, never null or 'null'"],
  "key_customers": ["named customers or partners if mentioned — [] if none"],

  "business_model": "MUST be exactly one of: contract_manufacturing | saas | licensing | distribution | engineering_services | consulting | research_and_development | grant_funded | other",
  "funding_stage": "MUST be exactly one of: bootstrapped | pre-seed | seed | series_a | series_b | growth | public | null",
  "headcount_range": "MUST be exactly one of: 1-10 | 11-50 | 51-200 | 201-500 | 500+ | null",
  "founded_year": null,
  "company_type": "MUST be exactly one of: manufacturer | distributor | engineering_services | technology | biotech | cleantech | other"
}

IMPORTANT: Always return a JSON array [] for list fields, never null or the string "null".
ENUM RULE: business_model, funding_stage, headcount_range, company_type MUST be exact values from the lists above. Do not combine or invent values. If unsure use "other" or null.

COMPANY DATA:
"""


# ── LLM calls ────────────────────────────────────────────────────────────────

def parse_json(raw: str) -> dict:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    result = json.loads(raw)
    # Model occasionally wraps output in an array — unwrap it
    if isinstance(result, list):
        result = result[0] if result else {}
    if not isinstance(result, dict):
        raise ValueError(f"Expected dict, got {type(result)}")
    return result


async def extract_two_pass(
    co: cohere.AsyncClientV2,
    site: str, homepage: str,
    pages: list[dict],
    corps: dict | None, hc: dict | None, web: dict | None,
    semaphore: asyncio.Semaphore,
) -> dict:
    async with semaphore:
        selected     = select_pages(pages)
        page_block   = build_page_block(selected)
        enrich_block = build_enrichment_block(corps, hc, web)
        full_input   = page_block
        if enrich_block:
            full_input += f"\n\n=== EXTERNAL ENRICHMENT DATA ===\n{enrich_block}"

        # Call 1 — fact extraction
        try:
            r1 = await co.chat(
                model=MODEL,
                messages=[{"role": "user", "content": CALL1_FACT_PROMPT + full_input}],
                temperature=0.0,
                max_tokens=1000,
            )
            facts = r1.message.content[0].text.strip()
        except Exception as e:
            return _err(site, homepage, f"call1: {e}", "two_pass")

        # Call 2 — schema fill
        try:
            r2 = await co.chat(
                model=MODEL,
                messages=[{"role": "user", "content": CALL2_SCHEMA_PROMPT + facts}],
                temperature=0.0,
                max_tokens=1200,
            )
            extracted = parse_json(r2.message.content[0].text)
        except json.JSONDecodeError as e:
            extracted = {"_parse_error": str(e)[:80]}
        except Exception as e:
            return _err(site, homepage, f"call2: {e}", "two_pass")

        _sanitize_lists(extracted)

        extracted.update({
            "site": site, "homepage": homepage,
            "facts": facts,
            "pages_used": len(selected),
            "extraction_mode": "two_pass",
            "embed_text": build_embed_text(extracted),
            "extracted_at": time.time(),
        })
        return extracted


async def extract_one_pass(
    co: cohere.AsyncClientV2,
    site: str, homepage: str,
    pages: list[dict],
    corps: dict | None, hc: dict | None, web: dict | None,
    semaphore: asyncio.Semaphore,
) -> dict:
    async with semaphore:
        # For WEAK: fewer pages, shorter input, single call
        selected     = select_pages(pages, n=5)
        page_block   = build_page_block(selected)
        enrich_block = build_enrichment_block(corps, hc, web)
        full_input   = page_block
        if enrich_block:
            full_input += f"\n\n=== EXTERNAL DATA ===\n{enrich_block}"

        try:
            r = await co.chat(
                model=MODEL,
                messages=[{"role": "user", "content": CALL1_WEAK_PROMPT + full_input}],
                temperature=0.0,
                max_tokens=800,
            )
            extracted = parse_json(r.message.content[0].text)
        except json.JSONDecodeError as e:
            extracted = {"_parse_error": str(e)[:80]}
        except Exception as e:
            return _err(site, homepage, f"call1: {e}", "one_pass")

        _sanitize_lists(extracted)

        extracted.update({
            "site": site, "homepage": homepage,
            "pages_used": len(selected),
            "extraction_mode": "one_pass",
            "embed_text": build_embed_text(extracted),
            "extracted_at": time.time(),
        })
        return extracted


_LIST_FIELDS = (
    "capabilities", "specializations", "products", "technology",
    "equipment", "materials", "industries_served", "certifications",
    "certifications_not_found", "key_customers", "export_compliance",
)

_ENUM_FIELDS = {
    "company_type":   {"manufacturer", "distributor", "engineering_services", "technology", "biotech", "cleantech", "other"},
    "business_model": {"contract_manufacturing", "saas", "licensing", "distribution", "engineering_services", "consulting", "research_and_development", "grant_funded", "other"},
    "headcount_range":{"1-10", "11-50", "51-200", "201-500", "500+"},
    "funding_stage":  {"bootstrapped", "pre-seed", "seed", "series_a", "series_b", "growth", "public"},
}

def _sanitize_lists(d: dict):
    for field in _LIST_FIELDS:
        v = d.get(field)
        if isinstance(v, list):
            d[field] = [x for x in v if x and str(x).lower() != "null"]
        elif v is None or (isinstance(v, str) and v.lower() in ("null", "none", "")):
            d[field] = []
    # Enforce enums — collapse invalid values to "other" or null
    for field, valid in _ENUM_FIELDS.items():
        v = d.get(field)
        if v is None or (isinstance(v, str) and v.lower() in ("null", "none", "")):
            d[field] = None
        elif isinstance(v, str) and v.lower().strip() not in valid:
            d[field] = "other"


def _err(site, homepage, msg, mode) -> dict:
    return {
        "site": site, "homepage": homepage,
        "_error": msg, "extraction_mode": mode,
        "extracted_at": time.time(),
    }


def build_embed_text(r: dict) -> str:
    parts = []
    if r.get("company_name"):     parts.append(r["company_name"])
    if r.get("tagline"):          parts.append(r["tagline"])
    if r.get("capabilities"):     parts.append("Capabilities: "    + "; ".join(r["capabilities"]))
    if r.get("specializations"):  parts.append("Specializations: " + "; ".join(r["specializations"]))
    if r.get("products"):         parts.append("Products: "        + "; ".join(r["products"]))
    if r.get("technology"):       parts.append("Technology: "      + "; ".join(r["technology"]))
    if r.get("equipment"):        parts.append("Equipment: "       + "; ".join(r["equipment"][:6]))
    if r.get("certifications"):   parts.append("Certifications: "  + "; ".join(r["certifications"]))
    if r.get("materials"):        parts.append("Materials: "       + "; ".join(r["materials"]))
    if r.get("industries_served"):parts.append("Industries: "      + "; ".join(r["industries_served"]))
    if r.get("key_customers"):    parts.append("Customers: "       + "; ".join(r["key_customers"]))
    if r.get("export_compliance"):parts.append("Compliance: "      + "; ".join(r["export_compliance"]))
    if r.get("business_model"):   parts.append(f"Model: {r['business_model']}")
    loc = ", ".join(filter(None, [r.get("city"), r.get("province")]))
    if loc: parts.append(f"Location: {loc}, Canada")
    if r.get("capacity"):         parts.append(f"Capacity: {r['capacity']}")
    return " | ".join(parts)


# ── Data loaders ──────────────────────────────────────────────────────────────

def load_classified() -> dict[str, str]:
    out: dict[str, str] = {}
    with open(CLASS_FILE) as f:
        for line in f:
            try:
                r = json.loads(line)
                out[r["site"]] = r["tier"]
            except Exception:
                pass
    return out


def load_site_pages() -> dict[str, list[dict]]:
    pages: dict[str, list] = {}
    with open(RESULTS_FILE) as f:
        for line in f:
            try:
                r = json.loads(line)
                site = r.get("site", "")
                if site:
                    pages.setdefault(site, []).append(r)
            except Exception:
                pass
    return pages


def load_summaries() -> dict[str, dict]:
    seen: set[str] = set()
    out: dict[str, dict] = {}
    with open(SUMMARIES) as f:
        for line in f:
            try:
                s = json.loads(line)
                k = s.get("site", "")
                if k and k not in seen:
                    seen.add(k)
                    out[k] = s
            except Exception:
                pass
    return out


def load_jsonl(path: Path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    if not path.exists():
        return out
    with open(path) as f:
        for line in f:
            try:
                r = json.loads(line)
                key = r.get("site", "")
                if key:
                    out[key] = r
            except Exception:
                pass
    return out


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


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    api_key = os.environ.get("COHERE_API_KEY")
    if not api_key:
        print("\nERROR: Set your Cohere API key first:")
        print("  export COHERE_API_KEY=your_key_here\n")
        return

    t0 = time.time()
    print("\n════════════════════════════════════════════════════════════")
    print("  NGen Extractor — Tiered Extraction (2-pass / 1-pass / skip)")
    print("════════════════════════════════════════════════════════════\n")

    print("Loading data...")
    tiers     = load_classified()
    all_pages = load_site_pages()
    summaries = load_summaries()
    corps_map = load_jsonl(ENRICH_CORPS)
    hc_map    = load_jsonl(ENRICH_HC)
    web_map   = load_jsonl(ENRICH_WEB)
    done      = load_done()

    two_pass = [s for s, t in tiers.items() if t in TIERS_TWO_PASS and s not in done]
    one_pass = [s for s, t in tiers.items() if t in TIERS_ONE_PASS and s not in done]
    skipped  = sum(1 for t in tiers.values() if t in TIERS_SKIP)

    est_two  = len(two_pass) * ((6000+900)*2.50 + (900+1000)*10.0) / 1e6
    est_one  = len(one_pass) * ((3500)*2.50     + (600)*10.0)      / 1e6
    est_cost = est_two + est_one

    print(f"  CORE + RELATED (2-pass):  {len(two_pass):,} sites  ~${est_two:.0f}")
    print(f"  WEAK + NOISE   (1-pass):  {len(one_pass):,} sites  ~${est_one:.0f}")
    print(f"  NO_DATA        (skipped): {skipped:,} sites  $0")
    print(f"  Already done:             {len(done):,} sites")
    print(f"  ─────────────────────────────────────────")
    print(f"  Total to process:         {len(two_pass)+len(one_pass):,} sites  ~${est_cost:.0f}")
    print(f"  Model:                    {MODEL}")
    print(f"  Concurrency:              {CONCURRENT}")
    est_min = (len(two_pass) * 14 + len(one_pass) * 7) / CONCURRENT / 60
    print(f"  Estimated time:           ~{est_min:.0f} min\n")

    co        = cohere.AsyncClientV2(api_key=api_key)
    semaphore = asyncio.Semaphore(CONCURRENT)

    processed = 0
    errors    = 0
    parse_err = 0
    two_done  = 0
    one_done  = 0

    def make_task(site: str, mode: str):
        s  = summaries.get(site, {})
        hp = s.get("homepage", f"https://{site}")
        pg = all_pages.get(site, [])
        co_ = corps_map.get(site)
        hc_ = hc_map.get(site)
        wb_ = web_map.get(site)
        if mode == "two":
            return extract_two_pass(co, site, hp, pg, co_, hc_, wb_, semaphore)
        else:
            return extract_one_pass(co, site, hp, pg, co_, hc_, wb_, semaphore)

    tasks = (
        [(s, "two") for s in two_pass] +
        [(s, "one") for s in one_pass]
    )

    out_f = open(OUTPUT_FILE, "a")
    try:
        coros = [make_task(s, m) for s, m in tasks]
        mode_map = {s: m for s, m in tasks}

        for coro in asyncio.as_completed(coros):
            result = await coro
            out_f.write(json.dumps(result) + "\n")
            out_f.flush()
            processed += 1

            mode = result.get("extraction_mode", "")
            if mode == "two_pass": two_done += 1
            if mode == "one_pass": one_done += 1
            if result.get("_error"):      errors    += 1
            if result.get("_parse_error"):parse_err += 1

            if processed % 50 == 0 or processed == len(tasks):
                elapsed = time.time() - t0
                rate    = processed / elapsed * 3600
                eta_min = (len(tasks) - processed) / max(processed / elapsed, 0.001) / 60
                print(
                    f"  {processed:>5}/{len(tasks):,} | "
                    f"2-pass: {two_done} | 1-pass: {one_done} | "
                    f"err: {errors} | {rate:.0f}/hr | ETA {eta_min:.0f}min"
                )
    finally:
        out_f.close()

    elapsed = time.time() - t0
    print(f"\n✓ Done in {elapsed/60:.1f}min")
    print(f"  2-pass extracted: {two_done:,}")
    print(f"  1-pass extracted: {one_done:,}")
    print(f"  Errors:           {errors} | Parse errors: {parse_err}")
    print(f"  Output:           {OUTPUT_FILE}")

    # Sample output
    print("\n── Sample extractions ──────────────────────────────────────")
    with open(OUTPUT_FILE) as f:
        shown = 0
        for line in f:
            r = json.loads(line)
            if r.get("capabilities") and not r.get("_error"):
                mode = r.get("extraction_mode", "?")
                print(f"\n  [{mode}] {r.get('company_name','?')}  ({r['site']})")
                print(f"  Location:     {r.get('city')} / {r.get('province')}")
                print(f"  Type:         {r.get('company_type')} | Founded: {r.get('founded_year')}")
                print(f"  Capabilities: {r.get('capabilities',[])[:4]}")
                print(f"  Certs found:  {r.get('certifications',[])}")
                print(f"  Certs MISSING:{r.get('certifications_not_found',[])[:5]}")
                print(f"  Materials:    {r.get('materials',[])[:4]}")
                print(f"  Customers:    {r.get('key_customers',[])}")
                print(f"  Embed text:   {r.get('embed_text','')[:160]}")
                shown += 1
                if shown >= 3:
                    break


if __name__ == "__main__":
    asyncio.run(main())
