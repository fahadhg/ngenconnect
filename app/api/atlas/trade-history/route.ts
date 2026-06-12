import { NextResponse } from 'next/server';
import { tradeHistoryLive } from '@/lib/comtrade/transform';
import { atlas } from '@/lib/atlas/data';

// Fallback: reconstruct from static Atlas bilateral data (caps at 2022)
function staticFallback(mode: string) {
  const ISO3_REGION: Record<string, string> = {
    USA:'Americas',MEX:'Americas',BRA:'Americas',CHL:'Americas',ARG:'Americas',
    COL:'Americas',PER:'Americas',ECU:'Americas',DEU:'Europe',GBR:'Europe',
    FRA:'Europe',ITA:'Europe',NLD:'Europe',ESP:'Europe',CHE:'Europe',SWE:'Europe',
    BEL:'Europe',NOR:'Europe',AUT:'Europe',DNK:'Europe',FIN:'Europe',POL:'Europe',
    CZE:'Europe',HUN:'Europe',ROU:'Europe',IRL:'Europe',RUS:'Europe',CHN:'Asia',
    JPN:'Asia',KOR:'Asia',IND:'Asia',TWN:'Asia',MYS:'Asia',THA:'Asia',VNM:'Asia',
    IDN:'Asia',SGP:'Asia',PHL:'Asia',ARE:'Asia',SAU:'Asia',TUR:'Asia',ZAF:'Africa',
    NGA:'Africa',EGY:'Africa',DZA:'Africa',MAR:'Africa',AUS:'Oceania',NZL:'Oceania',
  };
  const REGION_COLORS: Record<string, string> = {
    Americas:'#8b2020',Asia:'#4a8a4a',Europe:'#3d85c8',
    Oceania:'#e8b84b',Africa:'#7c4dbd',Other:'#888888',
  };
  const bilateral = atlas.canadaBilateral();
  const countries = atlas.countries();
  const iso3Map   = new Map(countries.map(c => [c.countryId, c.iso3Code]));
  const years     = [...new Set(bilateral.map(r => r.year))].sort((a,b)=>a-b);
  const byRegion  = new Map<string, Map<number, number>>();

  for (const row of bilateral) {
    const iso3   = iso3Map.get(row.partnerCountryId);
    const region = (iso3 && ISO3_REGION[iso3]) ?? 'Other';
    if (!byRegion.has(region)) byRegion.set(region, new Map());
    const val  = mode === 'export' ? (row.exportValue ?? 0) : (row.importValue ?? 0);
    const prev = byRegion.get(region)!.get(row.year) ?? 0;
    byRegion.get(region)!.set(row.year, prev + val);
  }

  const regionOrder = ['Americas','Asia','Europe','Africa','Oceania','Other'];
  const regions = regionOrder.filter(r => byRegion.has(r)).map(r => ({
    name: r, color: REGION_COLORS[r],
    data: years.map(y => ({ year: y, value: byRegion.get(r)!.get(y) ?? 0 })),
  }));
  const latestYear = years[years.length - 1];
  const total = regions.reduce((s,r) => s + (r.data.find(d=>d.year===latestYear)?.value ?? 0), 0);
  return { years, regions, total, latestYear, _source: 'static-fallback' };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') ?? 'export';

  try {
    const data = await tradeHistoryLive(mode as 'export' | 'import');
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('trade-history live fetch failed, using Atlas fallback:', e.message);
    return NextResponse.json(staticFallback(mode));
  }
}
