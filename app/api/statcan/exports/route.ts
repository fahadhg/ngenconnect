import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hs = searchParams.get('hs') || '';
  const chapterPrefix = hs.replace(/\./g, '').slice(0, 2);

  try {
    const filePath = join(process.cwd(), 'public', 'data', 'intel', 'exports.json');
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));

    // If a specific HS code was requested, augment topDestinations with tariff rates
    if (chapterPrefix && data.partnerRates) {
      const tops = data.topDestinations.map((d: any) => ({
        ...d,
        tariffRate: data.partnerRates[d.country]?.[chapterPrefix]
          ?? data.partnerRates[d.country]?.['default']
          ?? null,
      }));
      const chapterNote = data.byChapter?.[chapterPrefix];
      return NextResponse.json({
        status: 'ok',
        topDestinations: tops,
        partnerRates: data.partnerRates,
        chapterNote,
        source: data.source,
        generated: data.generated,
      });
    }

    return NextResponse.json({ status: 'ok', ...data });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
