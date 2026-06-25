"""
NGen Manufacturer Intelligence — Full Project Report Generator
Run: python3 "/Users/Fahad.Hafeez/Documents/scraper_pkg 2/generate_report.py"
"""
import json, sqlite3, statistics, time, os
from datetime import datetime
from pathlib import Path

OUT  = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/out2")
DB   = OUT / "checkpoint.db"
REPORT = Path("/Users/Fahad.Hafeez/Documents/scraper_pkg 2/NGen_Intelligence_Report.md")

conn = sqlite3.connect(DB)

# ── Pull all stats ──────────────────────────────────────────────────────────
total_queue   = 8071
done_sites    = conn.execute("SELECT COUNT(*) FROM site_state WHERE done=1").fetchone()[0]
page_rows     = conn.execute("SELECT status, COUNT(*), SUM(word_count) FROM pages GROUP BY status").fetchall()
page_stats    = {r[0]: (r[1], r[2] or 0) for r in page_rows}
success_pages = page_stats.get('success', (0, 0))
thin_pages    = page_stats.get('thin',    (0, 0))
failed_pages  = page_stats.get('failed',  (0, 0))

total_chars, total_words, site_words = 0, 0, {}
with open(OUT / "results_clean.jsonl") as f:
    for line in f:
        try:
            r    = json.loads(line)
            t    = r.get('fit_markdown', '') or ''
            wc   = len(t.split())
            total_chars += len(t)
            total_words += wc
            s    = r.get('site', '')
            site_words[s] = site_words.get(s, 0) + wc
        except: pass

sw = list(site_words.values())

seen = {}
with open(OUT / "site_summaries.jsonl") as f:
    for line in f:
        try:
            s = json.loads(line)
            k = s.get('homepage') or s.get('site')
            seen[k] = s
        except: pass

s_success = sum(1 for s in seen.values() if not s.get('blocked') and 'TIMEOUT' not in str(s.get('error','')))
s_timeout = sum(1 for s in seen.values() if 'TIMEOUT' in str(s.get('error','')))
s_blocked = sum(1 for s in seen.values() if s.get('blocked'))

cert_patterns = ['iso 9001','iso 14001','iso 13485','as9100','nadcap','iatf 16949',
                 'asme','gmp','fda','health canada','csa','sqf','ce marking','ul listed']
cert_counts, sites_with_certs = {}, set()
with open(OUT / "results_clean.jsonl") as f:
    for line in f:
        try:
            r    = json.loads(line)
            t    = (r.get('fit_markdown','') or '').lower()
            site = r.get('site','')
            for c in cert_patterns:
                if c in t:
                    sites_with_certs.add(site)
                    cert_counts[c] = cert_counts.get(c, 0) + 1
        except: pass

proj_tokens   = total_chars / 4
embed_voyage  = proj_tokens / 1e6 * 0.06
embed_cohere  = proj_tokens / 1e6 * 0.10
embed_openai  = proj_tokens / 1e6 * 0.13
embed_gemini  = proj_tokens / 1e6 * 0.025

# extraction cost estimates (110k pages)
pages         = success_pages[0]
avg_in_tok    = 1535   # prompt + page content
avg_out_tok   = 300    # JSON output
total_in      = pages * avg_in_tok / 1e6
total_out     = pages * avg_out_tok / 1e6

ext_opus      = total_in * 15   + total_out * 75
ext_sonnet    = total_in * 3    + total_out * 15
ext_gemini    = total_in * 1.25 + total_out * 5
ext_cohere    = total_in * 3    + total_out * 15   # Command R+

tax_opus      = 300
tax_gemini    = 60
tax_cohere    = 100

rerank_monthly_low  = 20
rerank_monthly_high = 200

explain_per   = 0.08   # per explanation at Opus rates
explain_1k    = explain_per * 1000
explain_10k   = explain_per * 10000

now = datetime.now().strftime("%B %d, %Y")

