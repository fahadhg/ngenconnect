import { NextResponse } from "next/server";

interface Article {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

const FEEDS = [
  { url: "https://www.canadianmanufacturing.com/feed/", source: "Canadian Manufacturing" },
  { url: "https://www.mmsonline.com/rss/all", source: "Modern Machine Shop" },
  { url: "https://www.automationworld.com/rss/all", source: "Automation World" },
  { url: "https://www.industryweek.com/rss/all", source: "IndustryWeek" },
];

function extractText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseRSS(xml: string, source: string): Article[] {
  const articles: Article[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    const titleMatch = item.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = item.match(/<link[^>]*>([\s\S]*?)<\/link>/i) ||
                      item.match(/<link[^>]*href="([^"]+)"/i);
    const descMatch = item.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
    const dateMatch = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
                      item.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i);

    const title = titleMatch ? extractText(titleMatch[1]) : "";
    const link = linkMatch ? extractText(linkMatch[1]) : "";
    const description = descMatch ? extractText(descMatch[1]).slice(0, 200) : "";
    const pubDate = dateMatch ? dateMatch[1].trim() : "";

    if (title && link && link.startsWith("http")) {
      articles.push({ title, link, description, pubDate, source });
    }
  }

  return articles;
}

export async function GET() {
  const results = await Promise.allSettled(
    FEEDS.map(async ({ url, source }) => {
      const res = await fetch(url, {
        headers: { "User-Agent": "NGenConnect/1.0 RSS Reader" },
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 1800 }, // cache 30 min
      });
      if (!res.ok) throw new Error(`${source}: ${res.status}`);
      const xml = await res.text();
      return parseRSS(xml, source).slice(0, 8);
    })
  );

  const articles: Article[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
    }
  }

  // Sort by date descending, falling back to source order
  articles.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  return NextResponse.json({ articles });
}
