"""
NGen Manufacturer Relevance Classifier
=======================================
Scores all 8,043 sites as manufacturer/supplier relevant or noise.
No LLM — pure keyword + heuristic scoring on already-scraped text.

Output: out2/classification.jsonl  (one record per site)
        out2/classification_summary.txt

Tiers:
  CORE    (score >= 60) — clear manufacturer / industrial supplier
  RELATED (score 30-59) — tech, engineering, materials, services to mfrs
  WEAK    (score 10-29) — tangentially relevant or too little data
  NOISE   (score < 10)  — clinics, agencies, govt, colleges, retail
"""

import json, re
from pathlib import Path
from collections import defaultdict

OUT = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/out2")
RESULTS_FILE  = OUT / "results_clean.jsonl"
SUMMARIES     = OUT / "site_summaries.jsonl"
OUTPUT_FILE   = OUT / "classification.jsonl"
SUMMARY_FILE  = OUT / "classification_summary.txt"


# ── Scoring terms ─────────────────────────────────────────────────────────────

# Each tuple: (regex_pattern, points)
POS_SIGNALS = [
    # Core manufacturing processes
    (r'\bcnc\b',                         10),
    (r'\bmachin\w+',                      8),
    (r'\bfabricat\w+',                    8),
    (r'\bweld\w+',                        7),
    (r'\bcast\w+',                        5),
    (r'\bforg\w+',                        7),
    (r'\bstamp\w+',                       6),
    (r'\bmolding\b|\bmoulding\b',         6),
    (r'\bextrusion\b|\bextrud\w+',        6),
    (r'\bgrind\w+',                       5),
    (r'\bassembl\w+',                     4),
    (r'\bsheet\s*metal',                  8),
    (r'\binjection\s*mold',               8),
    (r'\bprecision\s*(?:machin|part|compon)', 9),
    (r'\b3d\s*print\w+|\badditive\s*manu', 7),
    (r'\bprototyp\w+',                    4),
    (r'\bthermoform\w+',                  7),
    (r'\bheat\s*treat\w+',                8),
    (r'\bplat\w+\s*(?:shop|service)',      6),
    (r'\bcoat\w+\s*(?:service|solution)',  5),
    (r'\banodiz\w+',                       7),
    (r'\bpowder\s*coat\w+',               6),

    # Industries
    (r'\baerosp\w+',                      8),
    (r'\bautomot\w+',                     7),
    (r'\bdefense\b|\bdefence\b',          7),
    (r'\bmedical\s*device',               7),
    (r'\bsemiconductor\b',                6),
    (r'\boil\s*(?:and|&)\s*gas',          6),
    (r'\benergy\s*(?:sector|industry)',    4),
    (r'\bmining\b',                        5),
    (r'\bconstruction\s*(?:material|product)', 4),
    (r'\belectronics\s*manufactur',        7),
    (r'\bpcb\b|\bprinted\s*circuit',       7),

    # Materials
    (r'\btitanium\b',                      7),
    (r'\binconel\b',                       8),
    (r'\bcarbon\s*fiber\b|\bcarbon\s*fibre\b', 7),
    (r'\bcomposite\s*(?:material|part|manufactur)', 7),
    (r'\baluminum\b|\baluminium\b',        4),
    (r'\bstainless\s*steel\b',             5),
    (r'\bsteel\s*(?:part|component|product)', 5),
    (r'\bceramic\s*(?:component|product)', 6),

    # Quality / certs
    (r'\biso\s*9001\b',                    9),
    (r'\bas9100\b',                        10),
    (r'\bnadcap\b',                        10),
    (r'\biatf\s*16949\b',                  9),
    (r'\biso\s*13485\b',                   8),
    (r'\bgmp\s*certif',                    7),
    (r'\bcsa\s*certif',                    6),
    (r'\bquality\s*(?:control|management|system|assurance)', 5),
    (r'\bcertified\s*(?:manufacturer|supplier|to)', 7),

    # Business/supply chain
    (r'\bsuppli\w+',                       4),
    (r'\bmanufactur\w+',                   6),
    (r'\boem\b',                           7),
    (r'\btier\s*[1-3]\b',                  8),
    (r'\bcustom\s*(?:part|component|manufactur)', 7),
    (r'\bproduction\s*(?:run|capabilit|facilit)', 6),
    (r'\bmachine\s*shop\b',                9),
    (r'\btool\s*(?:and\s*die|making|shop)', 8),
    (r'\bjig\b|\bfixture\b',               6),
    (r'\bindustrial\s*(?:supplier|manufacturer|equipment)', 6),
    (r'\bcontract\s*manufactur\w+',        9),

    # Engineering / tech services (lower weight)
    (r'\bengineering\s*(?:firm|service|solution|consultant)', 3),
    (r'\bR&D\b|\bresearch\s*(?:and|&)\s*development', 3),
    (r'\bprototype\b',                     3),
    (r'\btesting\s*(?:service|lab|facility)', 4),
    (r'\binspection\s*(?:service|equipment)', 4),

    # Additional manufacturing terms
    (r'\baircraft\b|\baviation\b',         7),
    (r'\bsatellite\b|\bspacecraft\b',      6),
    (r'\bmilitar\w+',                      6),
    (r'\bdefence\b|\bdefense\b',           6),
    (r'\bindustrial\s*manufactur',         8),
    (r'\bcontract\s*(?:machin|manufactur)', 9),
    (r'\bmfg\b',                           8),
    (r'\bmanufacturing\s*(?:facility|plant|floor|process)', 9),
    (r'\bproduction\s*(?:facilit|capacit|line)', 7),
    (r'\btolerance\b',                     7),
    (r'\bmetrology\b|\bcmm\b',             8),
    (r'\bfirst\s*article\b|\bfai\b',       7),
    (r'\bnonwoven\b|\btechnical\s*fabric', 7),
    (r'\bvalve\b|\bpump\b|\bfitting\b',    4),
    (r'\bhydraulic\b|\bpneumatic\b',       5),
    (r'\bplastic\s*(?:part|component|product|injection)', 7),
    (r'\brubber\s*(?:product|manufactur|compound)', 6),
    (r'\bpcb\s*assembl\b|\bsmt\b|\bsurface\s*mount', 7),
    (r'\bwater\s*jet\b|\bwaterjet\b|\blaser\s*cut', 7),
    (r'\bedm\b|\belectrical\s*discharge', 7),
    (r'\bmanufactur\w+',                   6),
]

