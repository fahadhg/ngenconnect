#!/usr/bin/env python3
"""
crawl_audit.py — Audit a Crawl4AI results.jsonl for page-cap truncation
and high-value-page coverage, for a B2B manufacturer matchmaking corpus.

USAGE:
    python3 crawl_audit.py out/results.jsonl
    python3 crawl_audit.py out/results.jsonl --cap 48 --report audit_report.txt

What it does:
  1. Auto-detects the schema (URL field, status field, site/domain field,
     and any ordering signal: depth / crawl_order / timestamp / file order).
  2. Classifies every page URL into HIGH / LOW / NEUTRAL value tiers by path.
  3. For sites that hit the page cap, measures whether high-value pages were
     captured, and (if the crawler logged discovered-but-unfetched URLs)
     how many high-value URLs were truncated away.
  4. Falls back to a coverage-proxy (capped vs. non-capped high-value ratio)
     when no ordering / discovery-queue signal exists.
  5. Writes a full report file AND prints a compact summary to stdout.

No third-party deps — standard library only.
"""

import sys
import os
import json
import argparse
import re
from collections import defaultdict, Counter
from urllib.parse import urlparse

# ----------------------------------------------------------------------
# High-value / low-value URL pattern definitions
# Broad net per the matchmaking goal: about, products, capabilities,
# services, industries, location, certifications, tech specs, contracts,
# use cases, research, etc.
# ----------------------------------------------------------------------

HIGH_VALUE_PATTERNS = [
    r"about", r"who-?we-?are", r"company", r"overview",
    r"product", r"capabilit", r"service", r"solution",
    r"industr", r"market", r"sector", r"application",
    r"manufactur", r"equipment", r"machin", r"facilit", r"plant",
    r"technolog", r"tech(nical)?-?spec", r"spec(ification)?s?\b",
    r"material", r"process",
    r"certif", r"iso\b", r"quality", r"accredit", r"compliance",
    r"location", r"where-?we-?are", r"contact", r"facilities",
    r"contract", r"procure", r"supply", r"supplier", r"vendor",
    r"use-?case", r"case-?stud", r"project", r"portfolio", r"work",
    r"research", r"r-?and-?d", r"innovation", r"develop",
    r"expertise", r"specialt?", r"competenc",
]

LOW_VALUE_PATTERNS = [
    r"/blog", r"/news", r"/press", r"/article", r"/post",
    r"/career", r"/job", r"/vacanc", r"/hiring",
    r"/privacy", r"/terms", r"/legal", r"/cookie", r"/disclaimer",
    r"/login", r"/signin", r"/register", r"/account", r"/cart", r"/checkout",
    r"/category/", r"/tag/", r"/author/", r"/archive", r"/page/\d+",
    r"/wp-", r"/feed", r"\.rss", r"/sitemap",
    r"/event", r"/webinar", r"/newsletter", r"/subscribe",
    r"/search", r"/404", r"/thank", r"/comment",
]

HIGH_RE = re.compile("|".join(HIGH_VALUE_PATTERNS), re.I)
LOW_RE = re.compile("|".join(LOW_VALUE_PATTERNS), re.I)

# Candidate field names we might find in the wild ---------------------
URL_FIELDS    = ["url", "page_url", "link", "href", "final_url", "loc"]
STATUS_FIELDS = ["status", "result", "status_code", "outcome", "state"]
SITE_FIELDS   = ["site", "domain", "host", "base_url", "root", "website", "company"]
ORDER_FIELDS  = ["crawl_order", "order", "index", "seq", "n", "position"]
DEPTH_FIELDS  = ["depth", "level", "crawl_depth"]
TIME_FIELDS   = ["timestamp", "ts", "fetched_at", "crawled_at", "time", "datetime"]
# A field that lists discovered-but-not-fetched URLs, if the crawler logged it
DISCOVERED_FIELDS = ["discovered", "discovered_urls", "queued", "skipped_urls",
                     "links", "found_urls", "pending"]

SUCCESS_TOKENS = {"success", "ok", "200", "scraped", "scraped_successfully", True}


def pick_field(sample_keys, candidates):
    """Return the first candidate present in the record keys (case-insensitive)."""
    lower = {k.lower(): k for k in sample_keys}
    for c in candidates:
        if c in lower:
            return lower[c]
    return None


def value_tier(url):
    """Classify a URL path into HIGH / LOW / NEUTRAL."""
    try:
        path = urlparse(url).path or "/"
    except Exception:
        path = url
    if path in ("", "/"):
        return "NEUTRAL"          # homepage
    if LOW_RE.search(path):
        return "LOW"
    if HIGH_RE.search(url):       # match against full url (some sites use subdomains)
        return "HIGH"
    return "NEUTRAL"


