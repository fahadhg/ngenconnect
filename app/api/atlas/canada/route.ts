import { NextResponse } from 'next/server';
import { atlas } from '@/lib/atlas/data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') ?? '2022', 10);

  try {
    const products   = atlas.products();
    const productPci = atlas.productPci();
    const tradeRows  = atlas.canadaProductYear();
    const countryYr  = atlas.canadaYear();

    const metaMap = new Map(products.map(p => [p.productId, p]));
    const pciMap  = new Map(
      productPci.filter(r => r.year === year).map(r => [r.productId, r.pci])
    );

    const rows = tradeRows.filter(r => r.year === year && (r.exportValue ?? 0) > 0);
    const productList = rows
      .map(r => {
        const meta = metaMap.get(r.productId);
        return {
          productId:        r.productId,
          code:             meta?.code ?? '',
          name:             meta?.nameShortEn ?? 'Unknown',
          sector:           meta?.topParent?.nameShortEn ?? 'Other',
          sectorCode:       meta?.topParent?.code ?? '9',
          sectorId:         meta?.topParent?.productId ?? 'product-HS92-10',
          exportValue:      r.exportValue ?? 0,
          importValue:      r.importValue ?? 0,
          exportRca:        r.exportRca ?? 0,
          globalMarketShare: r.globalMarketShare ?? 0,
          pci:              pciMap.get(r.productId) ?? null,
          normalizedPci:    r.normalizedPci ?? 0,
        };
      })
      .sort((a, b) => b.exportValue - a.exportValue);

    const totalExports = productList.reduce((s, p) => s + p.exportValue, 0);
    const latestEci    = countryYr.find(r => r.year === year);

    return NextResponse.json({
      status:     'ok',
      year,
      totalExports,
      eci:        latestEci?.eci     ?? null,
      eciFixed:   latestEci?.eciFixed ?? null,
      gdp:        latestEci?.gdp     ?? null,
      gdppc:      latestEci?.gdppc   ?? null,
      products:   productList.slice(0, 200),
      eciHistory: countryYr,
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
