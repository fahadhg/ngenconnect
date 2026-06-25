"""
NGen Web Enricher — Bing + Kompass Company Intelligence
=======================================================
For each scraped company:
  1. Bing search (2 queries) → cert/business signals from snippets + targeted pages
  2. Kompass Canada search + profile → employees, SIC, year established, categories
  3. Visit high-value third-party pages found in search results

Sources: Bing search engine (snippets), Kompass (structured), Made in Canada Directory,
         news wires, LinkedIn snippets, OpenCorporates

Usage:  python3 enricher_web.py
Output: out2/enrichment_web.jsonl
Resumes automatically if interrupted.
"""

import asyncio, json, re, time, random
from pathlib import Path
from urllib.parse import urlparse, urlunparse, urlencode

import httpx
from bs4 import BeautifulSoup
from enricher import extract_company_name

OUT_DIR       = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/out2")
OUTPUT_FILE   = OUT_DIR / "enrichment_web.jsonl"
SUMMARIES     = OUT_DIR / "site_summaries.jsonl"
RESULTS_FILE  = OUT_DIR / "results_clean.jsonl"

CONCURRENT    = 6          # parallel company workers
BING_DELAY    = 1.5        # seconds between Bing requests (per worker)
KOMPASS_DELAY = 1.0        # seconds between Kompass requests (per worker)
PAGE_TIMEOUT  = 12
MAX_PAGES     = 3          # max result pages to crawl per company (beyond snippets)

# ── Cert patterns ─────────────────────────────────────────────────────────────
CERT_PATTERNS = {
    "iso_9001":    r'\biso\s*9001\b',
    "iso_14001":   r'\biso\s*14001\b',
    "iso_13485":   r'\biso\s*13485\b',
    "iso_45001":   r'\biso\s*45001\b',
    "iso_27001":   r'\biso\s*27001\b',
    "as9100":      r'\bas\s*9100\b',
    "as9120":      r'\bas\s*9120\b',
    "as9110":      r'\bas\s*9110\b',
    "nadcap":      r'\bnadcap\b',
    "iatf_16949":  r'\biatf\s*16949\b',
    "gmp":         r'\bgmp\b|\bgood\s+manufacturing\s+practice',
    "sqf":         r'\bsqf\b',
    "brc":         r'\bbrc\b',
    "haccp":       r'\bhaccp\b',
    "csa":         r'\bcsa\s+(?:certified|approved|standard|z299)\b',
    "ul":          r'\bul\s+(?:listed|certified|approved)\b',
    "ce_marking":  r'\bce\s+(?:mark|marking|certified)\b',
    "asme":        r'\basme\s+(?:certified|stamp|code)\b',
    "r2":          r'\br2\s+(?:certified|certification)\b',
}

# Domains to skip when crawling result pages
SKIP_CRAWL = {
    "bing.com", "google.com", "facebook.com", "twitter.com", "instagram.com",
    "youtube.com", "reddit.com", "amazon.com", "glassdoor.com", "indeed.com",
}

# High-value domains that likely have structured company data
HIGH_VALUE = {
    "madeincanadadirectory.ca", "kompass.com", "opencorporates.com",
    "canadianbusiness.com", "newswire.ca", "globenewswire.com",
    "prnewswire.com", "businesswire.com", "canada.ca", "buyandsell.gc.ca",
    "manta.com", "dnb.com",
}

BING_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-CA,en;q=0.9",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124"',
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}


# ── Session init ──────────────────────────────────────────────────────────────

async def init_bing_session(client: httpx.AsyncClient):
    """Visit Bing homepage once to acquire cookies for the session."""
    try:
        await client.get("https://www.bing.com/", headers=BING_HEADERS, timeout=10)
    except Exception:
        pass


# ── Bing search ───────────────────────────────────────────────────────────────

