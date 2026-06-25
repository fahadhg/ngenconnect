#!/usr/bin/env python3
"""
clean_results.py — Turn a messy crawl4ai results.jsonl into human-readable output.

USAGE:
    python3 clean_results.py out/results.jsonl
    python3 clean_results.py out/results.jsonl --outdir cleaned --sample 5

PRODUCES (in --outdir, default ./cleaned):
    1. sample.txt        - a few full records pretty-printed, with HTML/markdown
                           blobs truncated so you can SEE the structure
    2. records.csv       - one row per page, only the human-useful columns
                           (url, site, status, depth, title, word_count, text_preview)
    3. clean.jsonl       - same records but slimmed: heavy fields (raw html,
                           link dumps, media, base64) dropped, text kept
    4. per_site.txt      - readable per-site rollup: page counts, statuses,
                           which pages each site has

No third-party deps. Streams the file, so it handles huge results.jsonl fine.
"""

import sys, os, json, csv, argparse, re
from collections import defaultdict, Counter

# Fields that are heavy / noise for human reading — dropped in clean.jsonl
HEAVY_FIELDS = {
    "html", "raw_html", "cleaned_html", "fit_html", "page_html",
    "links", "media", "images", "scripts", "styles", "iframes",
    "base64", "screenshot", "pdf", "raw_markdown_v2", "tables_raw",
    "response_headers", "request_headers", "cookies", "ssl_certificate",
}
# Candidate field names (crawl4ai + generic variants)
URL_FIELDS   = ["url", "page_url", "final_url", "loc", "link"]
STATUS_FIELDS= ["status", "result", "outcome", "state", "status_code"]
SITE_FIELDS  = ["site", "domain", "host", "website", "base_url"]
TEXT_FIELDS  = ["markdown", "fit_markdown", "text", "content", "cleaned_text",
                "extracted_content", "body"]
TITLE_FIELDS = ["title", "page_title"]
WC_FIELDS    = ["word_count", "wordcount", "words", "n_words"]
DEPTH_FIELDS = ["depth", "level", "crawl_depth"]


def find(keys, candidates):
    low = {k.lower(): k for k in keys}
    for c in candidates:
        if c in low:
            return low[c]
    return None


def deep_get_title(rec, title_f):
    """Title may be top-level OR nested under metadata."""
    if title_f and rec.get(title_f):
        return rec[title_f]
    meta = rec.get("metadata") or rec.get("meta") or {}
    if isinstance(meta, dict):
        for k in ("title", "page_title", "og:title"):
            if meta.get(k):
                return meta[k]
    return ""


def get_text(rec, text_f):
    if text_f and isinstance(rec.get(text_f), str):
        return rec[text_f]
    # fall back: any of the known text fields present
    for c in TEXT_FIELDS:
        v = rec.get(c)
        if isinstance(v, str) and len(v) > 40:
            return v
    return ""


def clean_text(t, limit=None):
    """Collapse whitespace/markdown noise into a readable preview."""
    if not t:
        return ""
    t = re.sub(r"!\[.*?\]\(.*?\)", " ", t)      # strip markdown images
    t = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", t)   # markdown links -> just text
    t = re.sub(r"[#*`>_~|]+", " ", t)           # markdown symbols
    t = re.sub(r"\s+", " ", t).strip()          # collapse whitespace
    if limit and len(t) > limit:
        t = t[:limit].rsplit(" ", 1)[0] + " …"
    return t


def slim(rec):
    """Drop heavy fields; truncate any huge string values."""
    out = {}
    for k, v in rec.items():
        if k.lower() in HEAVY_FIELDS:
            continue
        if isinstance(v, str) and len(v) > 4000:
            out[k] = v[:4000] + " …[truncated]"
        elif isinstance(v, (dict, list)) and len(json.dumps(v, default=str)) > 4000:
            out[k] = "…[large object dropped]"
        else:
            out[k] = v
    return out


