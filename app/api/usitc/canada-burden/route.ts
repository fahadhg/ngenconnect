import { NextResponse } from 'next/server';
import { fetchCanadaBurden, FALLBACK_BURDEN } from '@/lib/usitc/canada-burden';

export async function GET() {
  try {
    const burden = await fetchCanadaBurden();
    return NextResponse.json(burden);
  } catch {
    return NextResponse.json(FALLBACK_BURDEN);
  }
}
