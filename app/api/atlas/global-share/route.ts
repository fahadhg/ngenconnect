import { NextResponse } from 'next/server';

const GQL = 'https://atlas.hks.harvard.edu/api/graphql';

async function gql(query: string) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`GraphQL fetch failed: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

const SECTOR_COLORS: Record<string, string> = {
  '0': '#e8b84b', '1': '#5aaa3c', '2': '#999999', '3': '#c4a35a',
  '4': '#cc6633', '5': '#cc2936', '6': '#7c4dbd', '7': '#3d85c8',
  '8': '#3bbcd4', '9': '#888888',
};
const SECTOR_NAMES: Record<string, string> = {
  '0': 'Textiles', '1': 'Agriculture', '2': 'Stone', '3': 'Minerals',
  '4': 'Metals', '5': 'Chemicals', '6': 'Vehicles', '7': 'Machinery',
  '8': 'Electronics', '9': 'Other',
};

export async function GET() {
  try {
    const [sectorData, sectorMeta] = await Promise.all([
      gql(`{
        countryProductYear(countryId: 124, productClass: HS92, productLevel: 1,
          yearMin: 1995, yearMax: 2024) {
          productId year globalMarketShare exportValue
        }
      }`),
      gql(`{
        productHs92(productLevel: 1) {
          productId code nameShortEn
        }
      }`),
    ]);

    const codeMap = new Map<string, string>();
    const nameMap = new Map<string, string>();
    for (const p of sectorMeta.productHs92) {
      codeMap.set(p.productId, p.code);
      nameMap.set(p.productId, p.nameShortEn);
    }

    const years = Array.from(
      new Set(sectorData.countryProductYear.map((r: any) => r.year))
    ).sort() as number[];

    // group by sector code
    const bySector = new Map<string, { name: string; yearMap: Map<number, number> }>();
    for (const row of sectorData.countryProductYear) {
      const code = codeMap.get(row.productId) ?? '9';
      const name = nameMap.get(row.productId) ?? SECTOR_NAMES[code] ?? 'Other';
      if (!bySector.has(code)) bySector.set(code, { name, yearMap: new Map() });
      bySector.get(code)!.yearMap.set(row.year, (row.globalMarketShare ?? 0) * 100);
    }

    const sectors = Array.from(bySector.entries()).map(([code, { name, yearMap }]) => ({
      code,
      name: SECTOR_NAMES[code] ?? name,
      color: SECTOR_COLORS[code] ?? '#888888',
      data: years.map(y => ({ year: y, share: +(yearMap.get(y) ?? 0).toFixed(3) })),
    })).sort((a, b) => {
      const aLast = a.data[a.data.length - 1]?.share ?? 0;
      const bLast = b.data[b.data.length - 1]?.share ?? 0;
      return bLast - aLast;
    });

    const latestYear = years[years.length - 1];
    const largest = sectors.reduce((best, s) => {
      const share = s.data.find(d => d.year === latestYear)?.share ?? 0;
      const bestShare = best.data.find(d => d.year === latestYear)?.share ?? 0;
      return share > bestShare ? s : best;
    });

    return NextResponse.json({
      years,
      sectors,
      largestSector: largest.name,
      largestShare: +(largest.data.find(d => d.year === latestYear)?.share ?? 0).toFixed(2),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
