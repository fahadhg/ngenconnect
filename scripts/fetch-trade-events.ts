/**
 * Scrapes Canadian trade events from multiple government and industry sources.
 * Run: npx tsx scripts/fetch-trade-events.ts
 * Schedule: biweekly via GitHub Actions (.github/workflows/fetch-trade-events.yml)
 */

import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import type { TradeEvent, EventType } from '../lib/events/types';

const OUT_PATH = path.join(process.cwd(), 'data/events/events.json');

// Three months ago
const THREE_MONTHS_AGO = new Date();
THREE_MONTHS_AGO.setMonth(THREE_MONTHS_AGO.getMonth() - 3);

// ─── Country detection ───────────────────────────────────────────────────────

const COUNTRY_PATTERNS: Array<{ patterns: RegExp; iso3: string; name: string }> = [
  { patterns: /\b(united states|u\.s\.a?\.?|usa|american?)\b/i, iso3: 'USA', name: 'United States' },
  { patterns: /\b(mexico|mexican)\b/i, iso3: 'MEX', name: 'Mexico' },
  { patterns: /\b(china|chinese|prc|people'?s republic of china)\b/i, iso3: 'CHN', name: 'China' },
  { patterns: /\b(japan(ese)?)\b/i, iso3: 'JPN', name: 'Japan' },
  { patterns: /\b(south korea|south korean|republic of korea|korean?)\b/i, iso3: 'KOR', name: 'South Korea' },
  { patterns: /\b(germany|german)\b/i, iso3: 'DEU', name: 'Germany' },
  { patterns: /\b(france|french)\b/i, iso3: 'FRA', name: 'France' },
  { patterns: /\b(united kingdom|u\.k\.?|britain|british|england|english)\b/i, iso3: 'GBR', name: 'United Kingdom' },
  { patterns: /\b(italy|italian)\b/i, iso3: 'ITA', name: 'Italy' },
  { patterns: /\b(spain|spanish)\b/i, iso3: 'ESP', name: 'Spain' },
  { patterns: /\b(netherlands|dutch|holland)\b/i, iso3: 'NLD', name: 'Netherlands' },
  { patterns: /\b(belgium|belgian)\b/i, iso3: 'BEL', name: 'Belgium' },
  { patterns: /\b(sweden|swedish)\b/i, iso3: 'SWE', name: 'Sweden' },
  { patterns: /\b(norway|norwegian)\b/i, iso3: 'NOR', name: 'Norway' },
  { patterns: /\b(denmark|danish)\b/i, iso3: 'DNK', name: 'Denmark' },
  { patterns: /\b(finland|finnish)\b/i, iso3: 'FIN', name: 'Finland' },
  { patterns: /\b(switzerland|swiss)\b/i, iso3: 'CHE', name: 'Switzerland' },
  { patterns: /\b(austria|austrian)\b/i, iso3: 'AUT', name: 'Austria' },
  { patterns: /\b(poland|polish)\b/i, iso3: 'POL', name: 'Poland' },
  { patterns: /\b(ireland|irish)\b/i, iso3: 'IRL', name: 'Ireland' },
  { patterns: /\b(portugal|portuguese)\b/i, iso3: 'PRT', name: 'Portugal' },
  { patterns: /\b(czechia|czech republic|czech)\b/i, iso3: 'CZE', name: 'Czechia' },
  { patterns: /\b(hungary|hungarian)\b/i, iso3: 'HUN', name: 'Hungary' },
  { patterns: /\b(romania|romanian)\b/i, iso3: 'ROU', name: 'Romania' },
  { patterns: /\b(greece|greek)\b/i, iso3: 'GRC', name: 'Greece' },
  { patterns: /\b(ukraine|ukrainian)\b/i, iso3: 'UKR', name: 'Ukraine' },
  { patterns: /\b(india|indian)\b/i, iso3: 'IND', name: 'India' },
  { patterns: /\b(australia|australian)\b/i, iso3: 'AUS', name: 'Australia' },
  { patterns: /\b(new zealand|new zealander)\b/i, iso3: 'NZL', name: 'New Zealand' },
  { patterns: /\b(singapore|singaporean)\b/i, iso3: 'SGP', name: 'Singapore' },
  { patterns: /\b(malaysia|malaysian)\b/i, iso3: 'MYS', name: 'Malaysia' },
  { patterns: /\b(indonesia|indonesian)\b/i, iso3: 'IDN', name: 'Indonesia' },
  { patterns: /\b(vietnam(ese)?|viet nam)\b/i, iso3: 'VNM', name: 'Vietnam' },
  { patterns: /\b(thailand|thai)\b/i, iso3: 'THA', name: 'Thailand' },
  { patterns: /\b(philippines|philippine|filipino)\b/i, iso3: 'PHL', name: 'Philippines' },
  { patterns: /\b(taiwan(ese)?)\b/i, iso3: 'TWN', name: 'Taiwan' },
  { patterns: /\b(hong kong)\b/i, iso3: 'HKG', name: 'Hong Kong' },
  { patterns: /\b(brunei)\b/i, iso3: 'BRN', name: 'Brunei' },
  { patterns: /\b(brazil|brazilian)\b/i, iso3: 'BRA', name: 'Brazil' },
  { patterns: /\b(argentina|argentinian?)\b/i, iso3: 'ARG', name: 'Argentina' },
  { patterns: /\b(chile|chilean)\b/i, iso3: 'CHL', name: 'Chile' },
  { patterns: /\b(colombia|colombian)\b/i, iso3: 'COL', name: 'Colombia' },
  { patterns: /\b(peru|peruvian)\b/i, iso3: 'PER', name: 'Peru' },
  { patterns: /\b(panama|panamanian)\b/i, iso3: 'PAN', name: 'Panama' },
  { patterns: /\b(costa rica|costa rican)\b/i, iso3: 'CRI', name: 'Costa Rica' },
  { patterns: /\b(honduras|honduran)\b/i, iso3: 'HND', name: 'Honduras' },
  { patterns: /\b(israel|israeli)\b/i, iso3: 'ISR', name: 'Israel' },
  { patterns: /\b(jordan|jordanian)\b/i, iso3: 'JOR', name: 'Jordan' },
  { patterns: /\b(saudi arabia|saudi|ksa)\b/i, iso3: 'SAU', name: 'Saudi Arabia' },
  { patterns: /\b(united arab emirates|u\.?a\.?e\.?|emirates|emirati?)\b/i, iso3: 'ARE', name: 'UAE' },
  { patterns: /\b(qatar|qatari)\b/i, iso3: 'QAT', name: 'Qatar' },
  { patterns: /\b(egypt|egyptian)\b/i, iso3: 'EGY', name: 'Egypt' },
  { patterns: /\b(morocco|moroccan)\b/i, iso3: 'MAR', name: 'Morocco' },
  { patterns: /\b(south africa|south african)\b/i, iso3: 'ZAF', name: 'South Africa' },
  { patterns: /\b(nigeria|nigerian)\b/i, iso3: 'NGA', name: 'Nigeria' },
  { patterns: /\b(kenya|kenyan)\b/i, iso3: 'KEN', name: 'Kenya' },
  { patterns: /\b(ghana|ghanaian)\b/i, iso3: 'GHA', name: 'Ghana' },
  { patterns: /\b(ethiopia|ethiopian)\b/i, iso3: 'ETH', name: 'Ethiopia' },
  { patterns: /\b(russia|russian)\b/i, iso3: 'RUS', name: 'Russia' },
  { patterns: /\b(turkey|turkish|türkiye)\b/i, iso3: 'TUR', name: 'Türkiye' },
  { patterns: /\b(iceland|icelandic)\b/i, iso3: 'ISL', name: 'Iceland' },
  { patterns: /\b(pakistan|pakistani)\b/i, iso3: 'PAK', name: 'Pakistan' },
  { patterns: /\b(bangladesh|bangladeshi)\b/i, iso3: 'BGD', name: 'Bangladesh' },
  { patterns: /\b(sri lanka|sri lankan)\b/i, iso3: 'LKA', name: 'Sri Lanka' },
  { patterns: /\b(cambodia|cambodian|khmer)\b/i, iso3: 'KHM', name: 'Cambodia' },
  { patterns: /\b(peru|peruvian)\b/i, iso3: 'PER', name: 'Peru' },
  { patterns: /\b(kazakhstan|kazakhstani?)\b/i, iso3: 'KAZ', name: 'Kazakhstan' },
];

// Regional expansions — when a region is mentioned, include these ISO3 codes
const REGION_EXPANSIONS: Record<string, string[]> = {
  'asean': ['SGP','MYS','IDN','THA','PHL','VNM','KHM','BRN','MMR','LAO'],
  'indo-pacific': ['JPN','KOR','AUS','NZL','SGP','IND','IDN','MYS','VNM','PHL'],
  'european union': ['DEU','FRA','ITA','ESP','NLD','BEL','SWE','POL','DNK','FIN','AUT','GRC','PRT','IRL','CZE','HUN','ROU','HRV','SVK','SVN','LTU','LVA','EST','CYP','MLT','LUX','BGR'],
  'europe': ['DEU','FRA','ITA','ESP','GBR','NLD','BEL','SWE','NOR','CHE'],
  'latin america': ['BRA','MEX','ARG','CHL','COL','PER','VEN','ECU'],
  'africa': ['ZAF','NGA','KEN','GHA','ETH','EGY','MAR'],
  'middle east': ['SAU','ARE','QAT','EGY','ISR','JOR','KWT','IRQ'],
  'g7': ['USA','GBR','DEU','FRA','ITA','JPN','CAN'],
  'g20': ['USA','GBR','DEU','FRA','ITA','JPN','CHN','IND','BRA','CAN','AUS','KOR','MEX','SAU','ARE','TUR','ZAF','ARG','IDN','RUS'],
};

const REGION_PATTERNS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /\basean\b/i, key: 'asean' },
  { pattern: /\bindo[-\s]?pacific\b/i, key: 'indo-pacific' },
  { pattern: /\beuropean union\b|\bthe eu\b/i, key: 'european union' },
  { pattern: /\blatin america\b/i, key: 'latin america' },
  { pattern: /\bmiddle east\b/i, key: 'middle east' },
  { pattern: /\bafrica\b/i, key: 'africa' },
  { pattern: /\bg7\b/i, key: 'g7' },
  { pattern: /\bg20\b/i, key: 'g20' },
];

