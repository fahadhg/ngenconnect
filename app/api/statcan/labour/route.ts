import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fetchLabour } from '@/lib/statcan/transforms';

function staticFallback() {
  const file = join(process.cwd(), 'public', 'data', 'intel', 'labour.json');
  return { ...JSON.parse(readFileSync(file, 'utf-8')), _source: 'static-fallback' };
}

export async function GET() {
  try {
    const data = await fetchLabour();
    return NextResponse.json({ status: 'ok', ...data });
  } catch (e: any) {
    console.error('labour live fetch failed, using static fallback:', e.message);
    try {
      return NextResponse.json({ status: 'ok', ...staticFallback() });
    } catch (fe: any) {
      return NextResponse.json({ status: 'error', message: fe.message }, { status: 500 });
    }
  }
}
