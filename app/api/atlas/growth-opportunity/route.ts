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

function diamonds(score: number, max = 5): number {
  return Math.max(0, Math.min(max, Math.round(score * max)));
}

export async function GET() {
  try {
    const year = 2024;
    const prevYear = 2019;

    const [current, prev, productMeta, worldTrade] = await Promise.all([
      gql(`{
        countryProductYear(countryId: 124, productClass: HS92, productLevel: 4,
          yearMin: ${year}, yearMax: ${year}) {
          productId exportRca exportValue importValue globalMarketShare normalizedPci
        }
      }`),
      gql(`{
        countryProductYear(countryId: 124, productClass: HS92, productLevel: 4,
          yearMin: ${prevYear}, yearMax: ${prevYear}) {
          productId exportValue globalMarketShare
        }
      }`),
      gql(`{
        productHs92(productLevel: 4) {
          productId code nameShortEn
          topParent { code nameShortEn }
        }
      }`),
      gql(`{
        productYear(productClass: HS92, productLevel: 4,
          yearMin: ${year}, yearMax: ${year}) {
          productId pci totalExportValue
        }
      }`),
    ]);

    const metaMap = new Map<string, any>();
    for (const p of productMeta.productHs92) metaMap.set(p.productId, p);

    const prevMap = new Map<string, any>();
    for (const p of prev.countryProductYear) prevMap.set(p.productId, p);

    const worldMap = new Map<string, any>();
    for (const p of worldTrade.productYear) worldMap.set(p.productId, p);

    // collect PCI range for normalization
    const allPci = worldTrade.productYear.map((p: any) => p.pci).filter(Boolean);
    const maxPci = Math.max(...allPci);
    const minPci = Math.min(...allPci);

    // collect global size range
    const allSizes = worldTrade.productYear.map((p: any) => p.totalExportValue ?? 0);
    const maxSize = Math.max(...allSizes);

    const opportunities = current.countryProductYear
      .filter((r: any) => (r.exportRca ?? 0) < 1 && (r.importValue ?? 0) > 1e7)
      .map((r: any) => {
        const meta = metaMap.get(r.productId);
        const world = worldMap.get(r.productId);
        const prevRow = prevMap.get(r.productId);

        const pci = world?.pci ?? 0;
        const globalSize = world?.totalExportValue ?? 0;

        // 5yr growth in global export size
        const prevGlobalShare = prevRow?.globalMarketShare ?? 0;
        const currGlobalShare = r.globalMarketShare ?? 0;
        const globalGrowthPct = prevGlobalShare > 0
          ? ((currGlobalShare - prevGlobalShare) / prevGlobalShare) * 100
          : null;

        // distance: 1 = far from basket (low RCA), 0 = close
        const distance = Math.max(0, 1 - (r.exportRca ?? 0));

        // scores 0–1 for diamond ratings
        const distanceScore = 1 - distance; // high = close = good
        const pciNorm = maxPci > minPci ? (pci - minPci) / (maxPci - minPci) : 0.5;
        const sizeNorm = maxSize > 0 ? Math.log(globalSize + 1) / Math.log(maxSize + 1) : 0;
        const opportunityGain = pciNorm * 0.6 + sizeNorm * 0.4;

        return {
          productId: r.productId,
          name: meta?.nameShortEn ?? 'Unknown',
          hs: meta?.code ?? '',
          sector: meta?.topParent?.nameShortEn ?? 'Other',
          sectorCode: meta?.topParent?.code ?? '9',
          distanceDiamonds: diamonds(distanceScore),
          opportunityDiamonds: diamonds(opportunityGain),
          complexityDiamonds: diamonds(pciNorm),
          globalSize,
          globalGrowthPct: globalGrowthPct != null ? +globalGrowthPct.toFixed(1) : null,
          importValue: r.importValue,
          pci,
        };
      })
      .sort((a: any, b: any) => b.opportunityDiamonds - a.opportunityDiamonds || b.globalSize - a.globalSize)
      .slice(0, 50);

    const totalGlobalSize = opportunities.reduce((s: number, p: any) => s + p.globalSize, 0);

    return NextResponse.json({ opportunities, totalGlobalSize, year });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