async def bing_search(client: httpx.AsyncClient, query: str) -> list[dict]:
    """Run a Bing search and return [{title, display_url, snippet}]."""
    try:
        r = await client.get(
            "https://www.bing.com/search",
            params={"q": query},
            headers=BING_HEADERS,
            timeout=12,
        )
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "html.parser")
        results = []
        for li in soup.select("li.b_algo"):
            title_el = li.select_one("h2 a")
            cite_el  = li.select_one("cite")
            snip_el  = li.select_one(".b_caption p, .b_algoSlug")
            if not title_el:
                continue
            results.append({
                "title":       title_el.get_text(strip=True),
                "display_url": cite_el.get_text(strip=True) if cite_el else "",
                "snippet":     snip_el.get_text(strip=True) if snip_el else "",
            })
        return results
    except Exception:
        return []


# ── Kompass lookup ────────────────────────────────────────────────────────────

KOMPASS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-CA,en;q=0.9",
}

async def kompass_lookup(client: httpx.AsyncClient, name: str) -> dict | None:
    """Search Kompass Canada and return structured company data."""
    try:
        r = await client.get(
            "https://ca.kompass.com/searchCompanies/",
            params={"text": name, "country": "CA"},
            headers=KOMPASS_HEADERS,
            timeout=12,
        )
        if r.status_code != 200:
            return None
        soup = BeautifulSoup(r.text, "html.parser")

        # Find profile link — format /c/company-slug/cac######/
        profile_link = None
        for a in soup.select("a[href]"):
            href = a.get("href", "")
            if re.match(r'^/c/[^/]+/ca[a-z0-9]+/$', href) or re.match(r'^https://www\.kompass\.com/c/[^/]+/ca[a-z0-9]+/', href):
                profile_link = href if href.startswith("http") else f"https://www.kompass.com{href}"
                break
        if not profile_link:
            return None

        await asyncio.sleep(KOMPASS_DELAY)
        r2 = await client.get(profile_link, headers=KOMPASS_HEADERS, timeout=12)
        if r2.status_code != 200:
            return None

        text = BeautifulSoup(r2.text, "html.parser").get_text(" ", strip=True)

        year_m  = re.search(r'Year established\s+(\d{4})', text)
        emp_m   = re.search(r'No employees[^\d]*(\d[\d,\s\-]+)', text)
        sic_m   = re.findall(r'\((\d{4})\)', text)
        addr_m  = re.search(r'(\d+[^,\n]+\bON|BC|AB|QC|SK|MB|NS|NB|PE|NL|NT|YT|NU\b[^\n,]{3,40}Canada)', text)

        employees_raw = emp_m.group(1).strip() if emp_m else None
        employees = None
        if employees_raw:
            nums = re.findall(r'\d+', employees_raw.replace(",", ""))
            if nums:
                employees = int(nums[0])

        products_m = re.findall(r'Supplier of:\s*(.*?)(?:\n|  )', text)
        cats_m     = re.findall(r'(?:Producer|Distributor|Service providers)\s+View all', text)

        return {
            "kompass_url":   profile_link,
            "year_founded":  int(year_m.group(1)) if year_m else None,
            "employees":     employees,
            "sic_codes":     list(set(sic_m[:5])),
            "address":       addr_m.group(0).strip() if addr_m else None,
            "categories":    [p.strip() for p in products_m[:3]],
        }
    except Exception:
        return None


# ── Page fetch + text ─────────────────────────────────────────────────────────

