/**
 * USITC HTS Online REST API client.
 * Endpoint: https://hts.usitc.gov/reststop/
 * Free, no API key required. Tariff schedule updates ~annually.
 *
 * Returns live US HTS tariff rates including:
 * - General (MFN) rate
 * - Special rates (CUSMA/USMCA = "CA", other FTAs)
 * - Column 2 rate
 * - Decoded Chapter 99 surcharge footnotes (Section 232, IEEPA, Section 301)
 */

const BASE = 'https://hts.usitc.gov/reststop';
const REVALIDATE = 86_400; // 24 h — HTS updates annually

// ── Known Chapter 99 surcharge codes ─────────────────────────────────────────

interface SurchargeInfo {
  label: string;
  rate: string;
  affectsCanada: boolean;
  severity: 'high' | 'medium' | 'info';
}

const CH99: Record<string, SurchargeInfo> = {
  // Canada IEEPA tariffs (Executive Order, Feb 2025)
  '9903.01.10': { label: 'Canada IEEPA tariff',           rate: '+35%', affectsCanada: true,  severity: 'high'   },
  '9903.01.13': { label: 'Canada energy IEEPA tariff',    rate: '+10%', affectsCanada: true,  severity: 'medium' },
  '9903.01.14': { label: 'CUSMA exemption (no change)',   rate: '0%',   affectsCanada: true,  severity: 'info'   },
  // Mexico IEEPA tariffs
  '9903.01.01': { label: 'Mexico IEEPA tariff',           rate: '+25%', affectsCanada: false, severity: 'info'   },
  // Section 232 — steel & aluminum national security tariffs
  '9903.80.01': { label: 'Section 232 — steel',          rate: '+25%', affectsCanada: true,  severity: 'high'   },
  '9903.80.05': { label: 'Section 232 — steel (relief)',  rate: 'TRQ',  affectsCanada: true,  severity: 'medium' },
  '9903.85.01': { label: 'Section 232 — aluminum',       rate: '+10%', affectsCanada: true,  severity: 'medium' },
  '9903.85.05': { label: 'Section 232 — alum (relief)',   rate: 'TRQ',  affectsCanada: true,  severity: 'medium' },
  // Section 301 — China (not Canada, shown for awareness)
  '9903.88.01': { label: 'Section 301 — China',          rate: '+25%', affectsCanada: false, severity: 'info'   },
  '9903.88.02': { label: 'Section 301 — China',          rate: '+25%', affectsCanada: false, severity: 'info'   },
  '9903.88.03': { label: 'Section 301 — China',          rate: '+25%', affectsCanada: false, severity: 'info'   },
  '9903.88.04': { label: 'Section 301 — China',          rate: '+25%', affectsCanada: false, severity: 'info'   },
  '9903.91.01': { label: 'Section 301 — China',          rate: '+25%', affectsCanada: false, severity: 'info'   },
  '9903.91.02': { label: 'Section 301 — China',          rate: '+50%', affectsCanada: false, severity: 'info'   },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HtsSurcharge {
  code: string;
  label: string;
  rate: string;
  affectsCanada: boolean;
  severity: 'high' | 'medium' | 'info';
}

export interface HtsResult {
  htsno: string;
  description: string;
  general: string | null;       // MFN rate, e.g. "Free" or "2.5%"
  generalPct: number | null;    // numeric form (0 = Free, 2.5 = 2.5%)
  cusmaRate: string | null;     // CUSMA/USMCA rate for Canada (from special column)
  hasCusma: boolean;            // "CA" found in special column
  col2: string | null;          // Column 2 (restricted countries)
  surcharges: HtsSurcharge[];   // decoded Chapter 99 footnotes
  canadaEffectiveNote: string;  // plain-language Canada tariff summary
  units: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseGeneralPct(raw: string | null): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'free' || s === '0%') return 0;
  const m = s.match(/^(\d+(?:\.\d+)?)%/);
  return m ? parseFloat(m[1]) : null;
}

