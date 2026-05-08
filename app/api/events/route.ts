import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import type { TradeEvent, EventsData, EnrichedEvent, CountryTrade, FtaAgreement } from '@/lib/events/types';
import { atlas } from '@/lib/atlas/data';

// ISO3 → ISO2 for flag emoji
const ISO3_TO_ISO2: Record<string, string> = {
  USA:'US',MEX:'MX',CHN:'CN',JPN:'JP',KOR:'KR',DEU:'DE',FRA:'FR',GBR:'GB',ITA:'IT',ESP:'ES',
  NLD:'NL',BEL:'BE',SWE:'SE',NOR:'NO',DNK:'DK',FIN:'FI',CHE:'CH',AUT:'AT',POL:'PL',IRL:'IE',
  PRT:'PT',CZE:'CZ',HUN:'HU',ROU:'RO',GRC:'GR',UKR:'UA',IND:'IN',AUS:'AU',NZL:'NZ',SGP:'SG',
  MYS:'MY',IDN:'ID',VNM:'VN',THA:'TH',PHL:'PH',TWN:'TW',HKG:'HK',BRN:'BN',BRA:'BR',ARG:'AR',
  CHL:'CL',COL:'CO',PER:'PE',PAN:'PA',CRI:'CR',HND:'HN',ISR:'IL',JOR:'JO',SAU:'SA',ARE:'AE',
  QAT:'QA',EGY:'EG',MAR:'MA',ZAF:'ZA',NGA:'NG',KEN:'KE',GHA:'GH',ETH:'ET',RUS:'RU',TUR:'TR',
  ISL:'IS',PAK:'PK',BGD:'BD',LKA:'LK',KHM:'KH',KAZ:'KZ',AZE:'AZ',UZB:'UZ',GEO:'GE',
  CYP:'CY',MLT:'MT',HRV:'HR',SVK:'SK',SVN:'SI',LTU:'LT',LVA:'LV',EST:'EE',BGR:'BG',
  LUX:'LU',LIE:'LI',KWT:'KW',IRQ:'IQ',LBN:'LB',SYR:'SY',TUN:'TN',DZA:'DZ',LBY:'LY',
  MOZ:'MZ',TZA:'TZ',UGA:'UG',RWA:'RW',SDN:'SD',SEN:'SN',CIV:'CI',CMR:'CM',AGO:'AO',
  ZMB:'ZM',ZWE:'ZW',BWA:'BW',NAM:'NA',BDI:'BI',MDG:'MG',MWI:'MW',MLI:'ML',BFA:'BF',NER:'NE',
  TGO:'TG',BEN:'BJ',SLE:'SL',LBR:'LR',GIN:'GN',GNB:'GW',GMB:'GM',SOM:'SO',
  BOL:'BO',PRY:'PY',URY:'UY',VEN:'VE',ECU:'EC',GTM:'GT',SLV:'SV',NIC:'NI',
  CUB:'CU',DOM:'DO',JAM:'JA',HTI:'HT',TTO:'TT',BRB:'BB',
  AFG:'AF',IRN:'IR',MMR:'MM',NPL:'NP',BTN:'BT',MDV:'MV',
  PNG:'PG',FJI:'FJ',WSM:'WS',TON:'TO',VUT:'VU',
};

function countryFlag(iso3: string): string {
  const iso2 = ISO3_TO_ISO2[iso3];
  if (!iso2 || iso2.length !== 2) return '🌐';
  const base = 0x1F1E6 - 65;
  return String.fromCodePoint(base + iso2.charCodeAt(0), base + iso2.charCodeAt(1));
}

let _ftaData: { agreements: FtaAgreement[] } | null = null;
function loadFta(): FtaAgreement[] {
  if (!_ftaData) {
    const raw = fs.readFileSync(path.join(process.cwd(), 'data/events/fta-data.json'), 'utf-8');
    _ftaData = JSON.parse(raw);
  }
  return _ftaData!.agreements;
}

function ftaForCountry(iso3: string, agreements: FtaAgreement[]): FtaAgreement | undefined {
  return agreements.find(a => a.countries.includes(iso3));
}

let _eventsData: EventsData | null = null;
function loadEvents(): EventsData {
  if (!_eventsData) {
    const raw = fs.readFileSync(path.join(process.cwd(), 'data/events/events.json'), 'utf-8');
    _eventsData = JSON.parse(raw);
  }
  return _eventsData!;
}

export async function GET() {
  try {
    const { events, lastUpdated } = loadEvents();
    const agreements = loadFta();
    const countries = atlas.countries();
    const bilateral = atlas.canadaBilateral();

    // Build trade lookup: countryId → { exportValue, importValue }[] by year
    const tradeByCountry = new Map<string, { year: number; exports: number; imports: number }[]>();
    for (const row of bilateral) {
      const arr = tradeByCountry.get(row.partnerCountryId) ?? [];
      arr.push({ year: row.year, exports: row.exportValue ?? 0, imports: row.importValue ?? 0 });
      tradeByCountry.set(row.partnerCountryId, arr);
    }

    // Build iso3 → countryId map
    const iso3ToId = new Map(countries.map(c => [c.iso3Code, c.countryId]));

    const enriched: EnrichedEvent[] = events.map(event => {
      const countryData: CountryTrade[] = (event.countryIso3 ?? []).map(iso3 => {
        const countryId = iso3ToId.get(iso3);
        const rows = (countryId ? tradeByCountry.get(countryId) : undefined) ?? [];
        const sorted = [...rows].sort((a, b) => a.year - b.year);
        const latest = sorted.findLast(r => r.year <= 2022);

        return {
          iso3,
          name: countries.find(c => c.iso3Code === iso3)?.nameShortEn ?? iso3,
          flag: countryFlag(iso3),
          exports2022: latest?.exports ?? 0,
          imports2022: latest?.imports ?? 0,
          sparkline: sorted.filter(r => r.year >= 2015).map(r => ({
            year: r.year,
            exports: r.exports,
            imports: r.imports,
          })),
          fta: ftaForCountry(iso3, agreements),
        };
      });

      return { ...event, countries: countryData };
    });

    return NextResponse.json({ events: enriched, lastUpdated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
