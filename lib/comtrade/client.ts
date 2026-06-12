/**
 * UN Comtrade public preview API client.
 * Docs: https://comtradeapi.un.org
 *
 * Public preview — no API key required.
 * Limits: 500 records/response, ~100 requests/hour unauthenticated.
 * Trade data is annual; responses are cached for 24 hours.
 */

const BASE = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
const CANADA = 124;
const REVALIDATE = 86_400; // 24-hour cache — annual data

export interface ComtradeRow {
  partnerCode: number;
  refYear: number;
  flowCode: 'X' | 'M';
  primaryValue: number; // USD
  iso3: string;
}

/**
 * Fetch Canada's bilateral trade totals for a given year and flow.
 * Returns one row per partner country (de-duped by taking the max-value row).
 */
export async function fetchBilateral(year: number, flow: 'X' | 'M'): Promise<ComtradeRow[]> {
  const url =
    `${BASE}?reporterCode=${CANADA}&period=${year}&cmdCode=TOTAL` +
    `&flowCode=${flow}&maxRecords=500`;

  const res = await fetch(url, { next: { revalidate: REVALIDATE } });
  if (!res.ok) throw new Error(`Comtrade HTTP ${res.status} (${year} ${flow})`);

  const json: { count: number; data: any[] } = await res.json();

  // Per partner, keep the row with the highest primaryValue.
  // The API returns multiple rows per partner split by mode of transport.
  const byPartner = new Map<number, any>();
  for (const r of json.data ?? []) {
    if (r.partnerCode === 0 || r.partnerCode === 899 || r.mosCode !== '0') continue;
    const cur = byPartner.get(r.partnerCode);
    if (!cur || r.primaryValue > cur.primaryValue) byPartner.set(r.partnerCode, r);
  }

  return Array.from(byPartner.values())
    .filter(r => r.primaryValue > 0)
    .map(r => ({
      partnerCode: r.partnerCode,
      refYear: r.refYear as number,
      flowCode: flow,
      primaryValue: r.primaryValue as number,
      iso3: PARTNER_ISO3[r.partnerCode] ?? '',
    }))
    .filter(r => r.iso3 && !r.iso3.startsWith('_') && r.iso3.length === 3);
}

/**
 * Fetch bilateral data for multiple years (both flows) in parallel.
 */
export async function fetchBilateralRange(years: number[]): Promise<ComtradeRow[]> {
  const settled = await Promise.allSettled(
    years.flatMap(y => [fetchBilateral(y, 'X'), fetchBilateral(y, 'M')])
  );
  return settled
    .filter((r): r is PromiseFulfilledResult<ComtradeRow[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);
}

/**
 * Comtrade partner numeric code → ISO3 alpha.
 * Source: https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json
 */
export const PARTNER_ISO3: Record<number, string> = {
  4:"AFG",8:"ALB",12:"DZA",16:"ASM",20:"AND",24:"AGO",28:"ATG",31:"AZE",32:"ARG",
  36:"AUS",40:"AUT",44:"BHS",48:"BHR",50:"BGD",51:"ARM",52:"BRB",56:"BEL",64:"BTN",
  68:"BOL",70:"BIH",72:"BWA",76:"BRA",84:"BLZ",90:"SLB",96:"BRN",100:"BGR",104:"MMR",
  108:"BDI",112:"BLR",116:"KHM",120:"CMR",124:"CAN",132:"CPV",140:"CAF",144:"LKA",
  148:"TCD",152:"CHL",156:"CHN",158:"TWN",170:"COL",174:"COM",178:"COG",180:"COD",
  184:"COK",188:"CRI",191:"HRV",192:"CUB",196:"CYP",203:"CZE",204:"BEN",208:"DNK",
  212:"DMA",214:"DOM",218:"ECU",222:"SLV",226:"GNQ",231:"ETH",232:"ERI",233:"EST",
  238:"FLK",242:"FJI",246:"FIN",250:"FRA",262:"DJI",266:"GAB",268:"GEO",270:"GMB",
  275:"PSE",276:"DEU",288:"GHA",292:"GIB",296:"KIR",300:"GRC",304:"GRL",308:"GRD",
  316:"GUM",320:"GTM",324:"GIN",328:"GUY",332:"HTI",336:"VAT",340:"HND",344:"HKG",
  348:"HUN",352:"ISL",356:"IND",360:"IDN",364:"IRN",368:"IRQ",372:"IRL",376:"ISR",
  380:"ITA",384:"CIV",388:"JAM",392:"JPN",398:"KAZ",400:"JOR",404:"KEN",408:"PRK",
  410:"KOR",414:"KWT",417:"KGZ",418:"LAO",422:"LBN",426:"LSO",428:"LVA",430:"LBR",
  434:"LBY",438:"LIE",440:"LTU",442:"LUX",446:"MAC",450:"MDG",454:"MWI",458:"MYS",
  462:"MDV",466:"MLI",470:"MLT",474:"MTQ",478:"MRT",480:"MUS",484:"MEX",492:"MCO",
  496:"MNG",498:"MDA",499:"MNE",504:"MAR",508:"MOZ",512:"OMN",516:"NAM",520:"NRU",
  524:"NPL",528:"NLD",540:"NCL",548:"VUT",554:"NZL",558:"NIC",562:"NER",566:"NGA",
  578:"NOR",580:"MNP",583:"FSM",584:"MHL",585:"PLW",586:"PAK",590:"PAN",591:"PAN",
  598:"PNG",600:"PRY",604:"PER",608:"PHL",616:"POL",620:"PRT",624:"GNB",626:"TLS",
  630:"PRI",634:"QAT",638:"REU",642:"ROU",643:"RUS",646:"RWA",652:"BLM",654:"SHN",
  658:"KNA",660:"AIA",662:"LCA",666:"SPM",670:"VCT",674:"SMR",678:"STP",682:"SAU",
  686:"SEN",688:"SRB",690:"SYC",694:"SLE",702:"SGP",703:"SVK",704:"VNM",705:"SVN",
  706:"SOM",710:"ZAF",716:"ZWE",724:"ESP",728:"SSD",729:"SDN",740:"SUR",748:"SWZ",
  752:"SWE",756:"CHE",760:"SYR",762:"TJK",764:"THA",768:"TGO",776:"TON",780:"TTO",
  784:"ARE",788:"TUN",792:"TUR",795:"TKM",800:"UGA",804:"UKR",807:"MKD",818:"EGY",
  826:"GBR",834:"TZA",840:"USA",842:"USA",850:"VIR",854:"BFA",858:"URY",860:"UZB",
  862:"VEN",882:"WSM",886:"YEM",894:"ZMB",
};
