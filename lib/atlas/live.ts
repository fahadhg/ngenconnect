/**
 * Harvard Atlas of Economic Complexity — live GraphQL client.
 *
 * Queries are scoped to specific years so each call is small (~100-500 KB).
 * Responses are cached for 24 hours (Atlas data is annual; releases lag ~6 months).
 *
 * Endpoint: https://atlas.hks.harvard.edu/api/graphql
 */

const GQL = 'https://atlas.hks.harvard.edu/api/graphql';
const REVALIDATE = 86_400; // 24 h

async function query<T>(q: string): Promise<T> {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) throw new Error(`Atlas HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error('Atlas: empty data');
  return json.data;
}

// ── Canada's latest year with ECI data ──────────────────────────────────────

export async function fetchLatestAtlasYear(): Promise<number> {
  const data = await query<{ countryYear: { year: number; eci: number | null }[] }>(`{
    countryYear(countryId: 124, yearMin: 2020, yearMax: 2030) {
      year eci
    }
  }`);
  const rows = data.countryYear.filter(r => r.eci != null);
  if (!rows.length) return 2024;
  return Math.max(...rows.map(r => r.year));
}

// ── Sector-year data for global-share (HS1) ──────────────────────────────────

export interface LiveSectorRow {
  productId: string;
  year: number;
  exportValue: number | null;
  importValue: number | null;
  exportRca: number | null;
  globalMarketShare: number | null;
}

export async function fetchSectorYearRange(yearMin: number, yearMax: number): Promise<LiveSectorRow[]> {
  const data = await query<{ countryProductYear: LiveSectorRow[] }>(`{
    countryProductYear(countryId: 124, productClass: HS92, productLevel: 1,
      yearMin: ${yearMin}, yearMax: ${yearMax}) {
      productId year exportValue importValue exportRca globalMarketShare
    }
  }`);
  return data.countryProductYear;
}

// ── Product-year data for growth-opportunity (HS4, 2 specific years) ─────────

export interface LiveProductRow {
  productId: string;
  year: number;
  exportValue: number | null;
  importValue: number | null;
  exportRca: number | null;
  globalMarketShare: number | null;
  normalizedPci: number | null;
}

export async function fetchProductYearTwoPoints(
  currentYear: number,
  prevYear: number,
): Promise<LiveProductRow[]> {
  const [cur, prev] = await Promise.all([
    query<{ countryProductYear: LiveProductRow[] }>(`{
      countryProductYear(countryId: 124, productClass: HS92, productLevel: 4,
        yearMin: ${currentYear}, yearMax: ${currentYear}) {
        productId year exportValue importValue exportRca globalMarketShare normalizedPci
      }
    }`),
    query<{ countryProductYear: LiveProductRow[] }>(`{
      countryProductYear(countryId: 124, productClass: HS92, productLevel: 4,
        yearMin: ${prevYear}, yearMax: ${prevYear}) {
        productId year exportValue importValue exportRca globalMarketShare normalizedPci
      }
    }`),
  ]);
  return [...cur.countryProductYear, ...prev.countryProductYear];
}

// ── World product PCI for a single year ───────────────────────────────────────

export interface LivePciRow {
  productId: string;
  year: number;
  pci: number | null;
  exportValue: number | null;
}

export async function fetchProductPciYear(year: number): Promise<LivePciRow[]> {
  const data = await query<{ productYear: LivePciRow[] }>(`{
    productYear(productClass: HS92, productLevel: 4,
      yearMin: ${year}, yearMax: ${year}) {
      productId year pci exportValue
    }
  }`);
  return data.productYear;
}

// ── Product metadata ──────────────────────────────────────────────────────────

export interface LiveProduct {
  productId: string;
  code: string;
  nameShortEn: string;
  topParent?: { productId: string; code: string; nameShortEn: string };
}

export async function fetchProducts(): Promise<LiveProduct[]> {
  const data = await query<{ productHs92: LiveProduct[] }>(`{
    productHs92(productLevel: 4) {
      productId code nameShortEn
      topParent { productId code nameShortEn }
    }
  }`);
  return data.productHs92;
}

// ── Sector metadata ───────────────────────────────────────────────────────────

export interface LiveSector {
  productId: string;
  code: string;
  nameShortEn: string;
}

export async function fetchSectors(): Promise<LiveSector[]> {
  const data = await query<{ productHs92: LiveSector[] }>(`{
    productHs92(productLevel: 1) { productId code nameShortEn }
  }`);
  return data.productHs92;
}
