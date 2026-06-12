import { NextResponse } from 'next/server';
import { tradePartnersLive } from '@/lib/comtrade/transform';
import { atlas } from '@/lib/atlas/data';

// Fallback: reconstruct trade-partners response from static Atlas data (2022)
function staticFallback(year: number) {
  const COORDS: Record<string, [number, number]> = {
    USA:[37.09,-95.71],CHN:[35.86,104.19],MEX:[23.63,-102.55],JPN:[36.20,138.25],
    DEU:[51.17,10.45],GBR:[55.38,-3.44],KOR:[35.91,127.77],FRA:[46.23,2.21],
    ITA:[41.87,12.57],IND:[20.59,78.96],BRA:[-14.24,-51.93],NLD:[52.13,5.29],
    CHE:[46.82,8.23],AUS:[-25.27,133.78],ESP:[40.46,-3.75],MYS:[4.21,101.98],
    TWN:[23.70,120.96],BEL:[50.50,4.47],SWE:[60.13,18.64],THA:[15.87,100.99],
    NOR:[60.47,8.47],VNM:[14.06,108.28],ZAF:[-30.56,22.94],IDN:[-0.79,113.92],
    ARE:[23.42,53.85],SAU:[23.89,45.08],TUR:[38.96,35.24],POL:[51.92,19.14],
  };
  const bilateral = atlas.canadaBilateral();
  const countries = atlas.countries();
  const metaMap = new Map(countries.map(c => [c.countryId, { iso3: c.iso3Code, name: c.nameShortEn }]));
  const clampedYear = Math.min(2022, year);
  const partners = bilateral
    .filter(r => r.year === clampedYear)
    .map(r => {
      const meta = metaMap.get(r.partnerCountryId);
      if (!meta) return null;
      const coords = COORDS[meta.iso3];
      if (!coords) return null;
      return {
        iso3: meta.iso3, name: meta.name,
        lat: coords[0], lng: coords[1],
        exportValue: r.exportValue ?? 0, importValue: r.importValue ?? 0,
        totalTrade: (r.exportValue ?? 0) + (r.importValue ?? 0),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.totalTrade > 0)
    .sort((a, b) => b.totalTrade - a.totalTrade)
    .slice(0, 50);
  return { status: 'ok', year: clampedYear, partners, _source: 'static-fallback' };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Math.min(new Date().getFullYear(), parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10));

  try {
    const data = await tradePartnersLive(year);
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('trade-partners live fetch failed, using Atlas fallback:', e.message);
    return NextResponse.json(staticFallback(year));
  }
}
