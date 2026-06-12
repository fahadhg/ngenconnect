/**
 * Alpha Vantage physical commodity prices.
 * Docs: https://www.alphavantage.co/documentation/#commodities
 *
 * Free tier: 25 API calls/day.
 * Cache: 8 hours → max 3 metals × 3 cache misses = 9 calls/day.
 *
 * Requires env var: ALPHA_VANTAGE_KEY
 */

const BASE = 'https://www.alphavantage.co/query';

// 8-hour cache keeps us well under the 25-call/day free limit
const REVALIDATE = 28_800;

export interface PricePoint {
  date: string;  // YYYY-MM-DD or YYYY-MM
  value: number;
}

export interface MetalSeries {
  commodity: string;
  unit: string;
  data: PricePoint[];  // chronological, newest last
}

async function fetchCommodity(fn: string, key: string): Promise<MetalSeries> {
  const url = `${BASE}?function=${fn}&interval=monthly&apikey=${key}`;
  const res = await fetch(url, { next: { revalidate: REVALIDATE } });
  if (!res.ok) throw new Error(`AV HTTP ${res.status} (${fn})`);

  const json = await res.json();

  // Free-tier rate limit message
  if (json['Information'] || json['Note']) {
    throw new Error(`Alpha Vantage rate limited (${fn})`);
  }
  // Unknown function
  if (json['Error Message']) {
    throw new Error(`Alpha Vantage: ${json['Error Message']}`);
  }
  if (!Array.isArray(json.data) || json.data.length === 0) {
    throw new Error(`Alpha Vantage: empty data (${fn})`);
  }

  const points: PricePoint[] = (json.data as { date: string; value: string }[])
    .filter(d => d.value !== '.' && d.value !== 'null' && !isNaN(parseFloat(d.value)))
    .map(d => ({ date: d.date, value: parseFloat(d.value) }))
    // newest-first from API → reverse to chronological
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-24); // keep 24 months

  return {
    commodity: json.name ?? fn,
    unit:      json.unit ?? 'USD',
    data:      points,
  };
}

/** Fetch Copper, Aluminum, Steel in parallel. Any that fail return null. */
export async function fetchAllMetals(key: string): Promise<(MetalSeries | null)[]> {
  const COMMODITIES = [
    { fn: 'COPPER',   label: 'Copper (LME)' },
    { fn: 'ALUMINUM', label: 'Aluminum (LME)' },
    { fn: 'STEEL',    label: 'Steel HRC' },
  ];

  const results = await Promise.allSettled(
    COMMODITIES.map(c => fetchCommodity(c.fn, key)),
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.warn(`Alpha Vantage ${COMMODITIES[i].fn} failed:`, r.reason?.message);
    return null;
  });
}

/** Derive summary stats from a raw series. */
export function summarize(series: MetalSeries) {
  const pts = series.data;
  const latest  = pts[pts.length - 1];
  const prev1m  = pts[pts.length - 2];
  const prev12m = pts[pts.length - 13];

  const mom = latest && prev1m
    ? +((latest.value - prev1m.value) / prev1m.value * 100).toFixed(2)
    : null;
  const yoy = latest && prev12m
    ? +((latest.value - prev12m.value) / prev12m.value * 100).toFixed(2)
    : null;

  return {
    commodity:   series.commodity,
    unit:        series.unit,
    latest:      latest?.value ?? null,
    latestDate:  latest?.date ?? null,
    mom,
    yoy,
    series:      pts.slice(-12), // 12-month window for the chart
  };
}
