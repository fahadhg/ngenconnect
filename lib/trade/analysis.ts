import type { TariffItem, ImportOverlay } from './data';
import { getHS6, getBestFTA } from './data';
import { calculateHHI, getROO, type ROORule } from './roo';

// Countries considered geopolitically aligned / friend-shored for Canada
const ALLIED_COUNTRIES = new Set([
  'US', 'MX', 'GB', 'DE', 'FR', 'IT', 'NL', 'BE', 'ES', 'SE', 'NO', 'DK', 'FI',
  'JP', 'KR', 'AU', 'NZ', 'TW', 'SG', 'IE', 'AT', 'CH', 'PL', 'CZ', 'PT'
]);

const NON_ALIGNED = new Set(['CN', 'RU', 'BY', 'IR', 'KP']);

export interface RiskAssessment {
  score: number;          // 0-100, higher = more risk
  level: 'low' | 'med' | 'high' | 'critical';
  concentration: number;  // % from top source
  hhi: number;            // Herfindahl-Hirschman Index (0-10000)
  hhiLevel: 'low' | 'moderate' | 'high';
  topSource: string;
  isAllied: boolean;
  hasFTA: boolean;
  ftaSaving: number;      // % saving available via FTA
  factors: string[];
}

export function assessRisk(item: TariffItem, imp: ImportOverlay[string] | null): RiskAssessment {
  let score = 0;
  const factors: string[] = [];

  // 1. HHI-based concentration (industry standard: antitrust regulators use this)
  // HHI = sum of squared market shares. >2500 = highly concentrated, 1500-2500 = moderate
  const concentration = imp?.p || 0;
  const topSource = imp?.c?.[0]?.k || '—';
  const shares = imp?.c?.map(c => Math.round(c.v / (imp?.t || 1) * 100)) || [];
  const { hhi, level: hhiLevel } = calculateHHI(shares);

  if (hhi > 5000) { score += 35; factors.push(`HHI ${hhi} — highly concentrated (${concentration}% from ${topSource})`); }
  else if (hhi > 2500) { score += 25; factors.push(`HHI ${hhi} — concentrated`); }
  else if (hhi > 1500) { score += 12; factors.push(`HHI ${hhi} — moderately concentrated`); }

  // 2. Geopolitical alignment (based on World Bank governance indicators grouping)
  const isAllied = ALLIED_COUNTRIES.has(topSource);
  const isNonAligned = NON_ALIGNED.has(topSource);

  if (isNonAligned) { score += 30; factors.push(`Top source (${topSource}) — non-aligned, sanctions/surtax risk`); }
  else if (!isAllied && topSource !== '—') { score += 10; factors.push(`Top source (${topSource}) — neutral alignment`); }

  // 3. Tariff exposure
  if (item.m >= 20) { score += 15; factors.push(`High MFN rate: ${item.m}%`); }
  else if (item.m >= 10) { score += 8; }
  else if (item.m > 0) { score += 3; }

  // 4. FTA savings not being used
  const best = getBestFTA(item);
  const ftaSaving = best && item.m > 0 ? Math.round((item.m - best.rate) / item.m * 100) : 0;
  const hasFTA = best != null && best.rate < item.m;

  if (ftaSaving > 50 && isNonAligned) {
    score += 15;
    factors.push(`${ftaSaving}% FTA saving available but sourcing from non-FTA origin`);
  }

  // 5. Few alternative sources
  const numSources = imp?.c?.length || 0;
  if (numSources <= 1) { score += 10; factors.push('Single known source'); }

  const level = score >= 60 ? 'critical' : score >= 40 ? 'high' : score >= 20 ? 'med' : 'low';

  return { score: Math.min(score, 100), level, concentration, hhi, hhiLevel, topSource, isAllied, hasFTA, ftaSaving, factors };
}

export interface BOMItem {
  partNumber: string;
  hsCode: string;
  description: string;
  unitCost: number;
  annualQty: number;
  origin: string;
  matchedTariff: TariffItem | null;
  mfnRate: number;
  preferentialRate: number;
  bestFTA: string;
  annualDuty: number;
  annualSaving: number;
  risk: RiskAssessment | null;
}