function detectCountries(text: string): string[] {
  const found = new Set<string>();

  for (const { patterns, iso3 } of COUNTRY_PATTERNS) {
    if (patterns.test(text)) found.add(iso3);
  }

  for (const { pattern, key } of REGION_PATTERNS) {
    if (pattern.test(text)) {
      for (const iso3 of (REGION_EXPANSIONS[key] ?? [])) found.add(iso3);
    }
  }

  // Remove Canada itself
  found.delete('CAN');
  return Array.from(found);
}

// ─── Event type detection ────────────────────────────────────────────────────

function detectEventType(title: string, description: string): EventType {
  const text = `${title} ${description}`.toLowerCase();
  if (/trade mission|minister\w* leads|delegation|ministerial visit/.test(text)) return 'mission';
  if (/trade show|trade fair|expo|exposition|exhibition|pavilion|showcase|hannover|ces |ceatec|sial|ifex/.test(text)) return 'trade-show';
  if (/summit|g7|g20|bilateral meeting|leaders'? meeting|head of (state|government)/.test(text)) return 'summit';
  if (/conference|forum|symposium|seminar|workshop|webinar/.test(text)) return 'conference';
  return 'other';
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    if (d < THREE_MONTHS_AGO) return null;
    return d.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function slugify(title: string, date: string): string {
  return `${date}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
}

// ─── Source 1: Canada.ca / Global Affairs Canada news search API ─────────────

async function fetchGlobalAffairs(): Promise<TradeEvent[]> {
  const queries = [
    'trade mission',
    'trade delegation',
    'trade show Canada',
    'export mission minister',
  ];

  const cutoff = THREE_MONTHS_AGO.toISOString().split('T')[0].replace(/-/g, '');
  const today  = new Date().toISOString().split('T')[0].replace(/-/g, '');

  const events: TradeEvent[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    try {
      const url = `https://api.canada.ca/en/searchengine/?collection=gc-announcements&lang=en&q=${encodeURIComponent(q)}&sort=date&rows=50&start_date=${cutoff}&end_date=${today}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const json = await res.json() as any;
      const docs: any[] = json?.response?.docs ?? json?.docs ?? [];

      for (const doc of docs) {
        const title = String(doc.title ?? '').trim();
        const rawDate = doc.date ?? doc.pubDate ?? '';
        const date = parseDate(rawDate);
        if (!date || !title) continue;
        const url_ = String(doc.url ?? doc.htmlurl ?? '').trim();
        if (seen.has(url_)) continue;
        seen.add(url_);

        const description = String(doc.description ?? doc.excerpt ?? '').replace(/<[^>]+>/g, '').trim();
        const text = `${title} ${description}`;

        events.push({
          id: slugify(title, date),
          title,
          description: description.slice(0, 400),
          date,
          source: 'Global Affairs Canada',
          sourceUrl: url_,
          eventType: detectEventType(title, description),
          countryIso3: detectCountries(text),
          fetchedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn(`[GAC] query "${q}" failed:`, (e as Error).message);
    }
  }

  return events;
}

// ─── Source 2: Trade Commissioner Service RSS ────────────────────────────────

async function fetchTCS(): Promise<TradeEvent[]> {
  const feeds = [
    'https://www.tradecommissioner.gc.ca/trade-events-evenements-commerciaux/rss.aspx',
    'https://www.tradecommissioner.gc.ca/news-nouvelles/rss.aspx',
  ];
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const events: TradeEvent[] = [];
  const seen = new Set<string>();

  for (const feedUrl of feeds) {
    try {
      const res = await fetch(feedUrl, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const parsed = parser.parse(xml);
      const items: any[] = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];

      for (const item of (Array.isArray(items) ? items : [items])) {
        const title = String(item.title ?? '').trim();
        const rawDate = item.pubDate ?? item.updated ?? item.published ?? '';
        const date = parseDate(rawDate);
        if (!date || !title) continue;

        const link = String(item.link?.['@_href'] ?? item.link ?? item.guid ?? '').trim();
        if (seen.has(link)) continue;
        seen.add(link);

        const description = String(item.description ?? item.summary ?? item.content ?? '')
          .replace(/<[^>]+>/g, '').trim();
        const text = `${title} ${description}`;

        events.push({
          id: slugify(title, date),
          title,
          description: description.slice(0, 400),
          date,
          source: 'Trade Commissioner Service',
          sourceUrl: link,
          eventType: detectEventType(title, description),
          countryIso3: detectCountries(text),
          fetchedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn(`[TCS] feed ${feedUrl} failed:`, (e as Error).message);
    }
  }

  return events;
}

// ─── Source 3: Export Development Canada events (HTML) ──────────────────────

async function fetchEDC(): Promise<TradeEvent[]> {
  const events: TradeEvent[] = [];
  try {
    const res = await fetch('https://www.edc.ca/en/events.html', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return events;
    const html = await res.text();

    // EDC event cards: <article ...> with <h3> title, <time datetime="..."> date
    const cardRe = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    let m: RegExpExecArray | null;
    while ((m = cardRe.exec(html)) !== null) {
      const block = m[1];

      const titleM = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(block);
      const title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : '';
      if (!title) continue;

      const dateM = /<time[^>]*datetime="([^"]+)"/.exec(block);
      const date = parseDate(dateM?.[1]);
      if (!date) continue;

      const linkM = /href="(\/en\/events\/[^"]+)"/.exec(block);
      const link = linkM ? `https://www.edc.ca${linkM[1]}` : 'https://www.edc.ca/en/events.html';

      const descM = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
      const description = descM ? descM[1].replace(/<[^>]+>/g, '').trim() : '';
      const text = `${title} ${description}`;

      events.push({
        id: slugify(title, date),
        title,
        description: description.slice(0, 400),
        date,
        source: 'Export Development Canada',
        sourceUrl: link,
        eventType: detectEventType(title, description),
        countryIso3: detectCountries(text),
        fetchedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn('[EDC] failed:', (e as Error).message);
  }
  return events;
}

// ─── Source 4: Canadian Manufacturers & Exporters events ────────────────────

async function fetchCME(): Promise<TradeEvent[]> {
  const events: TradeEvent[] = [];
  try {
    const res = await fetch('https://cme-mec.ca/events/', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return events;
    const html = await res.text();

    // CME uses Tribe Events — <article class="tribe-events-calendar-list__event-article" ...>
    const cardRe = /<article[^>]*tribe[^>]*>([\s\S]*?)<\/article>/gi;
    let m: RegExpExecArray | null;
    while ((m = cardRe.exec(html)) !== null) {
      const block = m[1];

      const titleM = /<h[23][^>]*class="[^"]*tribe-event[^"]*"[^>]*>([\s\S]*?)<\/h[23]>/i.exec(block)
        ?? /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(block);
      const title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : '';
      if (!title) continue;

      const dateM = /<abbr[^>]*title="([^"]+)"/.exec(block)
        ?? /<time[^>]*datetime="([^"]+)"/.exec(block);
      const date = parseDate(dateM?.[1]);
      if (!date) continue;

      const linkM = /href="(https?:\/\/cme-mec\.ca\/event\/[^"]+)"/.exec(block);
      const link = linkM?.[1] ?? 'https://cme-mec.ca/events/';

      const descM = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
      const description = descM ? descM[1].replace(/<[^>]+>/g, '').trim() : '';
      const text = `${title} ${description}`;

      events.push({
        id: slugify(title, date),
        title,
        description: description.slice(0, 400),
        date,
        source: 'Canadian Manufacturers & Exporters',
        sourceUrl: link,
        eventType: detectEventType(title, description),
        countryIso3: detectCountries(text),
        fetchedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn('[CME] failed:', (e as Error).message);
  }
  return events;
}

// ─── Source 5: BDC Events ────────────────────────────────────────────────────

async function fetchBDC(): Promise<TradeEvent[]> {
  const events: TradeEvent[] = [];
  try {
    const res = await fetch('https://www.bdc.ca/en/events', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return events;
    const html = await res.text();

    const cardRe = /<div[^>]*class="[^"]*event-card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    let m: RegExpExecArray | null;
    while ((m = cardRe.exec(html)) !== null) {
      const block = m[1];

      const titleM = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(block);
      const title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : '';
      if (!title) continue;

      const dateM = /<time[^>]*datetime="([^"]+)"/.exec(block)
        ?? /datetime="([^"]+)"/.exec(block);
      const date = parseDate(dateM?.[1]);
      if (!date) continue;

      const linkM = /href="(\/en\/events\/[^"]+)"/.exec(block);
      const link = linkM ? `https://www.bdc.ca${linkM[1]}` : 'https://www.bdc.ca/en/events';

      const descM = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
      const description = descM ? descM[1].replace(/<[^>]+>/g, '').trim() : '';
      const text = `${title} ${description}`;

      events.push({
        id: slugify(title, date),
        title,
        description: description.slice(0, 400),
        date,
        source: 'Business Development Bank of Canada',
        sourceUrl: link,
        eventType: detectEventType(title, description),
        countryIso3: detectCountries(text),
        fetchedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn('[BDC] failed:', (e as Error).message);
  }
  return events;
}

// ─── Source 6: Global Affairs Canada News RSS ────────────────────────────────

async function fetchGACRSS(): Promise<TradeEvent[]> {
  const feedUrls = [
    'https://www.canada.ca/en/global-affairs/news/releases/feed.xml',
    'https://www.canada.ca/en/global-affairs/news/feed.xml',
    'https://www.international.gc.ca/trade-commerce/trade-agreements-accords-commerciaux/agr-acc/rss.xml',
  ];
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const events: TradeEvent[] = [];
  const seen = new Set<string>();

  for (const feedUrl of feedUrls) {
    try {
      const res = await fetch(feedUrl, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const xml = await res.text();
      const parsed = parser.parse(xml);
      const items: any[] = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];

      for (const item of (Array.isArray(items) ? items : [items])) {
        const title = String(item.title ?? '').trim();
        if (!title || !/trade|export|import|tariff|mission|delegation/i.test(title)) continue;

        const rawDate = item.pubDate ?? item.updated ?? item.published ?? '';
        const date = parseDate(rawDate);
        if (!date) continue;

        const link = String(item.link?.['@_href'] ?? item.link ?? '').trim();
        if (!link || seen.has(link)) continue;
        seen.add(link);

        const description = String(item.description ?? item.summary ?? '')
          .replace(/<[^>]+>/g, '').trim();
        const text = `${title} ${description}`;

        events.push({
          id: slugify(title, date),
          title,
          description: description.slice(0, 400),
          date,
          source: 'Global Affairs Canada',
          sourceUrl: link,
          eventType: detectEventType(title, description),
          countryIso3: detectCountries(text),
          fetchedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn(`[GAC-RSS] ${feedUrl} failed:`, (e as Error).message);
    }
  }

  return events;
}

// ─── Source 7: CanadaExport / TCS HTML event listings ───────────────────────

async function fetchTCSHtml(): Promise<TradeEvent[]> {
  const events: TradeEvent[] = [];
  try {
    const res = await fetch('https://www.tradecommissioner.gc.ca/trade-events-evenements-commerciaux/index.aspx', {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return events;
    const html = await res.text();

    // TCS event rows: look for table rows or list items with dates
    const rowRe = /<(?:tr|li)[^>]*class="[^"]*event[^"]*"[^>]*>([\s\S]*?)<\/(?:tr|li)>/gi;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(html)) !== null) {
      const block = m[1];
      const titleM = /<(?:td|a|h[2-4])[^>]*>([\s\S]*?)<\/(?:td|a|h[2-4])>/i.exec(block);
      const title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : '';
      if (!title || title.length < 8) continue;

      const dateStr = block.match(/(\d{4}-\d{2}-\d{2}|\w+ \d{1,2},? \d{4})/)?.[1];
      const date = parseDate(dateStr);
      if (!date) continue;

      const linkM = /href="([^"]+)"/.exec(block);
      const link = linkM?.[1]?.startsWith('http')
        ? linkM[1]
        : `https://www.tradecommissioner.gc.ca${linkM?.[1] ?? ''}`;

      const text = block.replace(/<[^>]+>/g, ' ');

      events.push({
        id: slugify(title, date),
        title,
        description: text.replace(/\s+/g, ' ').trim().slice(0, 400),
        date,
        source: 'Trade Commissioner Service',
        sourceUrl: link,
        eventType: detectEventType(title, text),
        countryIso3: detectCountries(text),
        fetchedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn('[TCS-HTML] failed:', (e as Error).message);
  }
  return events;
}

// ─── Source 8: Ottawa Board of Trade / BizTradeShows Canada ─────────────────

async function fetchBizTradeShows(): Promise<TradeEvent[]> {
  const events: TradeEvent[] = [];
  try {
    const res = await fetch('https://www.biztradeshows.com/canada/', { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return events;
    const html = await res.text();

    const cardRe = /<div[^>]*class="[^"]*trade[^"]*show[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let m: RegExpExecArray | null;
    while ((m = cardRe.exec(html)) !== null) {
      const block = m[1];
      const titleM = /<(?:h[2-4]|strong|a)[^>]*>([\s\S]*?)<\/(?:h[2-4]|strong|a)>/i.exec(block);
      const title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : '';
      if (!title) continue;

      const dateStr = block.match(/(\d{4}-\d{2}-\d{2}|\w+ \d{1,2},? \d{4})/)?.[1];
      const date = parseDate(dateStr);
      if (!date) continue;

      const linkM = /href="(https?:\/\/[^"]+)"/.exec(block);
      const link = linkM?.[1] ?? 'https://www.biztradeshows.com/canada/';

      const text = block.replace(/<[^>]+>/g, ' ');

      events.push({
        id: slugify(title, date),
        title,
        description: text.replace(/\s+/g, ' ').trim().slice(0, 400),
        date,
        source: 'BizTradeShows Canada',
        sourceUrl: link,
        eventType: 'trade-show',
        countryIso3: detectCountries(text),
        fetchedAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn('[BizTradeShows] failed:', (e as Error).message);
  }
  return events;
}

// ─── Deduplicate ─────────────────────────────────────────────────────────────

function deduplicate(events: TradeEvent[]): TradeEvent[] {
  const seen = new Set<string>();
  return events.filter(e => {
    const key = e.sourceUrl || e.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching Canadian trade events (last 3 months)...\n');

  const results = await Promise.allSettled([
    fetchGlobalAffairs().then(r => { console.log(`  ✓ Global Affairs Canada API: ${r.length} events`); return r; }),
    fetchGACRSS().then(r => { console.log(`  ✓ Global Affairs Canada RSS: ${r.length} events`); return r; }),
    fetchTCS().then(r => { console.log(`  ✓ Trade Commissioner Service RSS: ${r.length} events`); return r; }),
    fetchTCSHtml().then(r => { console.log(`  ✓ Trade Commissioner Service HTML: ${r.length} events`); return r; }),
    fetchEDC().then(r => { console.log(`  ✓ Export Development Canada: ${r.length} events`); return r; }),
    fetchCME().then(r => { console.log(`  ✓ Canadian Manufacturers & Exporters: ${r.length} events`); return r; }),
    fetchBDC().then(r => { console.log(`  ✓ Business Development Bank: ${r.length} events`); return r; }),
    fetchBizTradeShows().then(r => { console.log(`  ✓ BizTradeShows Canada: ${r.length} events`); return r; }),
  ]);

  const all: TradeEvent[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') all.push(...result.value);
    else console.warn('  ✗ Source failed:', result.reason?.message);
  }

  const deduped = deduplicate(all).sort((a, b) => b.date.localeCompare(a.date));
  console.log(`\nTotal unique events: ${deduped.length}`);

  const out = { events: deduped, lastUpdated: new Date().toISOString() };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`\nSaved to ${OUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
