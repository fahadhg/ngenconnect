import { NextResponse } from 'next/server';
import { atlas } from '@/lib/atlas/data';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') ?? '2024', 10);

  try {
    const products   = atlas.products();
    const productPci = atlas.productPci();
    const tradeRows  = atlas.canadaProductYear();
    const countryYr  = atlas.canadaYear();

    const metaMap = new Map(products.map(p => [p.productId, p]));
    const pciMap  = new Map(
      productPci.filter(r => r.year === year).map(r => [r.productId, r.pci])
    );

    const rows = tradeRows.filter(r => r.year === year && (r.importValue ?? 0) > 0);
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
          importValue:      r.importValue ?? 0,
          exportValue:      r.exportValue ?? 0,
          exportRca:        r.exportRca ?? 0,
          globalMarketShare: r.globalMarketShare ?? 0,
          pci:              pciMap.get(r.productId) ?? null,
          normalizedPci:    r.normalizedPci ?? 0,
        };
      })
      .sort((a, b) => b.importValue - a.importValue);

    const totalImports = productList.reduce((s, p) => s + p.importValue, 0);
    const latestYr     = countryYr.find(r => r.year === year);
    const tradeBalance = (latestYr?.exportValue ?? 0) - (latestYr?.importValue ?? 0);

    return NextResponse.json({
      status:       'ok',
      year,
      totalImports,
      tradeBalance,
      eci:          latestYr?.eci   ?? null,
      gdp:          latestYr?.gdp   ?? null,
      gdppc:        latestYr?.gdppc ?? null,
      products:     productList.slice(0, 200),
      eciHistory:   countryYr,
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
