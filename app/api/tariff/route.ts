import { NextResponse } from 'next/server';

const CBSA_BASE = 'https://ccp-pcc.cbsa-asfc.cloud-nuage.canada.ca';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hs = searchParams.get('hs') || '';
  
  try {
    // Try the CBSA CARM OData endpoint
    const url = `${CBSA_BASE}/opendata/tariff/v1/tariffClassifications?$filter=startswith(TariffNumber,'${hs}')&$top=100&$format=json`;
    
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 86400 } // Cache for 24 hours
    });
    
    if (!res.ok) {
      return NextResponse.json({
        status: 'fallback',
        message: `CBSA API returned ${res.status}. Using bundled T2026 data.`,
        source: 'cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026'
      });
    }
    
    const data = await res.json();
    return NextResponse.json({ status: 'live', data, source: 'CBSA CARM OData API' });
  } catch (e: any) {
    return NextResponse.json({
      status: 'fallback',
      message: `CBSA API unreachable: ${e.message}. Using bundled T2026 data.`,
      source: 'cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026'
    });
  }
}
