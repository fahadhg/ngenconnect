import { NextResponse } from 'next/server';

const GQL = 'https://atlas.hks.harvard.edu/api/graphql';

async function gql(query: string) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    next: { revalidate: 86400 }, // cache 24h
  });
  if (!res.ok) throw new Error(`GraphQL fetch failed: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') ?? '2022', 10);

  try {
    // Fetch all data in parallel
    const [tradeData, productMeta, pciData, eciHistory] = await Promise.all([
      // Canada (124) export/import by product, chosen year
      gql(`{
        countryProductYear(countryId: 124, productClass: HS92, productLevel: 4,
          yearMin: ${year}, yearMax: ${year}) {
          productId year exportValue importValue exportRca globalMarketShare normalizedPci
        }
      }`),

      // Product names + sector
      gql(`{
        productHs92(productLevel: 4) {
          productId code nameShortEn
          topParent { productId code nameShortEn }
        }
      }`),

      // PCI for the year
      gql(`{
        productYear(productClass: HS92, productLevel: 4,
          yearMin: ${year}, yearMax: ${year}) {
          productId pci
        }
      }`),

      // Canada ECI history
      gql(`{
        countryYear(countryId: 124, yearMin: 1995, yearMax: 2024) {
          year exportValue importValue eci eciFixed coi gdp gdppc growthProj
        }
      }`),
    ]);

    // Build lookup maps
    const metaMap = new Map<string, any>();
    for (const p of productMeta.productHs92) metaMap.set(p.productId, p);

    const pciMap = new Map<string, number>();
    for (const p of pciData.productYear) pciMap.set(p.productId, p.pci);

    // Merge trade rows with metadata
    const products = tradeData.countryProductYear
      .filter((r: any) => r.exportValue && r.exportValue > 0)
      .map((r: any) => {
        const meta = metaMap.get(r.productId);
        return {
          productId: r.productId,
          code: meta?.code ?? '',
          name: meta?.nameShortEn ?? 'Unknown',
          sector: meta?.topParent?.nameShortEn ?? 'Other',
          sectorCode: meta?.topParent?.code ?? '9',
          sectorId: meta?.topParent?.productId ?? 'product-HS92-10',
          exportValue: r.exportValue,
          importValue: r.importValue,
          exportRca: r.exportRca,
          globalMarketShare: r.globalMarketShare,
          pci: pciMap.get(r.productId) ?? null,
          normalizedPci: r.normalizedPci,
        };
      })
      .sort((a: any, b: any) => b.exportValue - a.exportValue);

    // Compute total
    const totalExports = products.reduce((s: number, p: any) => s + p.exportValue, 0);
    const latestEci = eciHistory.countryYear.find((r: any) => r.year === year);

    return NextResponse.json({
      status: 'ok',
      year,
      totalExports,
      eci: latestEci?.eci ?? null,
      eciFixed: latestEci?.eciFixed ?? null,
      gdp: latestEci?.gdp ?? null,
      gdppc: latestEci?.gdppc ?? null,
      products: products.slice(0, 200), // top 200 by export value
      eciHistory: eciHistory.countryYear,
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
