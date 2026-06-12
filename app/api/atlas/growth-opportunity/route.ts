import { NextResponse } from 'next/server';
import { atlas } from '@/lib/atlas/data';
import {
  fetchLatestAtlasYear,
  fetchProductYearTwoPoints,
  fetchProductPciYear,
  fetchProducts,
} from '@/lib/atlas/live';

function diamonds(score: number, max = 5): number {
  return Math.max(0, Math.min(max, Math.round(score * max)));
}

function buildResponse(
  products: { productId: string; code: string; nameShortEn: string; topParent?: { productId: string; code: string; nameShortEn: string } }[],
  tradeRows: { productId: string; year: number; exportValue: number | null; importValue: number | null; exportRca: number | null; globalMarketShare: number | null }[],
  pciRows: { productId: string; year: number; pci: number | null; exportValue: number | null }[],
  year: number,
  prevYear: number,
  source: string,
) {
  const metaMap    = new Map(products.map(p => [p.productId, p]));
  const currentMap = new Map(tradeRows.filter(r => r.year === year).map(r => [r.productId, r]));
  const prevMap    = new Map(tradeRows.filter(r => r.year === prevYear).map(r => [r.productId, r]));
  const worldMap   = new Map(pciRows.filter(r => r.year === year).map(r => [r.productId, r]));

  const allPci   = pciRows.filter(r => r.year === year).map(r => r.pci ?? 0);
  const maxPci   = Math.max(...allPci);
  const minPci   = Math.min(...allPci);
  const allSizes = pciRows.filter(r => r.year === year).map(r => r.exportValue ?? 0);
  const maxSize  = Math.max(...allSizes);

  const opportunities = Array.from(currentMap.values())
    .filter(r => (r.exportRca ?? 0) < 1 && (r.importValue ?? 0) > 1e7)
    .map(r => {
      const meta    = metaMap.get(r.productId);
      const world   = worldMap.get(r.productId);
      const prevRow = prevMap.get(r.productId);

      const pci        = world?.pci ?? 0;
      const globalSize = world?.exportValue ?? 0;

      const prevShare = prevRow?.globalMarketShare ?? 0;
      const currShare = r.globalMarketShare ?? 0;
      const globalGrowthPct = prevShare > 0
        ? ((currShare - prevShare) / prevShare) * 100
        : null;

      const distance      = Math.max(0, 1 - (r.exportRca ?? 0));
      const distanceScore = 1 - distance;
      const pciNorm       = maxPci > minPci ? (pci - minPci) / (maxPci - minPci) : 0.5;
      const sizeNorm      = maxSize > 0 ? Math.log(globalSize + 1) / Math.log(maxSize + 1) : 0;
      const opportunityGain = pciNorm * 0.6 + sizeNorm * 0.4;

      return {
        productId:           r.productId,
        name:                meta?.nameShortEn ?? 'Unknown',
        hs:                  meta?.code ?? '',
        sector:              meta?.topParent?.nameShortEn ?? 'Other',
        sectorCode:          meta?.topParent?.code ?? '9',
        distanceDiamonds:    diamonds(distanceScore),
        opportunityDiamonds: diamonds(opportunityGain),
        complexityDiamonds:  diamonds(pciNorm),
        globalSize,
        globalGrowthPct:     globalGrowthPct != null ? +globalGrowthPct.toFixed(1) : null,
        importValue:         r.importValue ?? 0,
        pci,
      };
    })
    .sort((a, b) => b.opportunityDiamonds - a.opportunityDiamonds || b.globalSize - a.globalSize);

  const totalGlobalSize = opportunities.reduce((s, p) => s + p.globalSize, 0);

  return { opportunities, totalGlobalSize, year, source };
}

export async function GET() {
  // Live: query Harvard Atlas for the latest available year, then fetch
  // product data for that year and 5 years prior. Results cached 24h.
  try {
    const latestYear = await fetchLatestAtlasYear();
    const prevYear = latestYear - 5;

    const [tradeRows, pciRows, products] = await Promise.all([
      fetchProductYearTwoPoints(latestYear, prevYear),
      fetchProductPciYear(latestYear),
      fetchProducts(),
    ]);

    return NextResponse.json(
      buildResponse(products, tradeRows, pciRows, latestYear, prevYear, 'Harvard Atlas (live)'),
    );
  } catch (e: any) {
    console.error('growth-opportunity live fetch failed, using Atlas static fallback:', e.message);
    try {
      const year     = 2024;
      const prevYear = 2019;
      const products   = atlas.products();
      const tradeRows  = atlas.canadaProductYear();
      const pciRows    = atlas.productPci();
      return NextResponse.json(
        buildResponse(products, tradeRows, pciRows, year, prevYear, 'Harvard Atlas (static 2024)'),
      );
    } catch (fe: any) {
      return NextResponse.json({ error: fe.message }, { status: 500 });
    }
  }
}
