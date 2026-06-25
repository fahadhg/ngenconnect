# QUICKSTART — crawl4ai manufacturer-site crawler

Browser-rendered (Playwright via crawl4ai) full-site crawler for building an LLM
supplier-matchmaking corpus from ~8,071 manufacturer websites.

Every page is rendered in a real headless Chromium. There is no httpx fast path.

## 1. Setup (one time)

```bash
cd "scraper_pkg 2/"
python3 -m pip install crawl4ai httpx selectolax
python3 -m playwright install chromium
crawl4ai-setup            # optional: crawl4ai's own browser/env check
```

crawl4ai 0.8.0 is the confirmed/required version.

## 2. CSV format

One column with URLs. Header must be one of: `url`, `website`, `homepage`,
`domain`, `site`, `link` (case-insensitive). Bare domains like `magna.com` get
`https://` auto-prepended. Other columns are ignored.

## 3. Run a full-site crawl

```bash
ulimit -n 4096                  # recommended on macOS, per new terminal
python3 -m scraper crawl --input your_urls.csv --output out2/
```

Defaults (all tunable in `scraper/config.py`):
- 150 high-value pages per site (low-value paths hard-blocked, not counted)
- BFS depth 3 when no sitemap is found
- 5 sites crawled in parallel
- 1 request/sec per domain
- `light_mode` (no images/fonts/media) + stealth on every browser

A report is generated automatically when the crawl finishes.

## 4. Flags

```bash
# Smaller cap → finishes faster
python3 -m scraper crawl --input your_urls.csv --output out2/ --max-pages 75

# Deeper BFS when sitemaps are missing
python3 -m scraper crawl --input your_urls.csv --output out2/ --max-depth 4

# More sites in parallel (watch RAM — each is a browser)
python3 -m scraper crawl --input your_urls.csv --output out2/ --concurrent-sites 8

# Be more polite (less risk of anti-bot blocks)
python3 -m scraper crawl --input your_urls.csv --output out2/ --rps 0.5

# Force BFS, never trust sitemap.xml
python3 -m scraper crawl --input your_urls.csv --output out2/ --no-sitemap
```

## 5. Discovery logic (per site)

1. Parse `robots.txt` for `Sitemap:` directives.
2. Try `/sitemap.xml`, `/sitemap_index.xml`, `/sitemap1.xml`,
   `/sitemap-index.xml`, `/sitemap.xml.gz`.
3. **Sitemap found:** score every URL with the manufacturing keyword scorer,
   drop low-value patterns, take the top 150, fetch via crawl4ai's
   `MemoryAdaptiveDispatcher`.
4. **No sitemap:** `BestFirstCrawlingStrategy(max_depth=3, max_pages=150)` from
   the homepage, then individually probe undiscovered seed paths
   (`/products`, `/about`, `/services`, `/capabilities`, …).
5. Pages that render thin (<200 words) are retried once with
   `wait_until="networkidle"` and a longer settle delay.

## 6. Output layout (`out2/`)

```
out2/
├── results_raw.jsonl        ← full CrawlResult per page (+ site/depth/discovery)
├── results_clean.jsonl      ← slim record per page (word_count >= 50 only)
├── site_summaries.jsonl     ← one record per site
├── blocked_sites.jsonl      ← domains that hit anti-bot walls
├── checkpoint.db            ← SQLite resumability store
├── report.txt               ← open this first
├── successes.csv
├── failures.csv
├── skipped.csv
├── site_summaries.csv
├── rerun_failed_sites.csv       ← sites with 0 successful pages
├── rerun_single_page_sites.csv  ← sites with exactly 1 successful page
├── rerun_thin_sites.csv         ← sites with < 5 successful pages
└── rerun_blocked_sites.csv      ← sites that hit anti-bot walls
```

## 7. Resume after interruption

Just rerun the same command. `checkpoint.db` records every successful page and
every completed site:
- Sites marked done are skipped entirely.
- Successful page URLs are skipped within a re-crawled site.
- BFS state is persisted via `on_state_change`, so a mid-site interruption
  resumes from saved frontier state.

## 8. Anti-bot handling

- crawl4ai `RateLimiter` with `(2–5s)` jitter, backoff to 60s, 3 retries on
  429/503, plus a per-domain pacing limiter.
- 5 rotating realistic User-Agents (one per site, see `config.USER_AGENTS`).
- Persistent blocks (403/429/503/captcha/cloudflare) are logged to
  `blocked_sites.jsonl` and surfaced in the rerun CSV + report.
- A clearly-marked TODO block in `dispatch.py` shows where to plug in a paid
  proxy / scraping API (Bright Data, Oxylabs, ScrapingBee, ZenRows, Apify).

## 9. Regenerate the report without re-crawling

```bash
python3 -m scraper report --output out2/
```

## 10. Tuning

All knobs live at the top of `scraper/config.py`: concurrency, memory
thresholds, page caps, timeouts, rate limits, content thresholds, seed paths,
user agents, and the high-value keyword / low-value blocklist used by the
scorer.
```
```

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| `Too many open files` | `ulimit -n 4096` (per new terminal) |
| RAM creeping up | Lower `--concurrent-sites`; `light_mode` is already on |
| Many timeouts | Lower `--concurrent-sites`, lower `--rps` |
| Want only failures retried | Just rerun — successes/sites are checkpointed |
