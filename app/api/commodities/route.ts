import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fetchAllMetals, summarize } from '@/lib/alphavantage/client';

function staticFallback() {
  const file = join(process.cwd(), 'public', 'data', 'intel', 'commodities.json');
  return JSON.parse(readFileSync(file, 'utf-8'));
}

// Alpha Vantage STEEL function exists in premium tier only; COPPER and ALUMINUM
// are on the free tier. We label each metal with its actual source.
const STATIC_LABELS: Record<string, { commodity: string; unit: string }> = {
  COPPER:   { commodity: 'Copper (LME)',        unit: 'USD per metric ton' },
  ALUMINUM: { commodity: 'Aluminum (LME)',       unit: 'USD per metric ton' },
  STEEL:    { commodity: 'Steel HRC (US Midwest)', unit: 'USD per short ton' },
};

export async function GET() {
  const key = process.env.ALPHA_VANTAGE_KEY;

  // No key → return static snapshot immediately (no log spam)
  if (!key) {
    return NextResponse.json({ ...staticFallback(), _noKey: true });
  }

  try {
    const results = await fetchAllMetals(key);

    const statics = staticFallback();
    const metals = results.map((series, i) => {
      const fn = ['COPPER', 'ALUMINUM', 'STEEL'][i];
      if (series) {
        return { ...summarize(series), source: 'Alpha Vantage (live)' };
      }
      // Live fetch for this metal failed → use static value with honest label
      const staticMetal = statics.metals[i];
      return { ...staticMetal, source: 'static-fallback' };
    });

    return NextResponse.json({
      metals,
      source: 'Alpha Vantage · LME spot prices (monthly)',
      generated: metals.find(m => m.latestDate)?.latestDate ?? null,
    });
  } catch (e: any) {
    console.error('commodities live fetch failed, using static fallback:', e.message);
    return NextResponse.json(staticFallback());
  }
}