NEG_SIGNALS = [
    # Healthcare / medical services (not devices)
    (r'\bchiropractic\b|\bchiropractor\b', -20),
    (r'\bdental\b|\bdentist\b',            -15),
    (r'\bphysiotherap\w+|\bphysio\b',      -15),
    (r'\bclinic\b|\bmedical\s*clinic',     -10),
    (r'\btherapist\b|\btherapy\b',          -8),
    (r'\boptometr\w+|\boptician\b',        -15),
    (r'\bnurse\b|\bnursing\b',              -8),
    (r'\bpharmac\w+',                       -5),

    # Food service / hospitality
    (r'\brestaurant\b|\bcafé\b|\bbistro\b', -20),
    (r'\bcatering\b',                       -15),
    (r'\bhotel\b|\bmotel\b|\binn\b',        -15),
    (r'\bspa\b|\bsalon\b|\bnail\s*art',    -20),

    # Marketing / media / digital
    (r'\bdigital\s*(?:agency|marketing|media)\b', -15),
    (r'\bsocial\s*media\s*(?:agency|management)', -15),
    (r'\bseo\b|\bpay\s*per\s*click\b|\bppc\b', -12),
    (r'\bweb\s*design\b|\bweb\s*development\b', -10),
    (r'\bcontent\s*(?:marketing|creation|strategy)', -10),

    # Legal / finance
    (r'\blaw\s*firm\b|\blegal\s*service',   -15),
    (r'\battorney\b|\blawyer\b|\bnotary\b', -15),
    (r'\baccountan\w+|\baccounting\s*firm', -10),
    (r'\bfinancial\s*(?:advisor|planner|service)', -10),
    (r'\bmortgage\b|\breal\s*estate\s*(?:agent|broker)', -15),

    # Education
    (r'\buniversit\w+',                    -12),
    (r'\bcollege\b',                        -8),
    (r'\bschool\b',                         -5),
    (r'\btutor\w+',                        -10),

    # Retail (non-industrial)
    (r'\bfashion\b|\bclothing\s*store\b',  -12),
    (r'\bjewelr\w+',                        -8),
    (r'\bgift\s*shop\b',                   -10),
    (r'\bbookstore\b|\bbookshop\b',        -10),

    # Government / associations (already in corpus as noise)
    (r'\bministry\s*of\b',                 -10),
    (r'\bmunicipality\b|\bmunicipal\s*gov', -10),
    (r'\bnon.?profit\b|\bcharit\w+',        -5),
]

