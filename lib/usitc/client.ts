/**
 * USITC HTS Online REST API client.
 * Endpoint: https://hts.usitc.gov/reststop/
 * Free, no API key required.
 *
 * All Canada-specific tariff rates (IEEPA, Section 232) are derived live
 * from Chapter 99 anchor codes via fetchCanadaBurden() — no hardcoded pcts.
 */

import { fetchCanadaBurden, FALLBACK_BURDEN } from './canada-burden';

const BASE = 'https://hts.usitc.gov/reststop';
const REVALIDATE = 86_400;

// ── Chapter 99 label/severity map (labels only — rates are live) ──────────────
// Kept compact: just the codes we recognise for display. Rates come from live data.

interface SurchargeInfo {
  label: string;
  affectsCanada: boolean;
  severity: 'high' | 'medium' | 'info';
}

const CH99: Record<string, SurchargeInfo> = {
  // Canada IEEPA
  '9903.01.10': { label: 'Canada IEEPA',           affectsCanada: true,  severity: 'high'   },
  '9903.01.13': { label: 'Canada energy IEEPA',    affectsCanada: true,  severity: 'medium' },
  '9903.01.14': { label: 'CUSMA exemption',        affectsCanada: true,  severity: 'info'   },
  '9903.01.15': { label: 'Canada potash IEEPA',    affectsCanada: true,  severity: 'medium' },
  // Mexico IEEPA
  '9903.01.01': { label: 'Mexico IEEPA',           affectsCanada: false, severity: 'info'   },
  // Section 232 — current 9903.82 range (replaces old 9903.80/9903.85)
  '9903.82.02': { label: 'Section 232 (steel/alum +50%)', affectsCanada: true,  severity: 'high'   },
  '9903.82.04': { label: 'Section 232 (UK steel)',         affectsCanada: false, severity: 'info'   },
  '9903.82.06': { label: 'Section 232 (alum derivative)',  affectsCanada: true,  severity: 'medium' },
  '9903.82.09': { label: 'Section 232 (steel/alum)',       affectsCanada: true,  severity: 'high'   },
  '9903.82.12': { label: 'Section 232 (deriv. alum/steel)', affectsCanada: true,  severity: 'high'  },
  '9903.85.67': { label: 'Section 232 — Russia alum +200%', affectsCanada: false, severity: 'info'  },
  '9903.85.68': { label: 'Section 232 — Russia alum +200%', affectsCanada: false, severity: 'info'  },
  // Section 301 — China
  '9903.88.01': { label: 'Section 301 — China',   affectsCanada: false, severity: 'info'   },
  '9903.88.02': { label: 'Section 301 — China',   affectsCanada: false, severity: 'info'   },
  '9903.88.03': { label: 'Section 301 — China',   affectsCanada: false, severity: 'info'   },
  '9903.88.04': { label: 'Section 301 — China',   affectsCanada: false, severity: 'info'   },
  '9903.91.01': { label: 'Section 301 — China',   affectsCanada: false, severity: 'info'   },
  '9903.91.02': { label: 'Section 301 — China',   affectsCanada: false, severity: 'info'   },
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
  general: string | null;
  generalPct: number | null;
  cusmaRate: string | null;
  hasCusma: boolean;
  col2: string | null;
  surcharges: HtsSurcharge[];
  canadaEffectiveNote: string;
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
  const hasCusma = /\bCA\b/.test(special);
  if (!hasCusma) return { rate: null, hasCusma: false };
  const freeMatch = special.match(/^(Free)/i);
  if (freeMatch) return { rate: 'Free (0%)', hasCusma: true };
  const pctMatch = special.match(/^([\d.]+%)/);
  return { rate: pctMatch ? pctMatch[1] : special.split('(')[0].trim(), hasCusma: true };
}

