import { NextResponse } from 'next/server';
import { atlas } from '@/lib/atlas/data';

const ISO3_REGION: Record<string, string> = {
  USA: 'Americas', MEX: 'Americas', BRA: 'Americas', CHL: 'Americas',
  ARG: 'Americas', COL: 'Americas', PER: 'Americas', ECU: 'Americas',
  GTM: 'Americas', CRI: 'Americas', CUB: 'Americas', VEN: 'Americas',
  BOL: 'Americas', PRY: 'Americas', URY: 'Americas', PAN: 'Americas',
  DOM: 'Americas', TTO: 'Americas', JAM: 'Americas', HND: 'Americas',
  DEU: 'Europe', GBR: 'Europe', FRA: 'Europe', ITA: 'Europe',
  NLD: 'Europe', ESP: 'Europe', CHE: 'Europe', SWE: 'Europe',
  BEL: 'Europe', NOR: 'Europe', AUT: 'Europe', DNK: 'Europe',
  FIN: 'Europe', POL: 'Europe', CZE: 'Europe', HUN: 'Europe',
  ROU: 'Europe', PRT: 'Europe', GRC: 'Europe', BGR: 'Europe',
  HRV: 'Europe', SVK: 'Europe', SVN: 'Europe', LTU: 'Europe',
  LVA: 'Europe', EST: 'Europe', IRL: 'Europe', LUX: 'Europe',
  RUS: 'Europe', UKR: 'Europe', ISL: 'Europe',
  CHN: 'Asia', JPN: 'Asia', KOR: 'Asia', IND: 'Asia',
  TWN: 'Asia', MYS: 'Asia', THA: 'Asia', VNM: 'Asia',
  IDN: 'Asia', SGP: 'Asia', PHL: 'Asia', PAK: 'Asia',
  BGD: 'Asia', KAZ: 'Asia', ARE: 'Asia', SAU: 'Asia',
  TUR: 'Asia', ISR: 'Asia', IRQ: 'Asia', IRN: 'Asia',
  QAT: 'Asia', KWT: 'Asia', OMN: 'Asia', JOR: 'Asia',
  LKA: 'Asia', MMR: 'Asia', KHM: 'Asia', HKG: 'Asia',
  ZAF: 'Africa', NGA: 'Africa', EGY: 'Africa', DZA: 'Africa',
  MAR: 'Africa', ETH: 'Africa', KEN: 'Africa', GHA: 'Africa',
  TZA: 'Africa', CIV: 'Africa', AGO: 'Africa', TUN: 'Africa',
  AUS: 'Oceania', NZL: 'Oceania', PNG: 'Oceania',
};

const REGION_COLORS: Record<string, string> = {
  Americas: '#8b2020', Asia: '#4a8a4a', Europe: '#3d85c8',
  Oceania: '#e8b84b', Africa: '#7c4dbd', Other: '#888888',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') ?? 'export';

  try {
    const bilateral = atlas.canadaBilateral();
    const countries = atlas.countries();

    const iso3Map = new Map(countries.map(c => [c.countryId, c.iso3Code]));

    const years = Array.from(
      new Set(bilateral.map(r => r.year))
    ).sort((a, b) => a - b);

    const byRegion = new Map<string, Map<number, number>>();
    for (const row of bilateral) {
      const iso3   = iso3Map.get(row.partnerCountryId);
      const region = (iso3 && ISO3_REGION[iso3]) ?? 'Other';
      if (!byRegion.has(region)) byRegion.set(region, new Map());
      const val  = mode === 'export' ? (row.exportValue ?? 0) : (row.importValue ?? 0);
      const prev = byRegion.get(region)!.get(row.year) ?? 0;
      byRegion.get(region)!.set(row.year, prev + val);
    }

    const regionOrder = ['Americas', 'Asia', 'Europe', 'Africa', 'Oceania', 'Other'];
    const regions = regionOrder
      .filter(r => byRegion.has(r))
      .map(r => ({
        name:  r,
        color: REGION_COLORS[r],
        data:  years.map(y => ({ year: y, value: byRegion.get(r)!.get(y) ?? 0 })),
      }));

    const latestYear = years[years.length - 1];
    const total = regions.reduce((s, r) => s + (r.data.find(d => d.year === latestYear)?.value ?? 0), 0);

    return NextResponse.json({ years, regions, total, latestYear });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