# Domain-level overrides
DOMAIN_BOOSTS = {
    # Strong positive domains
    'machine': +15, 'machin': +15, 'manufactur': +15, 'fabricat': +15,
    'weld': +12, 'tool': +10, 'forge': +12, 'cast': +10, 'mold': +10,
    'precision': +10, 'aerospace': +15, 'cnc': +15, 'metal': +10,
    'plastics': +8, 'composite': +10, 'tech': +3,
}
DOMAIN_PENALTIES = {
    'dental': -25, 'chiro': -25, 'physio': -20, 'clinic': -20,
    'restaurant': -25, 'cafe': -20, 'salon': -20, 'spa': -20,
    'law': -15, 'legal': -15, 'accounting': -15, 'realty': -20,
    'college': -15, 'university': -15, 'school': -10,
    'marketing': -15, 'media': -10, 'agency': -10,
    'gc.ca': -20, 'ontario.ca': -20, 'canada.ca': -20,
}


# ── Scorer ────────────────────────────────────────────────────────────────────

def score_site(site: str, title: str, text: str, pages: int, words: int) -> tuple[int, list[str]]:
    score = 0
    reasons = []

    # Base content signal
    if words == 0:
        return 0, ["no content scraped"]
    if words < 200:
        score -= 5

    # Domain signals
    domain_lower = site.lower()
    for kw, pts in DOMAIN_BOOSTS.items():
        if kw in domain_lower:
            score += pts
            reasons.append(f"domain:{kw}+{pts}")
    for kw, pts in DOMAIN_PENALTIES.items():
        if kw in domain_lower:
            score += pts
            reasons.append(f"domain:{kw}{pts}")

    # Content signals on combined title + text
    combined = (title + " " + text).lower()

    pos_score = 0
    for pattern, pts in POS_SIGNALS:
        if re.search(pattern, combined):
            pos_score += pts
            reasons.append(f"+{pts}:{pattern[:20]}")

    neg_score = 0
    for pattern, pts in NEG_SIGNALS:
        if re.search(pattern, combined):
            neg_score += pts
            reasons.append(f"{pts}:{pattern[:20]}")

    score += pos_score + neg_score

    # Pages scraped bonus (more pages = more content = more confident)
    if pages >= 10:
        score += 5
    elif pages >= 5:
        score += 3
    elif pages == 0:
        score -= 10

    return max(0, min(100, score)), reasons


def tier(score: int, words: int) -> str:
    if words == 0:
        return "NO_DATA"
    if score >= 35:
        return "CORE"
    if score >= 15:
        return "RELATED"
    if score >= 5:
        return "WEAK"
    return "NOISE"


# ── Load data ─────────────────────────────────────────────────────────────────

