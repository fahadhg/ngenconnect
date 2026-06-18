import { unstable_cache } from 'next/cache';

const FRED_API = 'https://api.stlouisfed.org/fred/series/observations';

export const FRED_SERIES = {
  // Mfg tab — OECD via FRED
  productionIndex:  'CANPROMANMISMEI',  // Production Volume Index 2015=100, monthly SA
  confidence:       'CANBSCICP02STSAQ', // Manufacturing confidence composite, quarterly SA

  // Labour tab — Indeed via FRED
  indeedJobs: 'IHLIDXCATPPRMA', // Production & Mfg job postings, daily SA, Feb 2020=100

  // Costs tab — BLS import price indices by sector, origin = Canada
  priceFood:    'COCANZ311', // Food manufacturing
  pricePaper:   'COCANZ322', // Paper manufacturing
  priceChemical: 'COCANZ325', // Chemical manufacturing (NAICS 325)
  priceMachinery: 'COCANZ333', // Machinery manufacturing (NAICS 333)
} as const;

type Obs = { date: string; value: string };

async function fetchObs(seriesId: string, limit: number): Promise<Obs[]> {
  const key = process.env.FRED_API_KEY;
  if (!key) return [];
  const url = `${FRED_API}?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=${limit}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.observations ?? []).filter((o: Obs) => o.value !== '.');
}

function pct(a: number, b: number) { return b === 0 ? null : +((a - b) / b * 100).toFixed(2); }

async function _fetchFredData() {
  const key = process.env.FRED_API_KEY;
  if (!key) return { available: false as const };

  const [prodObs, confObs, indeedObs, foodObs, paperObs, chemObs, machObs] = await Promise.all([
    fetchObs(FRED_SERIES.productionIndex,  13), // monthly: 13 = ~1yr + 1
    fetchObs(FRED_SERIES.confidence,        5), // quarterly: 5 = ~1yr + 1
    fetchObs(FRED_SERIES.indeedJobs,        7), // daily — last 7 for smoothing
    fetchObs(FRED_SERIES.priceFood,        13),
    fetchObs(FRED_SERIES.pricePaper,       13),
    fetchObs(FRED_SERIES.priceChemical,    13),
    fetchObs(FRED_SERIES.priceMachinery,   13),
  ]);

  // ── Production ───────────────────────────────────────────────────────────
  const prod = prodObs[0] ? {
    index:  +Number(prodObs[0].value).toFixed(1),
    period: prodObs[0].date.slice(0, 7),
    mom: prodObs[1] ? pct(+prodObs[0].value, +prodObs[1].value) : null,
    yoy: prodObs[12] ? pct(+prodObs[0].value, +prodObs[12].value) : null,
  } : undefined;

  // ── Business Confidence ──────────────────────────────────────────────────
  const conf = confObs[0] ? (() => {
    const v = +Number(confObs[0].value).toFixed(1);
    const d = confObs[0].date;
    const q = Math.ceil((new Date(d).getMonth() + 1) / 3);
    return {
      value:  v,
      period: `Q${q} ${d.slice(0, 4)}`,
      signal: (v > 1 ? 'expanding' : v < -1 ? 'contracting' : 'neutral') as 'expanding' | 'contracting' | 'neutral',
    };
  })() : undefined;

  // ── Indeed Job Postings ──────────────────────────────────────────────────
  const indeed = indeedObs[0] ? {
    index:       +Number(indeedObs[0].value).toFixed(1),
    period:      indeedObs[0].date,
    vsBaseline:  +Number(+indeedObs[0].value - 100).toFixed(1),
    // 7-day avg for smoothing
    avg7: indeedObs.length >= 7
      ? +(indeedObs.slice(0, 7).reduce((s, o) => s + +o.value, 0) / 7).toFixed(1)
      : +Number(indeedObs[0].value).toFixed(1),
  } : undefined;

  // ── Sector Import Prices ─────────────────────────────────────────────────
  function sectorPrice(label: string, obs: Obs[]) {
    if (!obs[0]) return null;
    const v  = +obs[0].value;
    const p1 = obs[1]  ? +obs[1].value  : null;
    const p12= obs[12] ? +obs[12].value : null;
    return {
      sector: label,
      index:  +v.toFixed(1),
      period: obs[0].date.slice(0, 7),
      mom:    p1  ? pct(v, p1)  : null,
      yoy:    p12 ? pct(v, p12) : null,
    };
  }

  const sectorPrices = [
    sectorPrice('Food manufacturing',      foodObs),
    sectorPrice('Paper manufacturing',     paperObs),
    sectorPrice('Chemical manufacturing',  chemObs),
    sectorPrice('Machinery manufacturing', machObs),
  ].filter(Boolean) as NonNullable<ReturnType<typeof sectorPrice>>[];

  return {
    available: true as const,
    production: prod,
    confidence: conf,
    indeedJobs: indeed,
    sectorPrices,
    fetched: new Date().toISOString().slice(0, 10),
  };
}

export const fetchFredData = unstable_cache(_fetchFredData, ['fred-manufacturing'], { revalidate: 3600 });
export type FredData = Awaited<ReturnType<typeof _fetchFredData>>;
