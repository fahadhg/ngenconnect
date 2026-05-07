/**
 * Local Atlas data loader — reads from data/atlas/*.json files.
 * Module-level caching means each file is parsed once per serverless warm instance.
 *
 * Populate with: npx tsx scripts/fetch-atlas-data.ts
 */

import fs   from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'data', 'atlas');

function read<T>(name: string): T {
  const file = path.join(DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Atlas data file missing: ${file}\n` +
      `Run: npx tsx scripts/fetch-atlas-data.ts`
    );
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

const _cache: Record<string, any[]> = {};
function get<T extends any[] = any[]>(name: string): T {
  if (!_cache[name]) _cache[name] = read<T>(name);
  return _cache[name] as T;
}

// ── Type definitions ───────────────────────────────────────────────────────

export interface Product {
  productId: string;
  code: string;
  nameShortEn: string;
  topParent?: { productId: string; code: string; nameShortEn: string };
}

export interface Sector {
  productId: string;
  code: string;
  nameShortEn: string;
}

export interface Country {
  countryId: string;
  iso3Code: string;
  nameShortEn: string;
}

export interface CanadaYearRow {
  year: number;
  exportValue: number | null;
  importValue: number | null;
  eci: number | null;
  eciFixed: number | null;
  coi: number | null;
  gdp: number | null;
  gdppc: number | null;
  growthProj: number | null;
}

export interface CanadaProductRow {
  productId: string;
  year: number;
  exportValue: number | null;
  importValue: number | null;
  exportRca: number | null;
  globalMarketShare: number | null;
  normalizedPci: number | null;
}

export interface CanadaSectorRow {
  productId: string;
  year: number;
  exportValue: number | null;
  importValue: number | null;
  exportRca: number | null;
  globalMarketShare: number | null;
}

export interface ProductPciRow {
  productId: string;
  year: number;
  pci: number | null;
  exportValue: number | null;  // world total export value for this product
}

export interface BilateralRow {
  partnerCountryId: string;
  year: number;
  exportValue: number | null;
  importValue: number | null;
}

// ── Accessors ──────────────────────────────────────────────────────────────

export const atlas = {
  products:          () => get<Product[]>('products'),
  sectors:           () => get<Sector[]>('sectors'),
  countries:         () => get<Country[]>('countries'),
  canadaYear:        () => get<CanadaYearRow[]>('canada-year'),
  canadaProductYear: () => get<CanadaProductRow[]>('canada-product-year'),
  canadaSectorYear:  () => get<CanadaSectorRow[]>('canada-sector-year'),
  productPci:        () => get<ProductPciRow[]>('product-pci'),
  canadaBilateral:   () => get<BilateralRow[]>('canada-bilateral'),
};
