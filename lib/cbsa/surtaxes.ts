/**
 * Live Canadian retaliatory surtax data.
 * Sources: laws-lois.justice.gc.ca (SOR regulations) + CBSA CN notices
 * Cached 24h via unstable_cache — surtax orders change infrequently.
 */

import { unstable_cache } from 'next/cache';
import type { SurtaxOverlay } from '@/lib/trade/data';

// ── Known surtax orders ──────────────────────────────────────────────────────
// Each entry describes one Statutory Order and Regulations (SOR) or CN notice.
// The `url` is the live source; `rate` is parsed from the regulation text.
// Add new orders here when Canada issues new surtax measures.

interface SurtaxSource {
  order: string;
  sor: string;
  cn: string;
  origin: 'US' | 'CN' | 'ALL';
  type: string;
  from: string;
  url: string;
  fallbackRate: number;
}

const SURTAX_SOURCES: SurtaxSource[] = [
  {
    order: 'US Surtax (Steel & Aluminum 2025)',
    sor: 'SOR/2025-95',
    cn: 'CN 25-11',
    origin: 'US',
    type: 'steel_aluminum',
    from: '2025-03-13',
    url: 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2025-95/FullText.html',
    fallbackRate: 25,
  },
  {
    order: 'Steel Derivative Goods Surtax',
    sor: 'SOR/2025-267',
    cn: 'CN 25-33',
    origin: 'US',
    type: 'steel_derivative',
    from: '2025-09-01',
    url: 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2025-267/FullText.html',
    fallbackRate: 25,
  },
  {
    order: 'US Surtax (Motor Vehicles 2025)',
    sor: 'SOR/2025-119',
    cn: 'CN 25-15',
    origin: 'US',
    type: 'motor_vehicles',
    from: '2025-03-31',
    url: 'https://www.cbsa-asfc.gc.ca/publications/cn-ad/cn25-15-eng.html',
    fallbackRate: 25,
  },
  {
    order: 'China Surtax Order (2024)',
    sor: 'SOR/2024-236',
    cn: 'CN 24-36',
    origin: 'CN',
    type: 'china_ev_steel_alum',
    from: '2024-10-01',
    url: 'https://www.cbsa-asfc.gc.ca/publications/cn-ad/cn24-36-eng.html',
    fallbackRate: 100,
  },
];

// ── Parsers ──────────────────────────────────────────────────────────────────

function parseHsCodes(html: string): string[] {
  const matches = html.match(/\b\d{4}\.\d{2}(?:\.\d{2}(?:\.\d{2})?)?\b/g) ?? [];
  // Deduplicate and exclude Chapter 99 codes (9903.xx etc.) which are surcharge codes
  const real = [...new Set(matches)].filter(c => !c.startsWith('99'));
  return real;
}

function parseRate(html: string, fallback: number): number {
  // Looks for "X% surtax", "surtax of X%", "surtax in the amount of X%"
  const m =
    html.match(/surtax[^.]{0,60}?(\d+(?:\.\d+)?)\s*%/i) ??
    html.match(/(\d+(?:\.\d+)?)\s*%[^.]{0,30}surtax/i) ??
    html.match(/amount of\s+(\d+(?:\.\d+)?)\s*%/i);
  return m ? parseFloat(m[1]) : fallback;
}

async function fetchSource(src: SurtaxSource): Promise<{
  codes: string[];
  rate: number;
}> {
  try {
    const res = await fetch(src.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NGenConnect/1.0)' },
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const codes = parseHsCodes(html);
    const rate = parseRate(html, src.fallbackRate);
    return { codes, rate };
  } catch (e) {
    console.warn(`[cbsa/surtaxes] Failed to fetch ${src.sor}:`, e);
    return { codes: [], rate: src.fallbackRate };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function _fetchLiveSurtaxes(): Promise<SurtaxOverlay> {
  const results = await Promise.all(SURTAX_SOURCES.map(fetchSource));

  const surtaxes: SurtaxOverlay['surtaxes'] = [];

  for (let i = 0; i < SURTAX_SOURCES.length; i++) {
    const src = SURTAX_SOURCES[i];
    const { codes, rate } = results[i];

    for (const hs of codes) {
      surtaxes.push({
        hs,
        origin: src.origin,
        rate,
        order: src.order,
        sor: src.sor,
        cn: src.cn,
        from: src.from,
        to: null,
        type: src.type,
      });
    }
  }

  return {
    generated: new Date().toISOString().slice(0, 10),
    sources: SURTAX_SOURCES.map(s => ({ order: s.order, sor: s.sor, url: s.url })),
    surtaxes,
    notes: {
      ieepa: 'US IEEPA tariffs (+35%) are separate from these Canadian retaliatory surtaxes. IEEPA is a US measure on Canadian exports; surtaxes here are Canadian measures on US/China imports.',
    },
  };
}

export const fetchLiveSurtaxes = unstable_cache(
  _fetchLiveSurtaxes,
  ['cbsa-live-surtaxes'],
  { revalidate: 86_400 },
);
