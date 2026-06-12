/**
 * Transforms raw Comtrade rows into the shapes the existing atlas routes return.
 * Keeps the same response contract so no frontend changes are needed.
 */

import { fetchBilateral, type ComtradeRow } from './client';

const ISO3_REGION: Record<string, string> = {
  USA:'Americas',MEX:'Americas',BRA:'Americas',CHL:'Americas',ARG:'Americas',
  COL:'Americas',PER:'Americas',ECU:'Americas',GTM:'Americas',CRI:'Americas',
  CUB:'Americas',VEN:'Americas',BOL:'Americas',PRY:'Americas',URY:'Americas',
  PAN:'Americas',DOM:'Americas',TTO:'Americas',JAM:'Americas',HND:'Americas',
  DEU:'Europe',GBR:'Europe',FRA:'Europe',ITA:'Europe',NLD:'Europe',ESP:'Europe',
  CHE:'Europe',SWE:'Europe',BEL:'Europe',NOR:'Europe',AUT:'Europe',DNK:'Europe',
  FIN:'Europe',POL:'Europe',CZE:'Europe',HUN:'Europe',ROU:'Europe',PRT:'Europe',
  GRC:'Europe',BGR:'Europe',HRV:'Europe',SVK:'Europe',SVN:'Europe',LTU:'Europe',
  LVA:'Europe',EST:'Europe',IRL:'Europe',LUX:'Europe',RUS:'Europe',UKR:'Europe',
  CHN:'Asia',JPN:'Asia',KOR:'Asia',IND:'Asia',TWN:'Asia',MYS:'Asia',THA:'Asia',
  VNM:'Asia',IDN:'Asia',SGP:'Asia',PHL:'Asia',PAK:'Asia',BGD:'Asia',KAZ:'Asia',
  ARE:'Asia',SAU:'Asia',TUR:'Asia',ISR:'Asia',IRQ:'Asia',IRN:'Asia',QAT:'Asia',
  KWT:'Asia',OMN:'Asia',JOR:'Asia',LKA:'Asia',MMR:'Asia',KHM:'Asia',HKG:'Asia',
  ZAF:'Africa',NGA:'Africa',EGY:'Africa',DZA:'Africa',MAR:'Africa',ETH:'Africa',
  KEN:'Africa',GHA:'Africa',TZA:'Africa',CIV:'Africa',AGO:'Africa',TUN:'Africa',
  AUS:'Oceania',NZL:'Oceania',PNG:'Oceania',
};

const REGION_COLORS: Record<string, string> = {
  Americas:'#8b2020',Asia:'#4a8a4a',Europe:'#3d85c8',
  Oceania:'#e8b84b',Africa:'#7c4dbd',Other:'#888888',
};

const COORDS: Record<string, [number,number]> = {
  USA:[37.09,-95.71],CHN:[35.86,104.19],MEX:[23.63,-102.55],JPN:[36.20,138.25],
  DEU:[51.17,10.45],GBR:[55.38,-3.44],KOR:[35.91,127.77],FRA:[46.23,2.21],
  ITA:[41.87,12.57],IND:[20.59,78.96],BRA:[-14.24,-51.93],NLD:[52.13,5.29],
  CHE:[46.82,8.23],AUS:[-25.27,133.78],ESP:[40.46,-3.75],MYS:[4.21,101.98],
  TWN:[23.70,120.96],BEL:[50.50,4.47],SWE:[60.13,18.64],THA:[15.87,100.99],
  NOR:[60.47,8.47],VNM:[14.06,108.28],ZAF:[-30.56,22.94],IDN:[-0.79,113.92],
  ARE:[23.42,53.85],SAU:[23.89,45.08],TUR:[38.96,35.24],POL:[51.92,19.14],
  CHL:[-35.68,-71.54],ARG:[-38.42,-63.62],COL:[4.57,-74.30],PHL:[12.88,121.77],
  CZE:[49.82,15.47],AUT:[47.52,14.55],DNK:[56.26,9.50],RUS:[61.52,105.32],
  FIN:[61.92,25.75],PRT:[39.40,-8.22],SGP:[1.35,103.82],HUN:[47.16,19.50],
  ISR:[31.05,34.85],NZL:[-40.90,174.89],GRC:[39.07,21.82],IRQ:[33.22,43.68],
  PAK:[30.38,69.35],EGY:[26.82,30.80],BGR:[42.73,25.49],ROU:[45.94,24.97],
  UKR:[48.38,31.17],HRV:[45.10,15.20],KAZ:[48.02,66.92],DZA:[28.03,1.66],
  MAR:[31.79,-7.09],PER:[-9.19,-75.02],NGA:[9.08,8.68],ECU:[-1.83,-78.18],
  GTM:[15.78,-90.23],CRI:[9.75,-83.75],CIV:[7.54,-5.55],HKG:[22.32,114.17],
  QAT:[25.35,51.18],KWT:[29.37,47.98],OMN:[21.51,55.92],JOR:[30.59,36.24],
  LKA:[7.87,80.77],MMR:[19.17,96.66],KHM:[12.57,104.99],BGD:[23.68,90.35],
  ETH:[9.15,40.49],KEN:[-0.02,37.91],GHA:[7.95,-1.02],TZA:[-6.37,34.89],
  AGO:[-11.20,17.87],TUN:[33.89,9.54],PNG:[-6.31,143.96],
};

