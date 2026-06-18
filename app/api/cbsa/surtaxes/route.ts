import { NextResponse } from 'next/server';
import { fetchLiveSurtaxes } from '@/lib/cbsa/surtaxes';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  try {
    const data = await fetchLiveSurtaxes();
    return NextResponse.json(data);
  } catch {
    // Fall back to static file
    try {
      const raw = await fs.readFile(
        path.join(process.cwd(), 'public', 'data', 'surtaxes.json'),
        'utf-8',
      );
      return NextResponse.json(JSON.parse(raw));
    } catch {
      return NextResponse.json({ error: 'surtax data unavailable' }, { status: 503 });
    }
  }
}
