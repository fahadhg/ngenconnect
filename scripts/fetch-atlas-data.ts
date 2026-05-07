#!/usr/bin/env node
/**
 * One-time data fetch from Harvard Atlas of Economic Complexity.
 * Saves raw data to data/atlas/*.json for use by all /api/atlas/* routes.
 *
 * Run:  npx tsx scripts/fetch-atlas-data.ts
 * Time: ~3–8 min depending on Atlas API speed.
 */

import fs from 'fs';
import path from 'path';

const GQL = 'https://atlas.hks.harvard.edu/api/graphql';
const OUT  = path.join(process.cwd(), 'data', 'atlas');

async function gql(label: string, query: string): Promise<any> {
  process.stdout.write(`  Fetching ${label}…`);
  const start = Date.now();
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json() as { data?: any; errors?: any[] };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  const ms = Date.now() - start;
  console.log(` done (${(ms / 1000).toFixed(1)}s)`);
  return json.data;
}

function save(name: string, data: unknown) {
  const file = path.join(OUT, `${name}.json`);
  const json = JSON.stringify(data);
  fs.writeFileSync(file, json, 'utf-8');
  const rows = Array.isArray(data) ? data.length : '—';
  const kb   = (json.length / 1024).toFixed(0);
  console.log(`  ✓ ${name}.json  (${rows} rows, ${kb} KB)`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`\nFetching Harvard Atlas data → ${OUT}\n`);

  // ── 1. Static metadata (products, sectors, countries) ────────────────────
  console.log('Step 1/6: Static metadata');
  const [pm4, pm1, cm] = await Promise.all([
    gql('HS92 level-4 products',  '{ productHs92(productLevel: 4) { productId code nameShortEn topParent { productId code nameShortEn } } }'),
    gql('HS92 level-1 sectors',   '{ productHs92(productLevel: 1) { productId code nameShortEn } }'),
    gql('countries',              '{ locationCountry { countryId iso3Code nameShortEn } }'),
  ]);
  save('products',  pm4.productHs92);
  save('sectors',   pm1.productHs92);
  save('countries', cm.locationCountry);

  // ── 2. Canada country-year (ECI, GDP, trade totals) ──────────────────────
  console.log('\nStep 2/6: Canada country-year (ECI, GDP)');
  const cy = await gql('Canada country-year', `{
    countryYear(countryId: 124, yearMin: 1995, yearMax: 2024) {
      year exportValue importValue eci eciFixed coi gdp gdppc growthProj
    }
  }`);
  save('canada-year', cy.countryYear);

  // ── 3. Canada product-year (HS4) — exports + imports per product ─────────
  console.log('\nStep 3/6: Canada product-year HS4 (1995–2024) — may be slow');
  const cpy = await gql('Canada product-year HS4', `{
    countryProductYear(countryId: 124, productClass: HS92, productLevel: 4,
      yearMin: 1995, yearMax: 2024) {
      productId year exportValue importValue exportRca globalMarketShare normalizedPci
    }
  }`);
  save('canada-product-year', cpy.countryProductYear);

  // ── 4. Canada sector-year (HS1) — for global-share chart ─────────────────
  console.log('\nStep 4/6: Canada sector-year HS1 (1995–2024)');
  const csy = await gql('Canada sector-year HS1', `{
    countryProductYear(countryId: 124, productClass: HS92, productLevel: 1,
      yearMin: 1995, yearMax: 2024) {
      productId year exportValue importValue exportRca globalMarketShare
    }
  }`);
  save('canada-sector-year', csy.countryProductYear);

  // ── 5. World product PCI by year (for per-product complexity) ─────────────
  console.log('\nStep 5/6: World product PCI HS4 (1995–2024) — may be slow');
  const pcy = await gql('world product PCI HS4', `{
    productYear(productClass: HS92, productLevel: 4,
      yearMin: 1995, yearMax: 2024) {
      productId year pci exportValue
    }
  }`);
  save('product-pci', pcy.productYear);

  // ── 6. Canada bilateral trade (for map + stacked area chart) ─────────────
  console.log('\nStep 6/6: Canada bilateral trade (1995–2022)');
  const bil = await gql('Canada bilateral trade', `{
    countryCountryYear(countryId: 124, yearMin: 1995, yearMax: 2022) {
      partnerCountryId year exportValue importValue
    }
  }`);
  save('canada-bilateral', bil.countryCountryYear);

  console.log('\n✅  All Atlas data saved to data/atlas/');
  console.log('    Commit data/atlas/ and run: npx vercel --prod\n');
}

main().catch(e => {
  console.error('\n❌  Fatal error:', e.message);
  process.exit(1);
});
