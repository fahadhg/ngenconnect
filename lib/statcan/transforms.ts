/**
 * Transforms raw WDS vector results into the shapes expected by the Intel dashboard.
 * Each function mirrors the static JSON structure in public/data/intel/*.json.
 */

import { fetchVectors, latestAndYoy, type WdsVectorResult } from './wds';
import { MFG_SALES, CAP_UTIL, EMPLOYMENT, VACANCIES, VACANCY_RATE, IPPI, RMPI } from './vectors';

// ── Manufacturing Health ───────────────────────────────────────────────────────

export async function fetchMfgHealth() {
  const salesVecs = Object.values(MFG_SALES).map(s => s.v);
  const capVecs   = Object.values(CAP_UTIL).map(c => c.v);
  const empVecs   = Object.values(EMPLOYMENT).map(e => e.v);

  const data = await fetchVectors([...salesVecs, ...capVecs, ...empVecs], 14);

  const sales = Object.entries(MFG_SALES).map(([, meta]) => {
    const res = data.get(meta.v);
    if (!res) return null;
    const { latest, period, yoy } = latestAndYoy(res);
    return {
      naics: meta.naics,
      industry: meta.industry,
      period: period ?? '',
      value: latest != null ? Math.round(latest / 1_000) : null, // WDS returns thousands → millions
      unit: 'millions $',
      yoy: yoy != null ? String(yoy) : null,
    };
  }).filter(Boolean);

  const capacity = Object.entries(CAP_UTIL).map(([, meta]) => {
    const res = data.get(meta.v);
    if (!res) return null;
    const pts = res.dataPoints;
    if (!pts.length) return null;
    const last = pts[pts.length - 1];
    const prev = pts.length > 3 ? pts[pts.length - 4] : null;
    return {
      industry: meta.industry,
      period: last.refPer.slice(0, 7),
      rate: parseFloat(last.value.toFixed(1)),
      change: prev ? parseFloat((last.value - prev.value).toFixed(1)) : null,
    };
  }).filter(Boolean);

  const totalRow = sales.find(s => s?.naics === '31-33');
  const period = totalRow?.period ?? '';

  return {
    source: 'Statistics Canada — tables 16100047, 16100012, 14100022',
    generated: period,
    lastUpdated: new Date().toISOString(),
    note: 'Live via StatsCan WDS API — seasonally adjusted',
    sales,
    capacity,
  };
}

// ── Labour ─────────────────────────────────────────────────────────────────────

export async function fetchLabour() {
  const empVecs = Object.values(EMPLOYMENT).map(e => e.v);
  const vacVecs = [VACANCIES.v, VACANCY_RATE.v];

  const data = await fetchVectors([...empVecs, ...vacVecs], 14);

  const employment = Object.entries(EMPLOYMENT).map(([, meta]) => {
    const res = data.get(meta.v);
    if (!res) return null;
    const { latest, period, yoy } = latestAndYoy(res);
    return {
      naics: meta.naics,
      industry: meta.industry,
      period: period ?? '',
      employed: latest != null ? parseFloat(latest.toFixed(1)) : null,
      unit: 'thousands',
      yoy: yoy != null ? parseFloat(yoy.toFixed(1)) : null,
    };
  }).filter(Boolean);

  const vacRes  = data.get(VACANCIES.v);
  const rateRes = data.get(VACANCY_RATE.v);
  const vacPts  = vacRes?.dataPoints ?? [];
  const ratePts = rateRes?.dataPoints ?? [];

  const latestVac  = vacPts.length  ? vacPts[vacPts.length - 1]   : null;
  const latestRate = ratePts.length ? ratePts[ratePts.length - 1] : null;

  const vacancies = latestVac ? [{
    industry: 'Total manufacturing',
    province: 'Canada',
    period: latestVac.refPer.slice(0, 7),
    vacancies: Math.round(latestVac.value),
    unit: 'number',
    rate: latestRate ? parseFloat(latestRate.value.toFixed(1)) : null,
    trend: null,
  }] : [];

  return {
    source: 'Statistics Canada — tables 14100022, 14100325',
    generated: employment[0]?.period ?? '',
    lastUpdated: new Date().toISOString(),
    note: 'Live via StatsCan WDS API',
    vacancies,
    employment,
    hardToFillFlags: [],
  };
}

// ── Input Costs ────────────────────────────────────────────────────────────────

export async function fetchInputCosts() {
  const ippiVecs = Object.values(IPPI).map(i => i.v);
  const rmpiVecs = Object.values(RMPI).map(r => r.v);

  const data = await fetchVectors([...ippiVecs, ...rmpiVecs], 14);

  const ippi = Object.entries(IPPI).map(([, meta]) => {
    const res = data.get(meta.v);
    if (!res) return null;
    const pts = res.dataPoints;
    const { yoy } = latestAndYoy(res);
    return {
      product: meta.product,
      yoy: yoy != null ? String(yoy) : null,
      latest: pts.slice(-14).map(dp => ({
        period: dp.refPer.slice(0, 7),
        index: parseFloat(dp.value.toFixed(1)),
      })).reverse(),
    };
  }).filter(Boolean);

  const rmpi = Object.entries(RMPI).map(([key, meta]) => {
    if (key === 'total') return null; // skip aggregate for cards
    const res = data.get(meta.v);
    if (!res) return null;
    const pts = res.dataPoints;
    const { yoy } = latestAndYoy(res);
    return {
      commodity: meta.commodity,
      yoy: yoy != null ? String(yoy) : null,
      latest: pts.slice(-14).map(dp => ({
        period: dp.refPer.slice(0, 7),
        index: parseFloat(dp.value.toFixed(1)),
      })).reverse(),
    };
  }).filter(Boolean);

  const alerts = ippi
    .filter(p => p && Math.abs(parseFloat(p.yoy ?? '0')) > 5)
    .map(p => ({
      product: p!.product.replace(/ \(ch [^)]+\)/, ''),
      yoy: parseFloat(p!.yoy ?? '0'),
      latest: p!.latest[0]?.index ?? null,
      severity: Math.abs(parseFloat(p!.yoy ?? '0')) > 10 ? 'high' : 'medium',
      date: new Date().toISOString().slice(0, 10),
    }))
    .sort((a, b) => Math.abs(b.yoy) - Math.abs(a.yoy))
    .slice(0, 5);

  return {
    source: 'Statistics Canada — tables 18100267, 18100268',
    generated: ippi[0]?.latest[0]?.period ?? '',
    lastUpdated: new Date().toISOString(),
    note: 'Live via StatsCan WDS API — index 2020=100',
    alerts,
    ippi,
    rmpi,
  };
}

// ── Exports ────────────────────────────────────────────────────────────────────
// Export destinations come from StatsCan 12-10-0011-01 but that table is
// annual and large. We continue serving the static snapshot for destinations/
// partner tariff rates, and only refresh YoY on the IPPI/RMPI side.
// A future step can wire up the bilateral trade API (UN Comtrade) here.
export async function fetchExports() {
  return null; // signal to route handler to use static file
}
