/**
 * Fetches live Canada-specific tariff burden from USITC HTS.
 * Rates are derived from Chapter 99 anchor codes — no hardcoded percentages.
 *
 * Anchor codes (rates fetched live, cached 24h):
 *   9903.01.10  — Canada IEEPA general tariff
 *   9903.82.09  — Section 232 steel/alum derivative (general, covers Canada)
 *   9903.82.06  — Section 232 aluminum derivative (+10%)
 */

import { unstable_cache } from 'next/cache';

const BASE = 'https://hts.usitc.gov/reststop';

export interface AnchorRate {
  code: string;
  pct: number;
  raw: string;
  description: string;
}

export interface CanadaBurden {
  ieepa: AnchorRate | null;
  s232Steel: AnchorRate | null;
  s232Alum: AnchorRate | null;
  fetched: string;
}

// Parse the addon percentage from USITC general field.
// Handles "The duty provided in the applicable subheading + 35%", "35%", "No change"
function parseAddonPct(raw: string | null): number | null {
  if (!raw) return null;
  const plus = raw.match(/\+\s*(\d+(?:\.\d+)?)%/);
  if (plus) return parseFloat(plus[1]);
  const standalone = raw.match(/^(\d+(?:\.\d+)?)%$/);
  if (standalone) return parseFloat(standalone[1]);
  if (/no change/i.test(raw)) return 0;
  return null;
}

async function fetchAnchorRate(code: string): Promise<AnchorRate | null> {
  try {
    const res = await fetch(`${BASE}/search?keyword=${encodeURIComponent(code)}`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const rows: any[] = await res.json();
    const row = rows.find(r => r.htsno === code) ?? rows[0];
    if (!row) return null;
    const pct = parseAddonPct(row.general);
    if (pct == null) return null;
    return {
      code,
      pct,
      raw: row.general,
      description: (row.description ?? '').replace(/<[^>]+>/g, '').trim(),
    };
  } catch {
    return null;
  }
}

async function _fetchCanadaBurden(): Promise<CanadaBurden> {
  const [ieepa, s232Steel, s232Alum] = await Promise.all([
    fetchAnchorRate('9903.01.10'), // IEEPA Canada general
    fetchAnchorRate('9903.82.09'), // S232 steel +25%
    fetchAnchorRate('9903.82.06'), // S232 aluminum +10%
  ]);
  return { ieepa, s232Steel, s232Alum, fetched: new Date().toISOString().slice(0, 10) };
}

export const fetchCanadaBurden = unstable_cache(
  _fetchCanadaBurden,
  ['usitc-canada-burden'],
  { revalidate: 86400 },
);

// Fallback for when the live fetch fails
export const FALLBACK_BURDEN: CanadaBurden = {
  ieepa:     { code: '9903.01.10', pct: 35, raw: '+ 35%', description: 'Canada IEEPA tariff' },
  s232Steel: { code: '9903.82.09', pct: 25, raw: '+ 25%', description: 'Section 232 steel'   },
  s232Alum:  { code: '9903.82.06', pct: 10, raw: '+ 10%', description: 'Section 232 aluminum' },
  fetched: 'fallback',
};