def domain_of(url):
    try:
        return urlparse(url).netloc.lower().replace("www.", "")
    except Exception:
        return None


def is_success(status):
    if status is None:
        return False
    s = status.lower() if isinstance(status, str) else status
    return s in SUCCESS_TOKENS or s == "success"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="Path to results.jsonl")
    ap.add_argument("--cap", type=int, default=None,
                    help="Page cap used in the crawl (e.g. 48). "
                         "If omitted, inferred as the modal max pages/site.")
    ap.add_argument("--report", default="audit_report.txt",
                    help="Output report file path")
    args = ap.parse_args()

    if not os.path.exists(args.path):
        sys.exit(f"File not found: {args.path}")

    # ---- Pass 1: schema detection on a sample -----------------------
    sample_keys = set()
    with open(args.path, encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                sample_keys |= set(rec.keys())
            except Exception:
                continue
            if i >= 500:
                break

    url_f    = pick_field(sample_keys, URL_FIELDS)
    status_f = pick_field(sample_keys, STATUS_FIELDS)
    site_f   = pick_field(sample_keys, SITE_FIELDS)
    order_f  = pick_field(sample_keys, ORDER_FIELDS)
    depth_f  = pick_field(sample_keys, DEPTH_FIELDS)
    time_f   = pick_field(sample_keys, TIME_FIELDS)
    disc_f   = pick_field(sample_keys, DISCOVERED_FIELDS)

    if not url_f:
        sys.exit(f"Could not find a URL field. Keys seen: {sorted(sample_keys)}")

    # Ordering signal priority: explicit order > depth > timestamp > file order
    if order_f:
        ordering = ("order", order_f)
    elif depth_f:
        ordering = ("depth", depth_f)
    elif time_f:
        ordering = ("time", time_f)
    else:
        ordering = ("file_order", None)

    # ---- Pass 2: full scan, grouped per site ------------------------
    # per_site[domain] = list of (order_key, url, tier, success)
    per_site = defaultdict(list)
    discovered_high = defaultdict(int)   # high-value URLs discovered (if logged)
    file_idx = 0

    with open(args.path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except Exception:
                continue
            url = rec.get(url_f)
            if not url:
                continue
            dom = (rec.get(site_f) if site_f else None) or domain_of(url)
            if not dom:
                continue
            succ = is_success(rec.get(status_f)) if status_f else True
            tier = value_tier(url)

            if ordering[0] == "file_order":
                okey = file_idx
            else:
                okey = rec.get(ordering[1], file_idx)
            per_site[dom].append((okey, url, tier, succ))

            # Count discovered-but-unfetched high-value URLs if available
            if disc_f and isinstance(rec.get(disc_f), list):
                for du in rec[disc_f]:
                    if isinstance(du, str) and value_tier(du) == "HIGH":
                        discovered_high[dom] += 1
            file_idx += 1

    # ---- Infer cap if not provided ----------------------------------
    pages_per_site = {d: sum(1 for r in rows if r[3]) for d, rows in per_site.items()}
    if args.cap is None:
        # modal high page-count -> likely the cap
        cnt = Counter(v for v in pages_per_site.values() if v > 0)
        # the cap tends to be a spike at the top; take the most common value >= 90th pct
        vals = sorted(pages_per_site.values())
        p90 = vals[int(len(vals) * 0.9)] if vals else 0
        spike = [v for v in pages_per_site.values() if v >= p90]
        cap = Counter(spike).most_common(1)[0][0] if spike else max(vals, default=0)
    else:
        cap = args.cap

    # ---- Analysis ---------------------------------------------------
    capped_sites, healthy, starved = [], [], []
    high_ratio_capped, high_ratio_uncapped = [], []
    missed_high_total = 0

    for dom, rows in per_site.items():
        succ_rows = [r for r in rows if r[3]]
        n = len(succ_rows)
        if n == 0:
            continue
        highs = sum(1 for r in succ_rows if r[2] == "HIGH")
        ratio = highs / n
        capped = n >= cap

        if capped:
            capped_sites.append(dom)
            high_ratio_capped.append(ratio)
            # Did it capture key pages? Heuristic: at least a few core high-value pages
            # AND high-value pages weren't all jammed at the tail of the crawl order.
            ordered = sorted(succ_rows, key=lambda r: r[0])
            last_quarter = ordered[int(len(ordered) * 0.75):]
            highs_in_tail = sum(1 for r in last_quarter if r[2] == "HIGH")
            # discovered-but-missed high-value (only if crawler logged it)
            missed = discovered_high.get(dom, 0)
            missed_high_total += missed

            starved_flag = (highs < 3) or (missed > 0) or \
                           (highs_in_tail > 0 and ratio < 0.15)
            if starved_flag:
                starved.append((dom, n, highs, missed))
            else:
                healthy.append((dom, n, highs, missed))
        else:
            high_ratio_uncapped.append(ratio)

    def avg(x):
        return sum(x) / len(x) if x else 0.0

    # ---- Build report ----------------------------------------------
    lines = []
    W = lines.append
    W("=" * 70)
    W("CRAWL AUDIT — PAGE-CAP TRUNCATION & HIGH-VALUE COVERAGE")
    W("=" * 70)
    W("")
    W("SCHEMA DETECTED")
    W(f"  URL field        : {url_f}")
    W(f"  Status field     : {status_f or '(none — assuming all success)'}")
    W(f"  Site field       : {site_f or '(none — derived from URL domain)'}")
    W(f"  Ordering signal  : {ordering[0]}"
      + (f' (field: {ordering[1]})' if ordering[1] else ' (no explicit field — used line order)'))
    W(f"  Discovered-URL field : {disc_f or '(none — truncation measured by proxy)'}")
    W("")
    W(f"  Page cap used    : {cap}" + ("" if args.cap else "  (inferred)"))
    W("")
    W("CORPUS OVERVIEW")
    W(f"  Sites with >=1 success : {len(pages_per_site)}")
    W(f"  Capped sites (>= cap)  : {len(capped_sites)}"
      f"  ({100*len(capped_sites)/max(len(pages_per_site),1):.1f}%)")
    W("")
    W("HIGH-VALUE COVERAGE  (share of a site's pages that are capability/product/etc.)")
    W(f"  Avg high-value ratio, CAPPED sites   : {avg(high_ratio_capped):.1%}")
    W(f"  Avg high-value ratio, UNCAPPED sites : {avg(high_ratio_uncapped):.1%}")
    delta = avg(high_ratio_uncapped) - avg(high_ratio_capped)
    W(f"  Gap (uncapped - capped)              : {delta:+.1%}")
    if delta > 0.05:
        W("  -> SIGNAL: capped sites have meaningfully FEWER high-value pages.")
        W("     Consistent with the cap consuming budget before reaching them.")
    else:
        W("  -> No strong proxy signal that the cap is starving high-value pages.")
    W("")
    if disc_f:
        W("TRUNCATION (measured directly from discovered-but-unfetched URLs)")
        W(f"  High-value URLs discovered but never fetched : {missed_high_total}")
    else:
        W("TRUNCATION (direct measure unavailable — no discovered-URL field logged)")
        W("  Using capped-vs-uncapped proxy above as the truncation signal.")
    W("")
    W("VERDICT")
    W(f"  Capped & HEALTHY (got key pages) : {len(healthy)}")
    W(f"  Capped & STARVED (likely cut)    : {len(starved)}")
    W("")
    W("  Top starved sites to re-crawl with high-value-first ordering:")
    starved.sort(key=lambda x: (x[3] > 0, -x[1]))  # logged-misses first, then biggest
    for dom, n, highs, missed in starved[:40]:
        extra = f", {missed} hi-val discovered-unfetched" if missed else ""
        W(f"    {dom:<45} {n:>4} pages, {highs:>3} hi-val{extra}")
    if len(starved) > 40:
        W(f"    ... and {len(starved) - 40} more (full list in CSV)")
    W("")
    W("=" * 70)

    report_text = "\n".join(lines)
    with open(args.report, "w", encoding="utf-8") as f:
        f.write(report_text)

    # Also dump starved sites to CSV for the re-crawl queue
    csv_path = os.path.splitext(args.report)[0] + "_starved_sites.csv"
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write("domain,success_pages,high_value_pages,high_value_discovered_unfetched\n")
        for dom, n, highs, missed in starved:
            f.write(f"{dom},{n},{highs},{missed}\n")

    # ---- Compact summary to stdout (paste this back) ----------------
    print("\n##### PASTE-BACK SUMMARY #####")
    print(f"schema: url={url_f} status={status_f} site={site_f} "
          f"order={ordering[0]} discovered={disc_f}")
    print(f"cap={cap}  sites_with_success={len(pages_per_site)}  "
          f"capped={len(capped_sites)}")
    print(f"hi_val_ratio capped={avg(high_ratio_capped):.1%} "
          f"uncapped={avg(high_ratio_uncapped):.1%} gap={delta:+.1%}")
    if disc_f:
        print(f"hi_val_discovered_unfetched={missed_high_total}")
    print(f"verdict: healthy={len(healthy)} starved={len(starved)}")
    print(f"report -> {args.report}")
    print(f"recrawl_queue -> {csv_path}")
    print("##############################")


if __name__ == "__main__":
    main()