def truncate_for_view(rec):
    """For sample.txt: keep structure visible but truncate blobs hard."""
    out = {}
    for k, v in rec.items():
        if isinstance(v, str) and len(v) > 300:
            out[k] = v[:300] + f" …[{len(v)} chars total]"
        elif isinstance(v, (dict, list)):
            s = json.dumps(v, default=str)
            out[k] = v if len(s) < 300 else f"…[{type(v).__name__}, {len(s)} chars]"
        else:
            out[k] = v
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--outdir", default="cleaned")
    ap.add_argument("--sample", type=int, default=5, help="full records to dump")
    ap.add_argument("--preview", type=int, default=300, help="text preview chars in CSV")
    args = ap.parse_args()

    if not os.path.exists(args.path):
        sys.exit(f"Not found: {args.path}")
    os.makedirs(args.outdir, exist_ok=True)

    # detect schema from first valid records
    keys = set()
    with open(args.path, encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                keys |= set(json.loads(line).keys())
            except Exception:
                continue
            if i > 300:
                break

    url_f   = find(keys, URL_FIELDS)
    stat_f  = find(keys, STATUS_FIELDS)
    site_f  = find(keys, SITE_FIELDS)
    text_f  = find(keys, TEXT_FIELDS)
    title_f = find(keys, TITLE_FIELDS)
    wc_f    = find(keys, WC_FIELDS)
    depth_f = find(keys, DEPTH_FIELDS)

    sample_path  = os.path.join(args.outdir, "sample.txt")
    csv_path     = os.path.join(args.outdir, "records.csv")
    clean_path   = os.path.join(args.outdir, "clean.jsonl")
    persite_path = os.path.join(args.outdir, "per_site.txt")

    site_pages   = defaultdict(list)     # site -> list of (url, status, depth)
    site_status  = defaultdict(Counter)
    total = 0
    written_sample = 0

    with open(args.path, encoding="utf-8", errors="replace") as f, \
         open(csv_path, "w", newline="", encoding="utf-8") as cf, \
         open(clean_path, "w", encoding="utf-8") as jf, \
         open(sample_path, "w", encoding="utf-8") as sf:

        writer = csv.writer(cf)
        writer.writerow(["url", "site", "status", "depth",
                         "title", "word_count", "text_preview"])

        sf.write("=" * 70 + "\n")
        sf.write("SAMPLE RECORDS (blobs truncated so structure is visible)\n")
        sf.write("=" * 70 + "\n\n")

        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except Exception:
                continue
            total += 1

            url    = rec.get(url_f, "") if url_f else ""
            status = rec.get(stat_f, "") if stat_f else ""
            site   = (rec.get(site_f) if site_f else None) or \
                     re.sub(r"^https?://(www\.)?([^/]+).*", r"\2", url)
            depth  = rec.get(depth_f, "") if depth_f else ""
            title  = deep_get_title(rec, title_f)
            text   = clean_text(get_text(rec, text_f), args.preview)
            wc     = rec.get(wc_f, "") if wc_f else (len(get_text(rec, text_f).split()) or "")

            writer.writerow([url, site, status, depth, title, wc, text])
            jf.write(json.dumps(slim(rec), ensure_ascii=False) + "\n")

            site_pages[site].append((url, status, depth))
            site_status[site][status or "?"] += 1

            if written_sample < args.sample:
                sf.write(f"--- record {written_sample+1} ---\n")
                sf.write(json.dumps(truncate_for_view(rec),
                                    indent=2, ensure_ascii=False) + "\n\n")
                written_sample += 1

    # per-site rollup
    with open(persite_path, "w", encoding="utf-8") as pf:
        pf.write("=" * 70 + "\n")
        pf.write("PER-SITE ROLLUP\n")
        pf.write("=" * 70 + "\n\n")
        pf.write(f"Total pages: {total}   Total sites: {len(site_pages)}\n\n")
        for site in sorted(site_pages, key=lambda s: -len(site_pages[s])):
            pages = site_pages[site]
            stat = ", ".join(f"{k}:{v}" for k, v in site_status[site].most_common())
            pf.write(f"{site}  ({len(pages)} pages | {stat})\n")
            for url, status, depth in sorted(pages, key=lambda x: (x[2] if isinstance(x[2], int) else 0)):
                path = re.sub(r"^https?://[^/]+", "", url) or "/"
                flag = "" if status == "success" else f"  [{status}]"
                pf.write(f"    d{depth:<2} {path}{flag}\n")
            pf.write("\n")

    print("##### CLEANED #####")
    print(f"schema: url={url_f} status={stat_f} site={site_f} "
          f"text={text_f} title={title_f} depth={depth_f}")
    print(f"records processed: {total}   sites: {len(site_pages)}")
    print(f"  sample (readable)   -> {sample_path}")
    print(f"  flat table (CSV)    -> {csv_path}")
    print(f"  slim jsonl          -> {clean_path}")
    print(f"  per-site rollup     -> {persite_path}")
    print("###################")


if __name__ == "__main__":
    main()
