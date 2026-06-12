/**
 * Alpha Vantage physical commodity prices.
 * Docs: https://www.alphavantage.co/documentation/#commodities
 *
 * Free tier: 25 API calls/day, 5 req/min.
 * Cache: unstable_cache (8 h TTL) — only caches successful responses,
 * unlike fetch's next.revalidate which also caches rate-limit 200s.
 *
 * Requires env var: ALPHA_VANTAGE_KEY
 */

import { unstable_cache } from 'next/cache';

const BASE = 'https://www.alphavantage.co/query';
const REVALIDATE = 28_800; // 8 h → 3 metals × 3 misses/day = 9 calls/day

export interface PricePoint {
  date: string;
  value: number;
}

export interface MetalSeries {
  commodity: string;
  unit: string;
  data: PricePoint[];
}

async function _fetchCommodity(fn: string, key: string): Promise<MetalSeries> {
  const url = `${BASE}?function=${fn}&interval=monthly&apikey=${key}`;
  const res = await fetch(url, { cache: 'no-store' }); // skip fetch cache; unstable_cache wraps this
  if (!res.ok) throw new Error(`AV HTTP ${res.status} (${fn})`);

  const json = await res.json();

  if (json['Information'] || json['Note']) throw new Error(`Alpha Vantage rate limited (${fn})`);
  if (json['Error Message'])               throw new Error(`Alpha Vantage unknown function: ${fn}`);
  if (!Array.isArray(json.data) || !json.data.length) throw new Error(`Alpha Vantage: empty data (${fn})`);

  const points: PricePoint[] = (json.data as { date: string; value: string }[])
    .filter(d => d.value !== '.' && d.value !== 'null' && !isNaN(parseFloat(d.value)))
    .map(d => ({ date: d.date, value: parseFloat(d.value) }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-24);

  return { commodity: json.name ?? fn, unit: json.unit ?? 'USD', data: points };
}

// Wrap in unstable_cache so only successful results are stored.
// Error throws bubble out and are NOT cached, allowing a retry on next request.
function makeCachedFetcher(fn: string) {
  return unstable_cache(
    (key: string) => _fetchCommodity(fn, key),
    [`av-commodity-${fn}`],
    { revalidate: REVALIDATE },
  );
}

const _cachedCopper   = makeCachedFetcher('COPPER');
const _cachedAluminum = makeCachedFetcher('ALUMINUM');
const _cachedSteel    = makeCachedFetcher('STEEL');

/**
 * Fetch Copper, Aluminum, Steel sequentially (13s gap per call) to stay under
 * the 5 req/min free-tier limit. Only runs on cache miss (~once per 8 h).
 */
export async function fetchAllMetals(key: string): Promise<(MetalSeries | null)[]> {
  const fetchers = [
    { fn: 'COPPER',   cached: _cachedCopper },
    { fn: 'ALUMINUM', cached: _cachedAluminum },
    { fn: 'STEEL',    cached: _cachedSteel },
  ];

  const results: (MetalSeries | null)[] = [];
  for (let i = 0; i < fetchers.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 13_000));
    try {
      results.push(await fetchers[i].cached(key));
    } catch (e: any) {
      console.warn(`Alpha Vantage ${fetchers[i].fn} failed:`, e.message);
      results.push(null);
    }
  }
  return results;
}

/** Derive summary stats from a raw series. */
export function summarize(series: MetalSeries) {
  const pts    = series.data;
  const latest  = pts[pts.length - 1];
  const prev1m  = pts[pts.length - 2];
  const prev12m = pts[pts.length - 13];

  return {
    commodity:  series.commodity,
    unit:       series.unit,
    latest:     latest?.value ?? null,
    latestDate: latest?.date ?? null,
    mom:  latest && prev1m  ? +((latest.value - prev1m.value)  / prev1m.value  * 100).toFixed(2) : null,
    yoy:  latest && prev12m ? +((latest.value - prev12m.value) / prev12m.value * 100).toFixed(2) : null,
    series: pts.slice(-12),
  };
}
