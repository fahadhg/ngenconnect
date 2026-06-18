/**
 * Rebuild public/data/imports.json from StatsCan CIMT bulk download.
 *
 * StatsCan publishes merchandise imports by HS section monthly (table 12-10-0099-01).
 * For individual HS-code level breakdown by country, this script uses
 * table 12-10-0011-01 (total) and 12-10-0099-01 (HS section split).
 *
 * NOTE: StatsCan does not publish individual 10-digit HS code × country breakdowns
 * via a free public API. The existing imports.json was built from a custom StatsCan
 * data pull. This script refreshes the section-level aggregates that feed the
 * Intel dashboard; the full per-code breakdown requires a StatsCan custom request.
 *
 * Run: npx tsx scripts/fetch-imports-data.ts
 */

import fs from 'fs';
import path from 'path';
import https from 'node:https';
import zlib from 'node:zlib';

const STATSCAN_ZIP = 'https://www150.statcan.gc.ca/n1/tbl/csv/12100099-eng.zip';
const CIMT_ZIP     = 'https://www150.statcan.gc.ca/n1/tbl/csv/12100011-eng.zip';
const OUT_SECTIONS = path.join(process.cwd(), 'public', 'data', 'intel', 'import-sections.json');

// ── Download helper ───────────────────────────────────────────────────────────

function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NGenConnect/1.0)' } }, res => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadZipEntry(zipUrl: string, entryName: string): Promise<string> {
  console.log(`Downloading ${zipUrl}…`);
  const buf = await downloadBuffer(zipUrl);
  // Simple ZIP parser — find central directory and extract entry
  // Use Node's zlib to decompress
  const { default: JSZip } = await import('jszip').catch(() => ({ default: null }));
  if (!JSZip) throw new Error('jszip not installed — run: npm i -D jszip');
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file(entryName);
  if (!file) {
    const names = Object.keys(zip.files);
    const csv = names.find(n => n.endsWith('.csv') && !n.includes('Meta'));
    if (!csv) throw new Error(`No CSV found in ZIP. Files: ${names.join(', ')}`);
    return zip.file(csv)!.async('string');
  }
  return file.async('string');
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.split('\n');
  const headers = lines[0].replace(/^﻿/, '').split(',').map(h => h.replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    // Simple CSV split (handles quoted fields with commas)
    const vals: string[] = [];
    let cur = '', inQ = false;
    for (const ch of lines[i] + ',') {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    if (vals.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => row[h] = vals[i]);
      rows.push(row);
    }
  }
  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Refreshing import section data from StatsCan…');

  // Download 12-10-0099-01 (imports/exports by HS section × US)
  const csv = await downloadZipEntry(STATSCAN_ZIP, '12100099.csv');
  const rows = parseCSV(csv);

  // Find latest year/month
  const dates = [...new Set(rows.map(r => r['REF_DATE']))].sort().reverse();
  const latest = dates[0];
  console.log(`Latest data period: ${latest}`);

  // Filter to imports, latest period, all countries
  const importRows = rows.filter(r =>
    r['REF_DATE'] === latest &&
    r['Trade'] === 'Import' &&
    r['United States'] === 'Total United States'
  );

  // Build section map: HS section name → CAD thousands value
  const sectionMap: Record<string, number> = {};
  for (const r of importRows) {
    const section = r['Harmonized System (HS) Sections'];
    const val = parseFloat(r['VALUE']);
    if (section && !isNaN(val) && !section.startsWith('Total')) {
      sectionMap[section] = val * 1000; // convert thousands → dollars
    }
  }

  const output = {
    generated: new Date().toISOString().slice(0, 10),
    period: latest,
    source: 'StatsCan Table 12-10-0099-01 — Merchandise imports/exports by HS section',
    sections: sectionMap,
  };

  fs.mkdirSync(path.dirname(OUT_SECTIONS), { recursive: true });
  fs.writeFileSync(OUT_SECTIONS, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Written section data to ${OUT_SECTIONS}`);
  console.log(`${Object.keys(sectionMap).length} HS sections, period: ${latest}`);

  console.log('\nNote: Per-code imports.json (individual 10-digit HS × country) requires');
  console.log('a custom StatsCan CIMT data request. Contact statcan.gc.ca for microdata access.');
}

main().catch(e => { console.error(e); process.exit(1); });
