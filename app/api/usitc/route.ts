import { NextResponse } from 'next/server';
import { fetchHtsRate } from '@/lib/usitc/client';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hs = searchParams.get('hs')?.trim() ?? '';

  if (!hs) {
    return NextResponse.json({ error: 'hs parameter required' }, { status: 400 });
  }

  try {
    const results = await fetchHtsRate(hs);
    return NextResponse.json({
      status: 'ok',
      query:  hs,
      count:  results.length,
      items:  results,
      source: 'USITC HTS Online (hts.usitc.gov) — live, no API key required',
    });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
