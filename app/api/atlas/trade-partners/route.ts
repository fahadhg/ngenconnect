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

// Country centroids by ISO3 code
const COORDS: Record<string, [number, number]> = {
  USA: [37.09, -95.71], CHN: [35.86, 104.19], MEX: [23.63, -102.55],
  JPN: [36.20, 138.25], DEU: [51.17, 10.45], GBR: [55.38, -3.44],
  KOR: [35.91, 127.77], FRA: [46.23, 2.21], ITA: [41.87, 12.57],
  IND: [20.59, 78.96], BRA: [14.24, -51.93], NLD: [52.13, 5.29],
  CHE: [46.82, 8.23], AUS: [-25.27, 133.78], ESP: [40.46, -3.75],
  MYS: [4.21, 101.98], TWN: [23.70, 120.96], BEL: [50.50, 4.47],
  SWE: [60.13, 18.64], THA: [15.87, 100.99], NOR: [60.47, 8.47],
  VNM: [14.06, 108.28], ZAF: [-30.56, 22.94], IDN: [-0.79, 113.92],
  ARE: [23.42, 53.85], SAU: [23.89, 45.08], TUR: [38.96, 35.24],
  POL: [51.92, 19.14], CHL: [-35.68, -71.54], ARG: [-38.42, -63.62],
  COL: [4.57, -74.30], PHL: [12.88, 121.77], CZE: [49.82, 15.47],
  AUT: [47.52, 14.55], DNK: [56.26, 9.50], RUS: [61.52, 105.32],
  FIN: [61.92, 25.75], PRT: [39.40, -8.22], SGP: [1.35, 103.82],
  HUN: [47.16, 19.50], ISR: [31.05, 34.85], NZL: [-40.90, 174.89],
  GRC: [39.07, 21.82], IRQ: [33.22, 43.68], PAK: [30.38, 69.35],
  EGY: [26.82, 30.80], BGR: [42.73, 25.49], ROU: [45.94, 24.97],
  UKR: [48.38, 31.17], HRV: [45.10, 15.20], KAZ: [48.02, 66.92],
  DZA: [28.03, 1.66], MAR: [31.79, -7.09], PER: [-9.19, -75.02],
  NGA: [9.08, 8.68], BAN: [23.68, 90.36], ECU: [-1.83, -78.18],
  GTM: [15.78, -90.23], CRI: [9.75, -83.75], CIV: [7.54, -5.55],
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // bilateral data is only available through 2022
  const year = parseInt(searchParams.get('year') ?? '2022', 10);

  try {
    const [tradeData, countryMeta] = await Promise.all([
      gql(`{
        countryCountryYear(countryId: 124, yearMin: ${year}, yearMax: ${year}) {
          partnerCountryId exportValue importValue
        }
      }`),
      gql(`{
        locationCountry { countryId iso3Code nameShortEn }
      }`),
    ]);

    const metaMap = new Map<string, { iso3: string; name: string }>();
    for (const c of countryMeta.locationCountry) {
      metaMap.set(c.countryId, { iso3: c.iso3Code, name: c.nameShortEn });
    }

    const partners = tradeData.countryCountryYear
      .map((r: any) => {
        const meta = metaMap.get(r.partnerCountryId);
        if (!meta) return null;
        const coords = COORDS[meta.iso3];
        if (!coords) return null;
        return {
          partnerCountryId: r.partnerCountryId,
          name: meta.name,
          iso3: meta.iso3,
          lat: coords[0],
          lng: coords[1],
          exportValue: r.exportValue ?? 0,
          importValue: r.importValue ?? 0,
          totalTrade: (r.exportValue ?? 0) + (r.importValue ?? 0),
        };
      })
      .filter(Boolean)
      .filter((r: any) => r.totalTrade > 0)
      .sort((a: any, b: any) => b.totalTrade - a.totalTrade)
      .slice(0, 50);

    return NextResponse.json({
      status: 'ok',
      year,
      partners,
    });
  } catch (e: any) {
    console.error('[trade-partners]', e.message);
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