function extractCusmaRate(special: string | null): { rate: string | null; hasCusma: boolean } {
  if (!special) return { rate: null, hasCusma: false };
  // CUSMA/USMCA shows as "CA" in the special column indicator list
  // e.g. "Free (A*,AU,...,CA,...)" or "1.5% (CA)"
  const hasCusma = /\bCA\b/.test(special);
  if (!hasCusma) return { rate: null, hasCusma: false };
  // Extract the rate associated with CA if it has its own — otherwise the same "Free"
  const freeMatch = special.match(/^(Free)/i);
  if (freeMatch) return { rate: 'Free (0%)', hasCusma: true };
  const pctMatch = special.match(/^([\d.]+%)/);
  return { rate: pctMatch ? pctMatch[1] : special.split('(')[0].trim(), hasCusma: true };
}

function decodeSurcharges(footnotes: { value: string }[]): HtsSurcharge[] {
  const surcharges: HtsSurcharge[] = [];
  for (const fn of footnotes) {
    const m = fn.value.match(/9903\.\d{2}\.\d{2}/);
    if (!m) continue;
    const code = m[0];
    const info = CH99[code];
    if (!info) continue;
    surcharges.push({ code, ...info });
  }
  return surcharges;
}

// Chapter ranges subject to Section 232 tariffs
function isSteel(chapter: string)    { return ['72','73'].includes(chapter); }
function isAluminum(chapter: string) { return chapter === '76'; }

function buildCanadaNote(
  generalPct: number | null,
  chapter: string,
  surcharges: HtsSurcharge[],
): string {
  // As of 2025, CUSMA "CA" no longer appears in the HTS special column —
  // IEEPA Executive Order overrides CUSMA preferential rates.
  // CUSMA-qualifying goods may still claim exemption via 9903.01.14.
  const hasS232steel = surcharges.some(s => s.code.startsWith('9903.80')) || isSteel(chapter);
  const hasS232alum  = surcharges.some(s => s.code.startsWith('9903.85')) || isAluminum(chapter);

  const base = generalPct != null ? (generalPct === 0 ? 'Free' : `${generalPct}% MFN`) : 'MFN rate';

  const parts: string[] = [base, '+35% IEEPA (Canada, 9903.01.10)'];
  if (hasS232steel) parts.push('+25% Section 232 steel');
  if (hasS232alum)  parts.push('+10% Section 232 aluminum');

  const total = parts.join(' ');
  return `${total}. CUSMA-qualifying goods may claim exemption (9903.01.14).`;
}

// ── Main fetch ────────────────────────────────────────────────────────────────

export async function fetchHtsRate(htsCode: string): Promise<HtsResult[]> {
  const keyword = htsCode.trim().replace(/\s+/g, '');
  const url = `${BASE}/search?keyword=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, { next: { revalidate: REVALIDATE } });
  if (!res.ok) throw new Error(`USITC HTS HTTP ${res.status}`);

  const raw: any[] = await res.json();
  if (!Array.isArray(raw)) throw new Error('USITC HTS: unexpected response shape');

  // Only return items with an actual rate (leaf nodes)
  const leaves = raw.filter(r => r.general !== null || r.htsno === keyword);

  return leaves.map(r => {
    const general    = r.general as string | null;
    const special    = r.special as string | null;
    const generalPct = parseGeneralPct(general);
    const { rate: cusmaRate, hasCusma } = extractCusmaRate(special);
    const surcharges = decodeSurcharges(r.footnotes ?? []);
    const chapter    = (r.htsno as string).replace(/\./g, '').slice(0, 2);
    const canadaEffectiveNote = buildCanadaNote(generalPct, chapter, surcharges);

    return {
      htsno:               r.htsno,
      description:         r.description ?? '',
      general:             general,
      generalPct,
      cusmaRate,
      hasCusma,
      col2:                r.other as string | null,
      surcharges,
      canadaEffectiveNote,
      units:               r.units ?? [],
    };
  });
}
