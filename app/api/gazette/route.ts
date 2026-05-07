import { NextResponse } from 'next/server';

const GAZETTE_RSS = 'https://www.gazette.gc.ca/rp-pr/p1/rss-eng.xml';

export async function GET() {
  try {
    const res = await fetch(GAZETTE_RSS, {
      next: { revalidate: 3600 } // Cache 1 hour
    });
    
    if (!res.ok) {
      return NextResponse.json({ status: 'error', message: `Gazette RSS ${res.status}` });
    }
    
    const xml = await res.text();
    
    // Simple XML parsing for RSS items
    const items: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null) {
      const content = match[1];
      const title = content.match(/<title>(.*?)<\/title>/)?.[1] || '';
      const link = content.match(/<link>(.*?)<\/link>/)?.[1] || '';
      const pubDate = content.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      const description = content.match(/<description>(.*?)<\/description>/)?.[1] || '';
      
      // Filter for tariff/trade related items
      const lowerTitle = title.toLowerCase();
      const lowerDesc = description.toLowerCase();
      const isTradeRelated = ['tariff', 'customs', 'duty', 'surtax', 'import', 'sor/', 'trade'].some(
        kw => lowerTitle.includes(kw) || lowerDesc.includes(kw)
      );
      
      if (isTradeRelated) {
        items.push({ title, link, pubDate, description: description.slice(0, 200) });
      }
    }
    
    return NextResponse.json({ status: 'ok', items: items.slice(0, 20), source: 'gazette.gc.ca' });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', message: e.message });
  }
}
