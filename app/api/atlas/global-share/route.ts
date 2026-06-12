import { NextResponse } from 'next/server';
import { atlas } from '@/lib/atlas/data';
import {
  fetchSectorYearRange,
  fetchSectors,
  type LiveSectorRow,
  type LiveSector,
} from '@/lib/atlas/live';

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

function buildResponse(
  sectorRows: { productId: string; year: number; globalMarketShare: number | null }[],
  sectors: { productId: string; code: string; nameShortEn: string }[],
  source: string,
) {
  const codeMap = new Map(sectors.map(s => [s.productId, s.code]));
  const nameMap = new Map(sectors.map(s => [s.productId, s.nameShortEn]));

  const years = [...new Set(sectorRows.map(r => r.year))].sort((a, b) => a - b);

  const bySector = new Map<string, { name: string; yearMap: Map<number, number> }>();
  for (const row of sectorRows) {
    const code = codeMap.get(row.productId) ?? '9';
    const name = nameMap.get(row.productId) ?? SECTOR_NAMES[code] ?? 'Other';
    if (!bySector.has(code)) bySector.set(code, { name, yearMap: new Map() });
    bySector.get(code)!.yearMap.set(row.year, (row.globalMarketShare ?? 0) * 100);
  }

  const sectorList = Array.from(bySector.entries()).map(([code, { name, yearMap }]) => ({
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
  const largest = sectorList.reduce((best, s) => {
    const share     = s.data.find(d => d.year === latestYear)?.share ?? 0;
    const bestShare = best.data.find(d => d.year === latestYear)?.share ?? 0;
    return share > bestShare ? s : best;
  });

  return {
    years,
    sectors:      sectorList,
    largestSector: largest.name,
    largestShare: +(largest.data.find(d => d.year === latestYear)?.share ?? 0).toFixed(2),
    source,
    latestYear,
  };
}

export async function GET() {
  // Live: Harvard Atlas HS1 sector data refreshed daily (query takes ~0.1s)
  try {
    const [sectorRows, sectors] = await Promise.all([
      fetchSectorYearRange(1995, 2030),
      fetchSectors(),
    ]);
    return NextResponse.json(buildResponse(sectorRows, sectors, 'Harvard Atlas (live)'));
  } catch (e: any) {
    console.error('global-share live fetch failed, using Atlas static fallback:', e.message);
    try {
      const sectorRows = atlas.canadaSectorYear();
      const sectors    = atlas.sectors();
      return NextResponse.json(buildResponse(sectorRows, sectors, 'Harvard Atlas (static)'));
    } catch (fe: any) {
      return NextResponse.json({ error: fe.message }, { status: 500 });
    }
  }
}