def load_site_data() -> dict[str, dict]:
    """Load best (shallowest) page text per site."""
    pages: dict[str, dict] = {}
    with open(RESULTS_FILE) as f:
        for line in f:
            try:
                r = json.loads(line)
                site  = r.get("site", "")
                depth = r.get("depth", 99)
                wc    = len((r.get("fit_markdown", "") or "").split())
                if not site:
                    continue
                if site not in pages or depth < pages[site]["depth"]:
                    pages[site] = {
                        "depth": depth,
                        "title": r.get("title", ""),
                        "text":  (r.get("fit_markdown", "") or "")[:5000],
                        "words_page": wc,
                    }
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


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("\n════════════════════════════════════════════")
    print("  NGen Manufacturer Relevance Classifier")
    print("════════════════════════════════════════════\n")

    print("Loading scraped content...")
    page_data  = load_site_data()
    summaries  = load_summaries()

    # All sites from summaries
    all_sites = set(summaries.keys())
    print(f"  {len(all_sites):,} total sites\n")

    counts = defaultdict(int)
    records = []

    for site in all_sites:
        s   = summaries.get(site, {})
        pd  = page_data.get(site, {})

        title  = pd.get("title", "")
        text   = pd.get("text", "")
        pages  = s.get("pages_success", 0)
        words  = s.get("total_word_count", 0)

        sc, reasons = score_site(site, title, text, pages, words)
        t = tier(sc, words)
        counts[t] += 1

        records.append({
            "site":     site,
            "homepage": s.get("homepage", f"https://{site}"),
            "score":    sc,
            "tier":     t,
            "words":    words,
            "pages":    pages,
            "title":    title[:100],
            "reasons":  reasons[:8],
        })

    # Sort by score descending
    records.sort(key=lambda x: -x["score"])

    # Write output
    with open(OUTPUT_FILE, "w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")

    # Summary
    total = len(records)
    summary = f"""
NGen Manufacturer Relevance Classification
==========================================
Total sites classified: {total:,}

TIER BREAKDOWN
--------------
CORE    (score >= 35) — clear manufacturer/supplier:  {counts['CORE']:>5,}  ({counts['CORE']/total*100:.1f}%)
RELATED (score 15-34) — tech/engineering/services:    {counts['RELATED']:>5,}  ({counts['RELATED']/total*100:.1f}%)
WEAK    (score  5-14) — thin data or tangential:      {counts['WEAK']:>5,}  ({counts['WEAK']/total*100:.1f}%)
NOISE   (score <  5)  — clinics/agencies/govt/retail: {counts['NOISE']:>5,}  ({counts['NOISE']/total*100:.1f}%)
NO_DATA (0 pages)     — failed/blocked/timeout:       {counts['NO_DATA']:>5,}  ({counts['NO_DATA']/total*100:.1f}%)

USABLE FOR POC
--------------
Extract from:  CORE + RELATED  = {counts['CORE']+counts['RELATED']:,} sites
Skip:          WEAK + NOISE + NO_DATA = {counts['WEAK']+counts['NOISE']+counts['NO_DATA']:,} sites

TOP 20 CORE SITES
-----------------
"""
    for r in [x for x in records if x["tier"] == "CORE"][:20]:
        summary += f"  [{r['score']:>3}] {r['site']:45} {r['title'][:50]}\n"

    summary += "\nTOP 20 NOISE SITES (to exclude)\n"
    summary += "---------------------------------\n"
    for r in sorted([x for x in records if x["tier"] == "NOISE"], key=lambda x: x["score"])[:20]:
        summary += f"  [{r['score']:>3}] {r['site']:45} {r['title'][:50]}\n"

    print(summary)
    SUMMARY_FILE.write_text(summary)
    print(f"\n✓ Full classification: {OUTPUT_FILE}")
    print(f"✓ Summary:             {SUMMARY_FILE}")


if __name__ == "__main__":
    main()
