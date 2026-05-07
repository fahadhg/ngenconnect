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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') ?? '2024', 10);

  try {
    const [tradeData, productMeta, pciData, eciHistory] = await Promise.all([
      gql(`{
        countryProductYear(countryId: 124, productClass: HS92, productLevel: 4,
          yearMin: ${year}, yearMax: ${year}) {
          productId year exportValue importValue exportRca globalMarketShare normalizedPci
        }
      }`),
      gql(`{
        productHs92(productLevel: 4) {
          productId code nameShortEn
          topParent { productId code nameShortEn }
        }
      }`),
      gql(`{
        productYear(productClass: HS92, productLevel: 4,
          yearMin: ${year}, yearMax: ${year}) {
          productId pci
        }
      }`),
      gql(`{
        countryYear(countryId: 124, yearMin: 1995, yearMax: 2024) {
          year exportValue importValue eci gdp gdppc
        }
      }`),
    ]);

    const metaMap = new Map<string, any>();
    for (const p of productMeta.productHs92) metaMap.set(p.productId, p);

    const pciMap = new Map<string, number>();
    for (const p of pciData.productYear) pciMap.set(p.productId, p.pci);

    const products = tradeData.countryProductYear
      .filter((r: any) => r.importValue && r.importValue > 0)
      .map((r: any) => {
        const meta = metaMap.get(r.productId);
        return {
          productId: r.productId,
          code: meta?.code ?? '',
          name: meta?.nameShortEn ?? 'Unknown',
          sector: meta?.topParent?.nameShortEn ?? 'Other',
          sectorCode: meta?.topParent?.code ?? '9',
          sectorId: meta?.topParent?.productId ?? 'product-HS92-10',
          importValue: r.importValue,
          exportValue: r.exportValue,
          exportRca: r.exportRca,
          globalMarketShare: r.globalMarketShare,
          pci: pciMap.get(r.productId) ?? null,
          normalizedPci: r.normalizedPci,
        };
      })
      .sort((a: any, b: any) => b.importValue - a.importValue);

    const totalImports = products.reduce((s: number, p: any) => s + p.importValue, 0);
    const latestYear = eciHistory.countryYear.find((r: any) => r.year === year);
    const tradeBalance = (latestYear?.exportValue ?? 0) - (latestYear?.importValue ?? 0);

    return NextResponse.json({
      status: 'ok',
      year,
      totalImports,
      tradeBalance,
      eci: latestYear?.eci ?? null,
      gdp: latestYear?.gdp ?? null,
      gdppc: latestYear?.gdppc ?? null,
      products: products.slice(0, 200),
      eciHistory: eciHistory.countryYear,
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