async def fetch_text(client: httpx.AsyncClient, url: str) -> str:
    try:
        r = await client.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 Chrome/124"},
            timeout=PAGE_TIMEOUT,
            follow_redirects=True,
        )
        if r.status_code != 200 or "html" not in r.headers.get("content-type", ""):
            return ""
        soup = BeautifulSoup(r.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        return soup.get_text(" ", strip=True)[:6000]
    except Exception:
        return ""


# ── Extraction helpers ────────────────────────────────────────────────────────

def extract_certs(text: str) -> dict[str, bool]:
    return {k: bool(re.search(v, text, re.I)) for k, v in CERT_PATTERNS.items()}


def extract_employees_from_text(text: str) -> int | None:
    for pat in [
        r'(\d[\d,]+)\s*(?:employee|staff|worker|people)',
        r'(?:employ|staff)\w*\s+(?:of\s+)?(\d[\d,]+)',
        r'(?:team|workforce)\s+of\s+(\d[\d,]+)',
        r'(?:fewer than|under|about|approximately)\s+(\d[\d,]+)\s+employee',
    ]:
        m = re.search(pat, text, re.I)
        if m:
            try:
                return int(m.group(1).replace(",", ""))
            except Exception:
                pass
    return None


def extract_founded(text: str) -> int | None:
    m = re.search(
        r'\b(?:founded|established|incorporated|since|est\.)\s+(?:in\s+)?(\d{4})\b', text, re.I
    )
    return int(m.group(1)) if m and 1800 < int(m.group(1)) < 2026 else None


def extract_revenue(text: str) -> str | None:
    m = re.search(r'\$\s*(\d[\d.,]+)\s*(?:million|billion|[MB])\b', text, re.I)
    return m.group(0).strip() if m else None


def extract_contracts(text: str) -> list[str]:
    hits = []
    for m in re.finditer(
        r'.{0,40}(?:government\s+contract|awarded|procurement|RFP|tender|crown\s+corp).{0,60}', text, re.I
    ):
        hits.append(m.group(0).strip())
    return hits[:3]


def extract_news(text: str) -> list[str]:
    hits = []
    for m in re.finditer(
        r'[A-Z][A-Za-z\s]{2,40}(?:Inc|Ltd|Corp|Group|Co)\b[^.!?]{10,120}(?:announced|acquired|expanded|partnered|launched|won|received|awarded|certified)[^.!?]{0,80}[.!?]',
        text,
    ):
        snippet = m.group(0).strip()
        if len(snippet) > 30 and "Source:" not in snippet and "Getty" not in snippet:
            hits.append(snippet)
    return hits[:3]


def resolve_display_url(display_url: str) -> str | None:
    """Turn 'www.example.com › path' into 'https://www.example.com/path'."""
    if not display_url:
        return None
    base = display_url.split(" › ")[0].strip()
    if not base.startswith("http"):
        base = "https://" + base
    return base


# ── Per-company enrichment ────────────────────────────────────────────────────

async def enrich_company(
    client: httpx.AsyncClient,
    site: str,
    company_name: str,
    homepage: str,
    semaphore: asyncio.Semaphore,
) -> dict:
    async with semaphore:
        company_domain = urlparse(homepage).netloc.lower().lstrip("www.")

        # ── 1. Bing searches ──────────────────────────────────────────────
        queries = [
            f'"{company_name}" Canada',
            f'"{company_name}" ISO certified OR AS9100 OR NADCAP OR IATF OR GMP OR CSA OR UL',
        ]
        bing_results: list[dict] = []
        for q in queries:
            results = await bing_search(client, q)
            bing_results.extend(results)
            await asyncio.sleep(BING_DELAY + random.uniform(0, 0.5))

        # Deduplicate
        seen_urls: set[str] = set()
        unique_results: list[dict] = []
        for r in bing_results:
            url = resolve_display_url(r["display_url"]) or ""
            if url and url not in seen_urls and company_domain not in url:
                seen_urls.add(url)
                unique_results.append({**r, "resolved_url": url})

        # ── 2. Kompass lookup ─────────────────────────────────────────────
        kompass = await kompass_lookup(client, company_name)
        await asyncio.sleep(KOMPASS_DELAY)

        # ── 3. Combine snippet text + crawl high-value pages ──────────────
        snippet_text = " ".join(r["snippet"] for r in bing_results)
        crawled_text = snippet_text
        sources: list[dict] = []

        pages_crawled = 0
        for res in unique_results:
            if pages_crawled >= MAX_PAGES:
                break
            url    = res["resolved_url"]
            domain = urlparse(url).netloc.lower().lstrip("www.")
            if any(s in domain for s in SKIP_CRAWL):
                continue
            # Prioritize high-value domains; crawl all others up to limit
            if domain in HIGH_VALUE or pages_crawled < MAX_PAGES:
                text = await fetch_text(client, url)
                if text:
                    crawled_text += " " + text
                    sources.append({"url": url, "title": res["title"], "chars": len(text)})
                    pages_crawled += 1

        # ── 4. Extract signals ────────────────────────────────────────────
        certs     = extract_certs(crawled_text)
        employees = (
            (kompass or {}).get("employees")
            or extract_employees_from_text(snippet_text)
        )
        founded   = (
            (kompass or {}).get("year_founded")
            or extract_founded(snippet_text)
        )
        revenue   = extract_revenue(snippet_text)
        contracts = extract_contracts(crawled_text)
        news      = extract_news(crawled_text)

        return {
            "site":          site,
            "homepage":      homepage,
            "company_name":  company_name,
            "certs":         {k: True for k, v in certs.items() if v},
            "employees":     employees,
            "founded":       founded,
            "revenue":       revenue,
            "kompass":       kompass,
            "sic_codes":     list(set((kompass or {}).get("sic_codes", []))),
            "naics_codes":   [],   # populated if found in crawled text
            "contracts":     contracts,
            "news":          news,
            "sources":       sources,
            "bing_results":  len(unique_results),
            "found_certs":   any(certs.values()),
            "enriched_at":   time.time(),
        }


# ── Data loaders ──────────────────────────────────────────────────────────────

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


def load_summaries() -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    with open(SUMMARIES) as f:
        for line in f:
            try:
                s = json.loads(line)
                k = s.get("homepage") or s.get("site")
                if k not in seen:
                    seen.add(k)
                    out.append(s)
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
    t0 = time.time()
    print("\n════════════════════════════════════════════════════")
    print("  NGen Web Enricher — Bing + Kompass Intelligence")
    print("════════════════════════════════════════════════════\n")

    titles    = load_titles()
    summaries = load_summaries()
    done      = load_done()
    pending   = [s for s in summaries if s["site"] not in done and not s.get("blocked")]

    total     = len(pending)
    est_h     = total * (BING_DELAY * 2 + KOMPASS_DELAY * 2 + 5) / CONCURRENT / 3600

    print(f"  {len(summaries):,} total | {len(done):,} done | {total:,} to process")
    print(f"  Concurrency: {CONCURRENT} | ~{est_h:.1f}h estimated\n")
    print("  Initializing Bing session...")

    semaphore = asyncio.Semaphore(CONCURRENT)
    processed = 0
    certs_found  = 0
    kompass_hits = 0

    async with httpx.AsyncClient(verify=False, follow_redirects=True, http2=False) as client:
        await init_bing_session(client)
        print("  Bing session ready.\n")

        out_f = open(OUTPUT_FILE, "a")
        try:
            tasks = []
            for s in pending:
                site = s["site"]
                clean_site = site.lstrip("www.")
                name = extract_company_name(titles.get(site, ""), clean_site)
                hp   = s.get("homepage", f"https://{site}")
                tasks.append(enrich_company(client, site, name, hp, semaphore))

            for coro in asyncio.as_completed(tasks):
                result = await coro
                out_f.write(json.dumps(result) + "\n")
                out_f.flush()
                processed += 1
                if result["found_certs"]:
                    certs_found += 1
                if result.get("kompass"):
                    kompass_hits += 1

                if processed % 25 == 0 or processed == total:
                    elapsed = time.time() - t0
                    rate    = processed / elapsed * 3600
                    eta_h   = (total - processed) / max(processed / elapsed, 0.001) / 3600
                    print(
                        f"  {processed:>5}/{total:,} | "
                        f"certs: {certs_found} | "
                        f"kompass: {kompass_hits} | "
                        f"{rate:.0f}/hr | "
                        f"ETA {eta_h:.1f}h"
                    )
        finally:
            out_f.close()

    elapsed = time.time() - t0
    print(f"\n✓ Done in {elapsed/3600:.1f}h")
    print(f"  Processed:    {processed:,}")
    print(f"  Certs found:  {certs_found:,} ({certs_found/max(processed,1)*100:.1f}%)")
    print(f"  Kompass hits: {kompass_hits:,} ({kompass_hits/max(processed,1)*100:.1f}%)")
    print(f"  Output:       {OUTPUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
