/**
 * Rebuild public/data/tariff.json from CBSA T2026 HTML chapter tables.
 *
 * Source: https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/00/chXX-eng.html
 * Run annually when CBSA publishes T20XX (usually January):
 *   npx tsx scripts/fetch-cbsa-tariff.ts
 *   npx tsx scripts/fetch-cbsa-tariff.ts --year 2027
 *
 * Output: public/data/tariff.json  (same schema as before)
 */

import fs from 'fs';
import path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

const YEAR = process.argv.find(a => a.startsWith('--year='))?.split('=')[1] ?? '2026';
const BASE = `https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/${YEAR}/html/00`;
const OUT  = path.join(process.cwd(), 'public', 'data', 'tariff.json');
const DELAY_MS = 400; // be polite to CBSA servers

// ── FTA code → our field name ────────────────────────────────────────────────
// Full list at https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/countries-pays-eng.html
const FTA_MAP: Record<string, keyof TariffItem> = {
  UST:   'us',   // CUSMA / USMCA (United States)
  MXT:   'mx',   // CUSMA / USMCA (Mexico)
  CEUT:  'eu',   // CETA (European Union)
  CPTPT: 'cp',   // CPTPP
  UKT:   'uk',   // CUKTCA (United Kingdom)
  JT:    'jp',   // CJFTA (Japan)
  KRT:   'kr',   // CKFTA (Korea)
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface TariffItem {
  h:   string;
  c:   number;
  d:   string;
  u:   string;
  m:   number;       // MFN rate
  us?: number;
  mx?: number;
  eu?: number;
  cp?: number;
  uk?: number;
  jp?: number;
  kr?: number;
  g?:  number;       // Column 2 / General
}

// ── Rate parser ───────────────────────────────────────────────────────────────

function parseRate(raw: string): number {
  const s = raw.trim().replace(/&nbsp;/g, '').trim();
  if (!s || s === 'N/A' || s === '—') return 0;
  if (/^free$/i.test(s)) return 0;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Parse the CBSA special rates column.
 * Format examples:
 *   "UST, MXT, CEUT, CPTPT, UKT: Free"
 *   "UST: Free CPTPT 15%"
 *   "AUT, UST, MXT: Free CPTPT: 5%"
 */
function parseSpecialRates(special: string): Partial<TariffItem> {
  const result: Partial<TariffItem> = {};
  if (!special) return result;

  // Normalise HTML entities and collapse whitespace
  const s = special.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  // Strategy: find groups of "CODES: RATE" and standalone "CODE RATE" pairs
  // First pass: "CODE1, CODE2, ...: RATE" groups
  const groupRe = /((?:[A-Z]+(?:,\s*)?)+):\s*(Free|\d+(?:\.\d+)?%)/gi;
  let m: RegExpExecArray | null;
  const consumed = new Set<number>();

  while ((m = groupRe.exec(s)) !== null) {
    const rate = parseRate(m[2]);
    const codes = m[1].split(/[,\s]+/).map(c => c.trim()).filter(Boolean);
    for (const code of codes) {
      const field = FTA_MAP[code];
      if (field) (result as any)[field] = rate;
    }
    for (let i = m.index; i < m.index + m[0].length; i++) consumed.add(i);
  }

  // Second pass: standalone "CODE RATE" without colon (e.g. "CPTPT 15%")
  const standaloneRe = /([A-Z]+T)\s+(\d+(?:\.\d+)?%)/g;
  while ((m = standaloneRe.exec(s)) !== null) {
    if (consumed.has(m.index)) continue;
    const field = FTA_MAP[m[1]];
    if (field) (result as any)[field] = parseRate(m[2]);
  }

  return result;
}

// ── HTML table parser ─────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseChapterHtml(html: string, chapterNum: number): TariffItem[] {
  const items: TariffItem[] = [];
  // Extract <tr> blocks
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1];
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => stripTags(c[1]));

    if (cells.length < 5) continue;
    const [htsRaw, , description, unit, mfnRaw, specialRaw] = cells;

    // Must look like an HTS code (digits.digits)
    if (!/^\d{4}\.\d{2}/.test(htsRaw)) continue;

    const mfn     = parseRate(mfnRaw ?? '');
    const special = parseSpecialRates(specialRaw ?? '');
    const colTwo  = cells[6] ? parseRate(cells[6]) : undefined;

    const item: TariffItem = {
      h: htsRaw.replace(/\s+/g, ''),
      c: chapterNum,
      d: description.replace(/\s+/g, ' ').trim(),
      u: unit || 'NMB',
      m: mfn,
      ...special,
    };
    if (colTwo !== undefined && colTwo > 0) item.g = colTwo;

    items.push(item);
  }

  return items;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function fetchChapter(ch: number): Promise<TariffItem[]> {
  const num  = ch.toString().padStart(2, '0');
  const url  = `${BASE}/ch${num}-eng.html`;
  const res  = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NGenConnect/1.0)' } });
  if (!res.ok) { console.warn(`  ch${num}: HTTP ${res.status}`); return []; }
  const html = await res.text();
  const items = parseChapterHtml(html, ch);
  console.log(`  ch${num}: ${items.length} items`);
  return items;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`Fetching CBSA T${YEAR} tariff schedule (chapters 1–99)…`);
  const all: TariffItem[] = [];

  for (let ch = 1; ch <= 99; ch++) {
    const items = await fetchChapter(ch);
    all.push(...items);
    if (ch < 99) await sleep(DELAY_MS);
  }

  console.log(`\nTotal items: ${all.length}`);
  fs.writeFileSync(OUT, JSON.stringify(all), 'utf-8');
  console.log(`Written to ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