# ── Build report ────────────────────────────────────────────────────────────
md = f"""# NGen Manufacturer Intelligence Platform — Project Report
**Generated:** {now}
**Status:** Phase 1 (Scraping) Complete ✓

---

## Executive Summary

NGen's manufacturer intelligence pipeline has completed its first phase — a full crawl of **{done_sites:,} Canadian manufacturer and supplier websites** from a target list of {total_queue:,}. The result is a **{total_chars/1e9:.2f}B-character corpus** of clean, structured manufacturer text ready for enrichment, embedding, and deployment as a supplier matchmaking system.

---

## Phase 1 — Scraping KPIs

### Progress
| Metric | Value |
|---|---|
| Sites targeted | {total_queue:,} |
| Sites completed | {done_sites:,} ({done_sites/total_queue*100:.1f}%) |
| Successful sites | {s_success:,} ({s_success/max(len(seen),1)*100:.1f}%) |
| Timed out | {s_timeout:,} ({s_timeout/max(len(seen),1)*100:.1f}%) |
| Blocked / bot-detected | {s_blocked:,} ({s_blocked/max(len(seen),1)*100:.1f}%) |

### Pages & Corpus
| Metric | Value |
|---|---|
| Pages scraped (success) | {success_pages[0]:,} |
| Pages thin content | {thin_pages[0]:,} |
| Pages failed | {failed_pages[0]:,} |
| Avg words per page | {total_words//max(success_pages[0],1):,} |
| Total words | {total_words/1e6:.1f}M |
| Total characters | {total_chars/1e9:.2f}B |
| Estimated embedding tokens | {proj_tokens/1e6:.0f}M |

### Site Quality Distribution
| Segment | Sites |
|---|---|
| Sites > 10,000 words (rich) | {sum(1 for w in sw if w>10000):,} |
| Sites > 1,000 words (good) | {sum(1 for w in sw if w>1000):,} |
| Sites < 500 words (thin) | {sum(1 for w in sw if w<500):,} |
| Median words per site | {int(statistics.median(sw)):,} |

### Certifications Detected
| Certification | Companies |
|---|---|
""" + "\n".join(f"| {c.upper()} | {n:,} |" for c, n in sorted(cert_counts.items(), key=lambda x: -x[1])[:12]) + f"""
| **Total certified companies** | **{len(sites_with_certs):,}** |

---

## Pipeline — Next Steps

### Step 1 — Enrichment Scraping
**What:** Collect extra information about each company from beyond their own website — LinkedIn, certification registries, government supplier directories, news articles, and contract awards.

**Why it matters:** A company's website is a billboard — it shows what they want you to see. "Quality solutions for diverse industries" leaves out that they're AS9100-certified, have 40 employees, and just won a defence contract. Those missing facts are exactly what makes a good match. Better raw information in means better matches out — this step raises the ceiling on everything that follows.

| Tool / Model | Role |
|---|---|
| Crawl4AI / Playwright | Primary scraping tool — already built |
| Corporations Canada API | Company registration + status — free |
| NewsAPI | Recent company news + contracts |
| LinkedIn (manual / approved API) | Employee count, founding year |
| **Cohere Command R7B** | Clean messy enrichment pages into structured fields |

> **Cohere pick:** Command R7B — cheap, fast, good enough for grunt-work field tidying. Save the frontier models for harder steps.

---

### Step 2 — Extraction
**What:** Read through all merged text and pull out specific facts into a tidy, consistent format — capabilities, certifications, materials, industries, location, size. Fill out the same standardized form for every company.

**Why it matters:** Raw web text is a mess no computer can filter or compare reliably. You can't ask "show me certified aluminum suppliers in Ontario" if the data is just paragraphs of prose. Extraction converts the chaos into neat boxes you can actually search, sort, and match on. Without this, there's no real matchmaking — just keyword guessing.

| Model | Notes |
|---|---|
| Gemini 2.5 Pro | Native multimodality for PDFs/spec sheets, multilingual, lowest cost at frontier |
| Claude Opus 4.8 | Best schema adherence, handles ambiguity most reliably |
| Claude Sonnet 4.6 | Best cost/quality tradeoff — recommended starting point |
| **Cohere Command A** | Genuinely competent; worth testing as a single-vendor option |

> **Recommendation:** Start with Claude Sonnet 4.6. Run a head-to-head on 50 sites vs Gemini 2.5 Pro before committing.

---

### Step 3 — Taxonomy Induction & Normalization
**What:** Different companies describe the same thing in different words — "CNC machining," "CNC milling," "precision machining." Group all of these into one agreed-upon label and relabel every company to use the standard term.

**Why it matters:** To a computer, "CNC machining" and "CNC milling" look like two unrelated things. A buyer searching for one would miss companies that wrote it the other way — even though they're identical. Standardizing vocabulary means a search finds everyone who qualifies, not just those who phrased it your way. It's the difference between a search that works and one that quietly misses half the answers.

| Model | Notes |
|---|---|
| Claude Opus 4.8 | Deepest reasoning for grouping and naming categories well |
| Gemini 2.5 Pro | Strong alternative, lower cost |
| **Cohere Command A** | Decent but frontier gap is largest here — most worth reaching outside Cohere |

> **Recommendation:** Claude Opus 4.8. Do not compromise — this is the most judgment-heavy step in the pipeline. One-time job.

---

### Step 4 — Embeddings
**What:** Convert each company's capability descriptions into long strings of numbers (vectors) that capture meaning. Companies that do similar things end up with similar numbers, even if they used totally different words.

**Why it matters:** This is what lets the tool understand meaning, not just match exact words. Someone searches "make aerospace brackets" and finds a shop whose site says "precision sheet-metal components for aviation" — never using the word "bracket," but clearly a fit. Embeddings are what makes the tool smart instead of literal.

| Model | Notes |
|---|---|
| **Cohere Embed v4** | MTEB leader, native PDF/multimodal, multilingual — Cohere's clearest win |
| Gemini Embedding (gemini-embedding-001) | Trades top MTEB spot with Cohere; lowest cost |
| OpenAI text-embedding-3-large | Third strong contender |
| Voyage AI voyage-3 | Anthropic-endorsed, strong RAG retrieval |

> **Cohere pick:** Embed v4 — genuinely best-in-class. No compromise picking it. Benchmark against Gemini Embedding on 100 labeled matches from your own domain before committing.

---

### Step 5 — Reranking
**What:** The embedding step gives a rough shortlist of ~50 plausible matches. This step carefully re-reads each one against the actual request and reorders them so the genuinely best matches rise to the top.

**Why it matters:** The first-pass shortlist is fast but sloppy — it mixes "mentions CNC in passing" with "is a serious CNC shop." Reranking is the expert second look that pushes the real winners to positions 1–5, where people actually look. It's the single biggest lever on whether the top results feel impressively right or frustratingly "close but not quite." Most tools skip it — skipping it is why a lot of search feels mediocre.

| Model | Notes |
|---|---|
| **Cohere Rerank v4 (Pro)** | Category leader — Cohere's clearest win in the pipeline |
| Voyage AI rerank-2.5 | Most serious competitor — benchmark directly |

> **Cohere pick:** Rerank v4 Pro. This is Cohere's strongest category lead anywhere in your pipeline. Still worth benchmarking Voyage rerank-2.5 directly on your labeled match set.

---

### Step 6 — Match Explanation & Chatbot
**What:** For each top match, write a plain-English explanation of why these two companies fit — and power the chatbot users actually talk to. "These fit because they're AS9100-certified, work in aerospace, and have the aluminum capacity you need."

**Why it matters:** A list of company names with no reasoning makes people distrust the tool — especially a public one. Explaining the "why," and citing where each fact came from, turns a black box into something people believe and act on. This is the part users experience directly — it shapes their whole impression of the platform.

| Model | Notes |
|---|---|
| Claude Opus 4.8 | Best grounded generation, lowest hallucination on real company data |
| Gemini 2.5 Pro | Strong competitor, native multimodality for spec grounding |
| **Cohere Command A** | Built for grounded cited answers — test hallucination rate before going public |
| GPT-5 | Third frontier peer |

> **Recommendation:** Claude Opus 4.8 for quality. Cohere Command A for cost-sensitive volume. Run hallucination tests on all three with real company profiles before trusting any to a public surface.

## Recommended Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Scraping | Crawl4AI + Playwright | Already built, battle-tested |
| Gov Enrichment | Corporations Canada API | Free, authoritative |
| News Enrichment | NewsAPI + Command R7B | Fast, cheap, good enough |
| Extraction LLM | Claude Sonnet 4.6 → Opus 4.8 | Cost-to-quality ladder |
| Taxonomy LLM | Claude Opus 4.8 | Non-negotiable frontier quality |
| Embeddings | Cohere Embed v4 | Category leader, multilingual |
| Vector DB | Supabase pgvector | Hybrid keyword + semantic, free tier |
| Reranking | Cohere Rerank v4 Pro | Cohere's clearest category win |
| Chatbot / Explanations | Claude Opus 4.8 (public) / Command A (batch) | Quality where users see it |

---

*Report generated by NGen Scraper Pipeline — {now}*
"""

REPORT.write_text(md)
print(md)
print(f"\n✓ Report saved to: {REPORT}")