function decodeSurcharges(footnotes: { value: string }[], liveRateMap: Record<string, string>): HtsSurcharge[] {
  const seen = new Set<string>();
  const out: HtsSurcharge[] = [];
  for (const fn of footnotes) {
    const m = fn.value.match(/9903\.\d{2}\.\d{2}/);
    if (!m) continue;
    const code = m[0];
    if (seen.has(code)) continue;
    seen.add(code);
    const info = CH99[code];
    if (!info) continue;
    // Prefer live rate from burden data, fall back to code-level label
    const rate = liveRateMap[code] ?? '(see USITC)';
    out.push({ code, label: info.label, rate, affectsCanada: info.affectsCanada, severity: info.severity });
  }
  return out;
}

function isSteel(chapter: string)    { return ['72', '73'].includes(chapter); }
function isAluminum(chapter: string) { return chapter === '76'; }

function buildCanadaNote(
  generalPct: number | null,
  chapter: string,
  burden: typeof FALLBACK_BURDEN,
): string {
  const ieepaPct    = burden.ieepa?.pct    ?? 35;
  const ieepaCodes  = burden.ieepa?.code   ?? '9903.01.10';
  const steelPct    = burden.s232Steel?.pct ?? 25;
  const alumPct     = burden.s232Alum?.pct  ?? 10;

  const base = generalPct != null ? (generalPct === 0 ? 'Free' : `${generalPct}% MFN`) : 'MFN rate';
  const parts: string[] = [base, `+${ieepaPct}% IEEPA (Canada, ${ieepaCodes})`];
  if (isSteel(chapter))    parts.push(`+${steelPct}% Section 232 steel`);
  if (isAluminum(chapter)) parts.push(`+${alumPct}% Section 232 aluminum`);

  return `${parts.join(' ')}. CUSMA-qualifying goods may claim exemption (9903.01.14).`;
}

// ── Main fetch ────────────────────────────────────────────────────────────────

export async function fetchHtsRate(htsCode: string): Promise<HtsResult[]> {
  const keyword = htsCode.trim().replace(/\s+/g, '');
  const url = `${BASE}/search?keyword=${encodeURIComponent(keyword)}`;

  // Fetch HTS data and live Canada burden in parallel
  const [res, burden] = await Promise.all([
    fetch(url, { next: { revalidate: REVALIDATE } }),
    fetchCanadaBurden().catch(() => FALLBACK_BURDEN),
  ]);

  if (!res.ok) throw new Error(`USITC HTS HTTP ${res.status}`);
  const raw: any[] = await res.json();
  if (!Array.isArray(raw)) throw new Error('USITC HTS: unexpected response shape');

  // Build a rate map for footnote decoding: code → "+N%"
  const liveRateMap: Record<string, string> = {};
  if (burden.ieepa)     liveRateMap[burden.ieepa.code]     = `+${burden.ieepa.pct}%`;
  if (burden.s232Steel) liveRateMap[burden.s232Steel.code] = `+${burden.s232Steel.pct}%`;
  if (burden.s232Alum)  liveRateMap[burden.s232Alum.code]  = `+${burden.s232Alum.pct}%`;

  const leaves = raw.filter(r => r.general !== null || r.htsno === keyword);

  return leaves.map(r => {
    const general    = r.general as string | null;
    const special    = r.special as string | null;
    const generalPct = parseGeneralPct(general);
    const { rate: cusmaRate, hasCusma } = extractCusmaRate(special);
    const surcharges = decodeSurcharges(r.footnotes ?? [], liveRateMap);
    const chapter    = (r.htsno as string).replace(/\./g, '').slice(0, 2);
    const canadaEffectiveNote = buildCanadaNote(generalPct, chapter, burden);

    return {
      htsno:      r.htsno,
      description: r.description ?? '',
      general,
      generalPct,
      cusmaRate,
      hasCusma,
      col2:       r.other as string | null,
      surcharges,
      canadaEffectiveNote,
      units:      r.units ?? [],
    };
  });
}