// ── trade-partners shape ────────────────────────────────────────────────────────
export async function tradePartnersLive(year: number) {
  const [exports, imports] = await Promise.all([
    fetchBilateral(year, 'X'),
    fetchBilateral(year, 'M'),
  ]);

  const exportMap = new Map(exports.map(r => [r.iso3, r.primaryValue]));
  const importMap = new Map(imports.map(r => [r.iso3, r.primaryValue]));

  const iso3Set = new Set([...exportMap.keys(), ...importMap.keys()]);
  const partners = Array.from(iso3Set)
    .map(iso3 => {
      const coords = COORDS[iso3];
      if (!coords) return null;
      const exportValue = exportMap.get(iso3) ?? 0;
      const importValue = importMap.get(iso3) ?? 0;
      return {
        iso3,
        name: ISO3_NAME[iso3] ?? iso3,
        lat: coords[0],
        lng: coords[1],
        exportValue,
        importValue,
        totalTrade: exportValue + importValue,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.totalTrade > 0)
    .sort((a, b) => b.totalTrade - a.totalTrade)
    .slice(0, 50);

  return { status: 'ok', year, partners, source: 'UN Comtrade public API' };
}

// ── trade-history shape ─────────────────────────────────────────────────────────
export async function tradeHistoryLive(mode: 'export' | 'import') {
  const flow = mode === 'export' ? 'X' : 'M';

  // Comtrade annual data typically lags ~6 months; cap at prior year.
  // Fetch 5 years sequentially in two batches to avoid rate-limiting 10 parallel calls.
  const priorYear = new Date().getFullYear() - 1;
  const years = [priorYear - 4, priorYear - 3, priorYear - 2, priorYear - 1, priorYear];

  // Fetch each year sequentially (X+M in parallel per year) to stay within the
  // public API's rate limit. This only runs on cache miss (~once per 24h on Vercel).
  const allRows: ComtradeRow[] = [];
  for (const y of years) {
    const settled = await Promise.allSettled([fetchBilateral(y, 'X'), fetchBilateral(y, 'M')]);
    for (const r of settled) {
      if (r.status === 'fulfilled') allRows.push(...r.value);
    }
  }
  const flowRows = allRows.filter(r => r.flowCode === flow);

  const availableYears = [...new Set(flowRows.map(r => r.refYear))].sort((a,b)=>a-b);

  const byRegion = new Map<string, Map<number, number>>();
  for (const r of flowRows) {
    const region = ISO3_REGION[r.iso3] ?? 'Other';
    if (!byRegion.has(region)) byRegion.set(region, new Map());
    const prev = byRegion.get(region)!.get(r.refYear) ?? 0;
    byRegion.get(region)!.set(r.refYear, prev + r.primaryValue);
  }

  const regionOrder = ['Americas','Asia','Europe','Africa','Oceania','Other'];
  const regions = regionOrder
    .filter(r => byRegion.has(r))
    .map(r => ({
      name:  r,
      color: REGION_COLORS[r],
      data:  availableYears.map(y => ({ year: y, value: byRegion.get(r)!.get(y) ?? 0 })),
    }));

  const latestYear = availableYears[availableYears.length - 1];
  const total = regions.reduce(
    (s, r) => s + (r.data.find(d => d.year === latestYear)?.value ?? 0), 0
  );

  return { years: availableYears, regions, total, latestYear, source: 'UN Comtrade public API' };
}

// Country name lookup (common names only)
const ISO3_NAME: Record<string, string> = {
  USA:'United States',CHN:'China',GBR:'United Kingdom',DEU:'Germany',JPN:'Japan',
  FRA:'France',ITA:'Italy',KOR:'South Korea',NLD:'Netherlands',MEX:'Mexico',
  IND:'India',AUS:'Australia',CHE:'Switzerland',ESP:'Spain',BRA:'Brazil',
  MYS:'Malaysia',TWN:'Taiwan',BEL:'Belgium',SWE:'Sweden',THA:'Thailand',
  NOR:'Norway',VNM:'Vietnam',ZAF:'South Africa',IDN:'Indonesia',ARE:'UAE',
  SAU:'Saudi Arabia',TUR:'Turkey',POL:'Poland',CHL:'Chile',ARG:'Argentina',
  COL:'Colombia',PHL:'Philippines',CZE:'Czech Republic',AUT:'Austria',
  DNK:'Denmark',RUS:'Russia',FIN:'Finland',PRT:'Portugal',SGP:'Singapore',
  HUN:'Hungary',ISR:'Israel',NZL:'New Zealand',GRC:'Greece',IRQ:'Iraq',
  PAK:'Pakistan',EGY:'Egypt',BGR:'Bulgaria',ROU:'Romania',UKR:'Ukraine',
  HRV:'Croatia',KAZ:'Kazakhstan',DZA:'Algeria',MAR:'Morocco',PER:'Peru',
  NGA:'Nigeria',ECU:'Ecuador',GTM:'Guatemala',CRI:'Costa Rica',CIV:"Côte d'Ivoire",
  HKG:'Hong Kong',QAT:'Qatar',KWT:'Kuwait',OMN:'Oman',JOR:'Jordan',LKA:'Sri Lanka',
  MMR:'Myanmar',KHM:'Cambodia',BGD:'Bangladesh',ETH:'Ethiopia',KEN:'Kenya',
  GHA:'Ghana',TZA:'Tanzania',AGO:'Angola',TUN:'Tunisia',PNG:'Papua New Guinea',
};