export function parseBOM(
  csv: string,
  tariffData: TariffItem[],
  importData: ImportOverlay
): BOMItem[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase();
  const cols = header.split(',').map(c => c.trim().replace(/"/g, ''));

  // Flexible column matching
  const hsIdx = cols.findIndex(c => c.includes('hs') || c.includes('tariff') || c.includes('code'));
  const descIdx = cols.findIndex(c => c.includes('desc') || c.includes('part') || c.includes('name'));
  const costIdx = cols.findIndex(c => c.includes('cost') || c.includes('price') || c.includes('unit'));
  const qtyIdx = cols.findIndex(c => c.includes('qty') || c.includes('quantity') || c.includes('volume') || c.includes('annual'));
  const originIdx = cols.findIndex(c => c.includes('origin') || c.includes('country') || c.includes('source'));
  const partIdx = cols.findIndex(c => c.includes('part') || c.includes('sku') || c.includes('item') || c.includes('#'));

  return lines.slice(1).filter(l => l.trim()).map((line, i) => {
    const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const hsRaw = vals[hsIdx >= 0 ? hsIdx : 0] || '';
    const hs6 = hsRaw.replace(/\./g, '').slice(0, 6);

    // Match to tariff data
    const matched = tariffData.find(t => getHS6(t.h) === hs6) || null;
    const mfnRate = matched?.m || 0;
    const best = matched ? getBestFTA(matched) : null;
    const preferentialRate = best?.rate || mfnRate;

    const unitCost = parseFloat(vals[costIdx >= 0 ? costIdx : 2]) || 0;
    const annualQty = parseInt(vals[qtyIdx >= 0 ? qtyIdx : 3]) || 0;
    const origin = vals[originIdx >= 0 ? originIdx : 4] || '—';

    const cif = unitCost * 1.06;
    const annualDuty = Math.round(cif * annualQty * mfnRate / 100);
    const annualDutyPref = Math.round(cif * annualQty * preferentialRate / 100);
    const annualSaving = annualDuty - annualDutyPref;

    const imp = importData[hsRaw] || importData[hs6] || null;
    const risk = matched ? assessRisk(matched, imp) : null;

    return {
      partNumber: vals[partIdx >= 0 ? partIdx : 0] || `Line ${i + 1}`,
      hsCode: hsRaw,
      description: vals[descIdx >= 0 ? descIdx : 1] || matched?.d || '—',
      unitCost, annualQty, origin,
      matchedTariff: matched,
      mfnRate, preferentialRate,
      bestFTA: best?.label || '—',
      annualDuty, annualSaving, risk
    };
  });
}

export interface DrawbackEstimate {
  importHS: string;
  exportHS: string;
  importDesc: string;
  exportDesc: string;
  dutyPaid: number;
  // Three methods per Customs Act / CUSMA
  methods: {
    name: string;
    refund: number;
    rate: number;
    basis: string;
  }[];
  recommended: number; // index of recommended method
  notes: string;
}

export function estimateDrawback(
  importHS: string,
  exportHS: string,
  annualImportValue: number,
  tariffData: TariffItem[],
  usRates?: Record<string, number>
): DrawbackEstimate {
  const impItem = tariffData.find(t => getHS6(t.h) === importHS.replace(/\./g, '').slice(0, 6));
  const expItem = tariffData.find(t => getHS6(t.h) === exportHS.replace(/\./g, '').slice(0, 6));

  const mfnRate = impItem?.m || 0;
  const cif = annualImportValue * 1.06;
  const dutyPaid = Math.round(cif * mfnRate / 100);
  const isSameChapter = importHS.replace(/\./g,'').slice(0,2) === exportHS.replace(/\./g,'').slice(0,2);

  // Method 1: Customs Act s.89 — Same-condition drawback (100% refund)
  const m1Refund = dutyPaid;

  // Method 2: Customs Act s.89 — Processed goods drawback
  const m2Rate = isSameChapter ? 0.85 : 0.70;
  const m2Refund = Math.round(dutyPaid * m2Rate);

  // Method 3: CUSMA Article 2.5 — Drawback cap
  // Now using REAL US HTS general rates from USITC API (1,370 codes)
  const exportHS6 = exportHS.replace(/\./g, '').slice(0, 6);
  const usRate = usRates?.[exportHS6];
  const usRateSource = usRate !== undefined ? 'USITC HTS (live)' : 'estimated from General Tariff column';
  const effectiveUSRate = usRate ?? (expItem?.g || 0);
  const usDutyOwed = Math.round(annualImportValue * effectiveUSRate / 100);
  const m3Refund = Math.min(dutyPaid, usDutyOwed);

  const methods = [
    { name: 'Same-condition (s.89)', refund: m1Refund, rate: 1.0, basis: '100% refund — goods re-exported unchanged within 4 years. Requires proof goods not altered in Canada (D7-4-2).' },
    { name: 'Processed goods (s.89)', refund: m2Refund, rate: m2Rate, basis: `Goods transformed and exported. Est. ${Math.round(m2Rate*100)}% refund based on ${isSameChapter?'same':'cross'}-chapter transformation. Actual rate depends on export value / total production value (D7-4-3).` },
    { name: 'CUSMA cap (Art. 2.5)', refund: m3Refund, rate: dutyPaid > 0 ? m3Refund/dutyPaid : 0, basis: `For US/MX exports: capped at lesser of Canadian duty ($${dutyPaid.toLocaleString()}) or US duty owed ($${usDutyOwed.toLocaleString()} at ${effectiveUSRate}% — source: ${usRateSource}).` },
  ];

  // Recommend the highest refund
  const recommended = methods.reduce((best, m, i) => m.refund > methods[best].refund ? i : best, 0);

  let notes = '';
  if (mfnRate === 0) notes = 'Import is duty-free — no drawback applicable.';
  else if (m3Refund === 0 && dutyPaid > 0) notes = 'CUSMA cap yields $0 — if exporting to US/MX, the US rate on your finished good may be Free, capping drawback. Consider same-condition or processed goods route if re-exporting to non-CUSMA markets.';
  else notes = `Best case: ${methods[recommended].name} = $${methods[recommended].refund.toLocaleString()} refund. File K32 claim with CBSA within 4 years of import.`;

  return {
    importHS, exportHS,
    importDesc: impItem?.d || '—',
    exportDesc: expItem?.d || '—',
    dutyPaid, methods, recommended, notes
  };
}

export interface WhatIfResult {
  hsCode: string;
  description: string;
  currentRate: number;
  newRate: number;
  impactPerUnit: number;
  annualImpact: number;
  importValue: number;
  basis: string;
}

// Map ISO2 country codes to the FTA rate field they qualify under
const ORIGIN_FTA_MAP: Record<string, keyof TariffItem> = {
  US: 'us', MX: 'mx',  // CUSMA
  DE: 'eu', FR: 'eu', IT: 'eu', NL: 'eu', BE: 'eu', ES: 'eu', SE: 'eu', NO: 'eu',
  DK: 'eu', FI: 'eu', IE: 'eu', AT: 'eu', PL: 'eu', CZ: 'eu', PT: 'eu', HU: 'eu',
  RO: 'eu', BG: 'eu', HR: 'eu', LT: 'eu', LV: 'eu', EE: 'eu', SK: 'eu', SI: 'eu', GR: 'eu',  // CETA
  GB: 'uk',  // UK TCA
  JP: 'jp',  // Japan (CPTPP)
  KR: 'kr',  // Korea
  AU: 'cp', NZ: 'cp', SG: 'cp', MY: 'cp', VN: 'cp', BN: 'cp', CL: 'cp', PE: 'cp',  // CPTPP
};

function getCurrentRateForOrigin(item: TariffItem, origin: string): { rate: number; basis: string } {
  const ftaField = ORIGIN_FTA_MAP[origin];
  if (ftaField && item[ftaField] != null) {
    return { rate: item[ftaField] as number, basis: String(FTA_LABELS_MAP[ftaField] || ftaField) };
  }
  return { rate: item.m, basis: 'MFN' };
}

const FTA_LABELS_MAP: Record<string, string> = {
  us: 'CUSMA', mx: 'CUSMA', eu: 'CETA', cp: 'CPTPP', uk: 'UK', jp: 'Japan', kr: 'Korea'
};

export function runWhatIf(
  tariffData: TariffItem[],
  importData: ImportOverlay,
  targetChapters: number[],
  targetOrigins: string[],
  surtaxChange: number
): WhatIfResult[] {
  return tariffData
    .filter(r => targetChapters.length === 0 || targetChapters.includes(r.c))
    .map(r => {
      const hs6 = getHS6(r.h);
      const imp = importData[r.h] || importData[hs6];
      if (!imp) return null;

      // Check if any top source matches target origins
      const affectedValue = targetOrigins.length === 0
        ? imp.t
        : imp.c.filter(c => targetOrigins.includes(c.k)).reduce((s, c) => s + c.v, 0);

      if (affectedValue === 0) return null;

      // Use the ACTUAL rate the targeted origin currently pays — not MFN
      // If multiple origins targeted, use the first one's FTA status as representative
      const primaryOrigin = targetOrigins[0] || imp.c[0]?.k || '';
      const { rate: currentRate, basis } = getCurrentRateForOrigin(r, primaryOrigin);
      const newRate = currentRate + surtaxChange;
      const impactPerUnit = Math.round((surtaxChange / 100) * 106) / 100;
      const annualImpact = Math.round(affectedValue * surtaxChange / 100);

      // Only include if the rate actually changes
      if (surtaxChange === 0) return null;

      return {
        hsCode: r.h, description: r.d,
        currentRate, newRate, impactPerUnit,
        annualImpact, importValue: affectedValue,
        basis
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b!.annualImpact) - Math.abs(a!.annualImpact))
    .slice(0, 50) as WhatIfResult[];
}

// FTA gap analysis: codes where imports come from non-FTA origins but FTA rate = Free
export interface FTAGapItem {
  hsCode: string;
  description: string;
  chapter: number;
  mfnRate: number;
  bestFTARate: number;
  bestFTA: string;
  topNonFTASource: string;
  nonFTAValue: number;
  totalImports: number;
  annualWaste: number;
  roo: ROORule | null;      // Rules of origin for this chapter
  qualificationRisk: 'likely' | 'check' | 'complex'; // How hard to qualify for FTA
}

export function analyzeFTAGap(
  tariffData: TariffItem[],
  importData: ImportOverlay
): FTAGapItem[] {
  const FTA_COUNTRIES = new Set([
    'US', 'MX', 'GB', 'DE', 'FR', 'IT', 'NL', 'BE', 'ES', 'SE', 'NO', 'DK', 'FI',
    'JP', 'KR', 'AU', 'NZ', 'CL', 'PE', 'CO', 'SG', 'MY', 'VN', 'BN',
    'IE', 'AT', 'CH', 'PL', 'CZ', 'PT', 'GR', 'HU', 'RO', 'BG', 'HR', 'LT', 'LV', 'EE', 'SK', 'SI'
  ]);

  return tariffData
    .filter(r => r.m > 0)
    .map(r => {
      const hs6 = getHS6(r.h);
      const imp = importData[r.h] || importData[hs6];
      if (!imp) return null;

      const best = getBestFTA(r);
      if (!best || best.rate >= r.m) return null;

      // Find imports from non-FTA countries
      const nonFTAImports = imp.c.filter(c => !FTA_COUNTRIES.has(c.k));
      if (nonFTAImports.length === 0) return null;

      const nonFTAValue = nonFTAImports.reduce((s, c) => s + c.v, 0);
      const rateDiff = r.m - best.rate;
      const annualWaste = Math.round(nonFTAValue * rateDiff / 100);

      if (annualWaste < 100000) return null; // Only show significant gaps

      const roo = getROO(r.c);
      const qualificationRisk: 'likely' | 'check' | 'complex' = 
        roo?.difficulty === 'easy' ? 'likely' : 
        roo?.difficulty === 'hard' ? 'complex' : 'check';

      return {
        hsCode: r.h, description: r.d, chapter: r.c,
        mfnRate: r.m, bestFTARate: best.rate, bestFTA: best.label,
        topNonFTASource: nonFTAImports[0]?.n || nonFTAImports[0]?.k || '—',
        nonFTAValue, totalImports: imp.t, annualWaste,
        roo, qualificationRisk
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.annualWaste - a!.annualWaste)
    .slice(0, 50) as FTAGapItem[];
}
