import { NextResponse } from 'next/server';

// Live surtax refresh endpoint
// Scrapes justice.gc.ca for current SOR schedules and rebuilds surtaxes.json
// Call: GET /api/refresh?key=YOUR_REFRESH_KEY
// Can be triggered by Vercel cron or manual refresh button

const SOURCES = [
  {
    url: 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2025-95/FullText.html',
    order: 'US Surtax (Steel & Aluminum 2025)',
    sor: 'SOR/2025-95',
    cn: 'CN 25-11',
    origin: 'US',
    rate: 25,
    from: '2025-03-13',
  },
  {
    url: 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2025-119/FullText.html',
    order: 'US Surtax (Motor Vehicles 2025)',
    sor: 'SOR/2025-119',
    cn: 'CN 25-15',
    origin: 'US',
    rate: 25,
    from: '2025-04-09',
  },
  {
    url: 'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2025-267/FullText.html',
    order: 'Steel Derivative Goods Surtax',
    sor: 'SOR/2025-267',
    cn: 'CN 25-33',
    origin: 'ALL',
    rate: 25,
    from: '2025-12-26',
  },
];

// Extract HS codes from justice.gc.ca HTML
// The schedules list codes as plain text like "7318.15.00" on their own lines
function extractHSCodes(html: string): string[] {
  const codes: string[] = [];
  // Match patterns like 7318.15.00, 7601.10.00, 8703.21.00
  const regex = /\b(\d{4}\.\d{2}\.\d{2})\b/g;
  let match;
  const seen = new Set<string>();
  while ((match = regex.exec(html)) !== null) {
    const code = match[1];
    // Only manufacturing chapters 25-99, skip Ch 98/99 internal refs
    const ch = parseInt(code.slice(0, 2));
    if (ch >= 25 && ch <= 97 && !seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  return codes;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  // Optional: protect with a refresh key
  if (process.env.REFRESH_KEY && key !== process.env.REFRESH_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results: any[] = [];
    const sourcesMeta: any[] = [];

    for (const source of SOURCES) {
      try {
        const resp = await fetch(source.url, {
          headers: { 'User-Agent': 'NGen-TariffMonitor/1.0' },
          next: { revalidate: 0 }, // No cache
        });

        if (!resp.ok) {
          console.error(`Failed to fetch ${source.url}: ${resp.status}`);
          continue;
        }

        const html = await resp.text();
        const codes = extractHSCodes(html);

        for (const hs of codes) {
          results.push({
            hs,
            origin: source.origin,
            rate: source.rate,
            order: source.order,
            sor: source.sor,
            cn: source.cn,
            from: source.from,
            to: null,
            type: source.sor.includes('267') ? 'steel_derivative' :
                  source.sor.includes('119') ? 'motor_vehicle' :
                  hs.startsWith('76') ? 'aluminum' : 'steel',
          });
        }

        sourcesMeta.push({
          order: source.order,
          sor: source.sor,
          url: source.url,
          codes_found: codes.length,
          status: 'ok',
        });
      } catch (err: any) {
        sourcesMeta.push({
          order: source.order,
          sor: source.sor,
          url: source.url,
          codes_found: 0,
          status: 'error',
          error: err.message,
        });
      }
    }

    const overlay = {
      generated: new Date().toISOString().slice(0, 10),
      sources: sourcesMeta,
      surtaxes: results,
      notes: {
        non_stackable: 'Canada maintains a non-stackable policy for steel surtaxes.',
        origin_rules: 'US origin by CUSMA marking rules. China origin by Determination of Country of Origin Regulations.',
        auto_refreshed: 'This data was auto-refreshed from justice.gc.ca SOR full text.',
      },
    };

    return NextResponse.json({
      success: true,
      generated: overlay.generated,
      total_entries: results.length,
      sources: sourcesMeta,
      // In production, you'd write this to public/data/surtaxes.json via fs
      // For Vercel serverless, return the data for the client to use
      overlay,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
