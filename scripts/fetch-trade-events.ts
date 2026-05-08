/**
 * Scrapes Canadian trade events from multiple government and industry sources.
 * Run: npx tsx scripts/fetch-trade-events.ts
 * Schedule: biweekly via GitHub Actions (.github/workflows/fetch-trade-events.yml)
 */

import fs from 'fs';
import path from 'path';
import https from 'node:https';
import http from 'node:http';
import zlib from 'node:zlib';
import { URL } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import type { TradeEvent, EventType } from '../lib/events/types';

const OUT_PATH = path.join(process.cwd(), 'data/events/events.json');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Three months ago
const THREE_MONTHS_AGO = new Date();
THREE_MONTHS_AGO.setMonth(THREE_MONTHS_AGO.getMonth() - 3);

// ─── Fetch helpers (node:https — bypasses undici/Akamai TLS fingerprint issues) ─

// Allow corporate CA cert bypass via env (scraping only — not security sensitive)
const TLS_OPTS = process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ? { rejectUnauthorized: false } : {};

function httpGet(urlStr: string, accept = 'text/html,*/*', timeout = 15000, redirects = 6): Promise<string | null> {
  return new Promise(resolve => {
    const doReq = (cur: string, left: number) => {
      let u: URL;
      try { u = new URL(cur); } catch { resolve(null); return; }
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.get({
        hostname: u.hostname,
        port: u.port ? Number(u.port) : undefined,
        path: u.pathname + u.search,
        headers: {
          'User-Agent': UA,
          'Accept': accept,
          'Accept-Language': 'en-CA,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
        timeout,
        ...TLS_OPTS,
      }, res => {
        const loc = res.headers.location;
        if (res.statusCode && [301,302,303,307,308].includes(res.statusCode) && loc) {
          res.resume();
          if (left > 0) doReq(loc.startsWith('http') ? loc : `${u.protocol}//${u.host}${loc}`, left - 1);
          else resolve(null);
          return;
        }
        if (!res.statusCode || res.statusCode >= 400) {
          console.warn(`  [HTTP ${res.statusCode}] ${cur}`);
          res.resume(); resolve(null); return;
        }
        const enc = res.headers['content-encoding'];
        const stream: NodeJS.ReadableStream = enc === 'gzip'
          ? res.pipe(zlib.createGunzip())
          : enc === 'deflate' ? res.pipe(zlib.createInflate()) : res;
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        stream.on('error', () => resolve(null));
      });
      req.on('error', (e) => { console.warn(`  [FAIL] ${cur}: ${e.message}`); resolve(null); });
      req.on('timeout', () => { req.destroy(); console.warn(`  [TIMEOUT] ${cur}`); resolve(null); });
    };
    doReq(urlStr, redirects);
  });
}

const fetchHtml = (url: string, timeout?: number) => httpGet(url, 'text/html,application/xhtml+xml,*/*;q=0.9', timeout);
const fetchXml  = (url: string, timeout?: number) => httpGet(url, 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*', timeout);

// ─── Country detection ───────────────────────────────────────────────────────

const COUNTRY_PATTERNS: Array<{ pattern: RegExp; iso3: string }> = [
  { pattern: /\b(united states|u\.s\.a?\.?|usa|american?)\b/i, iso3: 'USA' },
  { pattern: /\b(mexico|mexican)\b/i, iso3: 'MEX' },
  { pattern: /\b(china|chinese|prc|people'?s republic of china)\b/i, iso3: 'CHN' },
  { pattern: /\b(japan(ese)?)\b/i, iso3: 'JPN' },
  { pattern: /\b(south korea|south korean|republic of korea|korean?)\b/i, iso3: 'KOR' },
  { pattern: /\b(germany|german)\b/i, iso3: 'DEU' },
  { pattern: /\b(france|french)\b/i, iso3: 'FRA' },
  { pattern: /\b(united kingdom|u\.k\.?|britain|british|england)\b/i, iso3: 'GBR' },
  { pattern: /\b(italy|italian)\b/i, iso3: 'ITA' },
  { pattern: /\b(spain|spanish)\b/i, iso3: 'ESP' },
  { pattern: /\b(netherlands|dutch|holland)\b/i, iso3: 'NLD' },
  { pattern: /\b(belgium|belgian)\b/i, iso3: 'BEL' },
  { pattern: /\b(sweden|swedish)\b/i, iso3: 'SWE' },
  { pattern: /\b(norway|norwegian)\b/i, iso3: 'NOR' },
  { pattern: /\b(denmark|danish)\b/i, iso3: 'DNK' },
  { pattern: /\b(finland|finnish)\b/i, iso3: 'FIN' },
  { pattern: /\b(switzerland|swiss)\b/i, iso3: 'CHE' },
  { pattern: /\b(austria|austrian)\b/i, iso3: 'AUT' },
  { pattern: /\b(poland|polish)\b/i, iso3: 'POL' },
  { pattern: /\b(ireland|irish)\b/i, iso3: 'IRL' },
  { pattern: /\b(portugal|portuguese)\b/i, iso3: 'PRT' },
  { pattern: /\b(ukraine|ukrainian)\b/i, iso3: 'UKR' },
  { pattern: /\b(india|indian)\b/i, iso3: 'IND' },
  { pattern: /\b(australia|australian)\b/i, iso3: 'AUS' },
  { pattern: /\b(new zealand|new zealander)\b/i, iso3: 'NZL' },
  { pattern: /\b(singapore|singaporean)\b/i, iso3: 'SGP' },
  { pattern: /\b(malaysia|malaysian)\b/i, iso3: 'MYS' },
  { pattern: /\b(indonesia|indonesian)\b/i, iso3: 'IDN' },
  { pattern: /\b(vietnam(ese)?|viet nam)\b/i, iso3: 'VNM' },
  { pattern: /\b(thailand|thai)\b/i, iso3: 'THA' },
  { pattern: /\b(philippines|philippine|filipino)\b/i, iso3: 'PHL' },
  { pattern: /\b(taiwan(ese)?)\b/i, iso3: 'TWN' },
  { pattern: /\b(hong kong)\b/i, iso3: 'HKG' },
  { pattern: /\b(brunei)\b/i, iso3: 'BRN' },
  { pattern: /\b(brazil|brazilian)\b/i, iso3: 'BRA' },
  { pattern: /\b(argentina|argentinian?)\b/i, iso3: 'ARG' },
  { pattern: /\b(chile|chilean)\b/i, iso3: 'CHL' },
  { pattern: /\b(colombia|colombian)\b/i, iso3: 'COL' },
  { pattern: /\b(peru|peruvian)\b/i, iso3: 'PER' },
  { pattern: /\b(panama|panamanian)\b/i, iso3: 'PAN' },
  { pattern: /\b(costa rica|costa rican)\b/i, iso3: 'CRI' },
  { pattern: /\b(honduras|honduran)\b/i, iso3: 'HND' },
  { pattern: /\b(israel|israeli)\b/i, iso3: 'ISR' },
  { pattern: /\b(jordan|jordanian)\b/i, iso3: 'JOR' },
  { pattern: /\b(saudi arabia|saudi|ksa)\b/i, iso3: 'SAU' },
  { pattern: /\b(united arab emirates|u\.?a\.?e\.?|emirates|emirati?)\b/i, iso3: 'ARE' },
  { pattern: /\b(qatar|qatari)\b/i, iso3: 'QAT' },
  { pattern: /\b(egypt|egyptian)\b/i, iso3: 'EGY' },
  { pattern: /\b(morocco|moroccan)\b/i, iso3: 'MAR' },
  { pattern: /\b(south africa|south african)\b/i, iso3: 'ZAF' },
  { pattern: /\b(nigeria|nigerian)\b/i, iso3: 'NGA' },
  { pattern: /\b(kenya|kenyan)\b/i, iso3: 'KEN' },
  { pattern: /\b(ghana|ghanaian)\b/i, iso3: 'GHA' },
  { pattern: /\b(russia|russian)\b/i, iso3: 'RUS' },
  { pattern: /\b(turkey|turkish|türkiye)\b/i, iso3: 'TUR' },
  { pattern: /\b(iceland|icelandic)\b/i, iso3: 'ISL' },
  { pattern: /\b(pakistan|pakistani)\b/i, iso3: 'PAK' },
  { pattern: /\b(bangladesh|bangladeshi)\b/i, iso3: 'BGD' },
  { pattern: /\b(kazakh(stan)?)\b/i, iso3: 'KAZ' },
];

const REGION_EXPANSIONS: Record<string, string[]> = {
  asean: ['SGP','MYS','IDN','THA','PHL','VNM','KHM','BRN'],
  'indo-pacific': ['JPN','KOR','AUS','NZL','SGP','IND','IDN','MYS','VNM','PHL'],
  'european union': ['DEU','FRA','ITA','ESP','NLD','BEL','SWE','POL','DNK','FIN','AUT','GRC','PRT','IRL','CZE','HUN','ROU'],
  europe: ['DEU','FRA','ITA','ESP','GBR','NLD','BEL','SWE','NOR','CHE'],
  'latin america': ['BRA','MEX','ARG','CHL','COL','PER'],
  africa: ['ZAF','NGA','KEN','GHA','EGY','MAR'],
  'middle east': ['SAU','ARE','QAT','EGY','ISR','JOR'],
  g7: ['USA','GBR','DEU','FRA','ITA','JPN'],
  g20: ['USA','GBR','DEU','FRA','ITA','JPN','CHN','IND','BRA','AUS','KOR','MEX','SAU'],
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
  for (const { pattern, iso3 } of COUNTRY_PATTERNS) {
    if (pattern.test(text)) found.add(iso3);
  }
  for (const { pattern, key } of REGION_PATTERNS) {
    if (pattern.test(text)) {
      for (const iso3 of (REGION_EXPANSIONS[key] ?? [])) found.add(iso3);
    }
  }
  found.delete('CAN');
  return Array.from(found);
}

// ─── Event type detection ────────────────────────────────────────────────────

function detectEventType(title: string, description: string): EventType {
  const t = `${title} ${description}`.toLowerCase();
  if (/trade mission|minister\w* leads|delegation|ministerial visit|trade commissioner/.test(t)) return 'mission';
  if (/trade show|trade fair|expo|exposition|exhibition|pavilion|showcase|hannover|ces |ceatec|sial/.test(t)) return 'trade-show';
  if (/summit|g7|g20|bilateral meeting|leaders'? meeting/.test(t)) return 'summit';
  if (/conference|forum|symposium|seminar|workshop|webinar/.test(t)) return 'conference';
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
  } catch { return null; }
}

function slugify(title: string, date: string): string {
  return `${date}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
}

// ─── XML/RSS parser ──────────────────────────────────────────────────────────

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function parseRssItems(xml: string): any[] {
  try {
    const parsed = xmlParser.parse(xml);
    const items = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
    return Array.isArray(items) ? items : [items];
  } catch { return []; }
}

function rssItemToEvent(item: any, defaultSource: string): TradeEvent | null {
  const title = String(item.title ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
  if (!title) return null;
  const rawDate = item.pubDate ?? item.updated ?? item.published ?? '';
  const date = parseDate(rawDate);
  if (!date) return null;
  const link = String(item.link?.['@_href'] ?? item.link ?? item.guid ?? '').trim();
  const description = String(item.description ?? item.summary ?? item.content ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').replace(/<[^>]+>/g, '').trim();
  return {
    id: slugify(title, date),
    title,
    description: description.slice(0, 400),
    date,
    source: defaultSource,
    sourceUrl: link,
    eventType: detectEventType(title, description),
    countryIso3: detectCountries(`${title} ${description}`),
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Source 1: International.gc.ca news (HTML scrape) ───────────────────────

async function fetchInternationalGC(): Promise<TradeEvent[]> {
  const urls = [
    'https://www.canada.ca/en/global-affairs/news.html',
    'https://www.canada.ca/en/global-affairs/news/releases.html',
    'https://www.international.gc.ca/world-monde/news-nouvelles/index.aspx',
  ];
  const events: TradeEvent[] = [];
  const seen = new Set<string>();

  for (const url of urls) {
    const html = await fetchHtml(url);
    if (!html) continue;

    // Match <article> blocks or news-item divs
    const blockRe = /<(?:article|div)[^>]*class="[^"]*(?:news|article|item|result)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div)>/gi;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(html)) !== null) {
      const block = m[1];
      const titleM = /<(?:h[2-4]|a)[^>]*>([\s\S]*?)<\/(?:h[2-4]|a)>/i.exec(block);
      const title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : '';
      if (!title || title.length < 10) continue;
      if (!/trade|export|mission|delegation|tariff|fta|bilateral|international/i.test(title)) continue;

      const dateM = /(\d{4}-\d{2}-\d{2}|\w+ \d{1,2},?\s+\d{4})/i.exec(block);
      const date = parseDate(dateM?.[1]);
      if (!date) continue;

      const linkM = /href="(https?:\/\/[^"]+|\/[^"]+)"/.exec(block);
      const rawLink = linkM?.[1] ?? '';
      const link = rawLink.startsWith('http') ? rawLink : `https://www.international.gc.ca${rawLink}`;
      if (seen.has(link)) continue;
      seen.add(link);

      const desc = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      events.push({
        id: slugify(title, date),
        title,
        description: desc.slice(0, 400),
        date,
        source: 'Global Affairs Canada',
        sourceUrl: link,
        eventType: detectEventType(title, desc),
        countryIso3: detectCountries(`${title} ${desc}`),
        fetchedAt: new Date().toISOString(),
      });
    }

    // Also check for simple <li><a> date patterns
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    while ((m = liRe.exec(html)) !== null) {
      const block = m[1];
      const aM = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!aM) continue;
      const title = aM[2].replace(/<[^>]+>/g, '').trim();
      if (!title || title.length < 10) continue;
      if (!/trade|export|mission|delegation|tariff|bilateral/i.test(title)) continue;

      const dateM = /(\d{4}-\d{2}-\d{2}|\w+ \d{1,2},?\s+\d{4})/i.exec(block);
      const date = parseDate(dateM?.[1]);
      if (!date) continue;

      const rawLink = aM[1];
      const link = rawLink.startsWith('http') ? rawLink : `https://www.international.gc.ca${rawLink}`;
      if (seen.has(link)) continue;
      seen.add(link);

      events.push({
        id: slugify(title, date),
        title,
        description: '',
        date,
        source: 'Global Affairs Canada',
        sourceUrl: link,
        eventType: detectEventType(title, ''),
        countryIso3: detectCountries(title),
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  return events;
}

// ─── Source 2: Canada.ca search JSON API ────────────────────────────────────

async function fetchCanadaCaNews(): Promise<TradeEvent[]> {
  const events: TradeEvent[] = [];
  const seen = new Set<string>();

  // canada.ca news-results JSON endpoint — one query covers trade missions and delegations
  const endpoints = [
    'https://www.canada.ca/en/news/advanced-news-search/news-results.json?topic=trade-and-investment&type=news-releases',
    'https://www.canada.ca/en/news/advanced-news-search/news-results.json?keywords=trade+mission&type=news-releases',
  ];

  const results = await Promise.allSettled(endpoints.map(u => fetchXml(u)));
  for (const res of results) {
    if (res.status !== 'fulfilled' || !res.value) continue;
    try {
      const data = JSON.parse(res.value);
      const items: any[] = data?.items ?? data?.results ?? [];
      for (const item of items) {
        const title = String(item.title ?? item.name ?? '').replace(/<[^>]+>/g, '').trim();
        if (!title || !(/trade|export|mission|delegation/i.test(title))) continue;
        const date = parseDate(item.date ?? item.pubDate ?? item.dateModified ?? '');
        if (!date) continue;
        const link = String(item.url ?? item.link ?? '');
        if (!link || seen.has(link)) continue;
        seen.add(link);
        const desc = String(item.description ?? item.excerpt ?? '').replace(/<[^>]+>/g, '').trim();
        events.push({
          id: slugify(title, date),
          title,
          description: desc.slice(0, 400),
          date,
          source: 'Global Affairs Canada',
          sourceUrl: link,
          eventType: detectEventType(title, desc),
          countryIso3: detectCountries(`${title} ${desc}`),
          fetchedAt: new Date().toISOString(),
        });
      }
    } catch { /* not JSON */ }
  }

  return events;
}

// ─── Source 3: Trade Commissioner Service events (HTML) ──────────────────────

async function fetchTCS(): Promise<TradeEvent[]> {
  const events: TradeEvent[] = [];
  const html = await fetchHtml(
    'https://www.tradecommissioner.gc.ca/trade-events-evenements-commerciaux/index.aspx',
    18000
  );
  if (!html) return events;
  const seen = new Set<string>();

  // TCS event table rows
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const block = m[1];
    const cells = [...block.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c =>
      c[1].replace(/<[^>]+>/g, '').trim()
    );
    if (cells.length < 2) continue;

    const title = cells[0] || cells[1];
    if (!title || title.length < 6) continue;

    const dateStr = cells.find(c => /\d{4}/.test(c) && /\w+/.test(c)) ?? '';
    const date = parseDate(dateStr);
    if (!date) continue;

    const linkM = /href="([^"]+)"/.exec(block);
    const rawLink = linkM?.[1] ?? '';
    const link = rawLink.startsWith('http') ? rawLink
      : rawLink ? `https://www.tradecommissioner.gc.ca${rawLink}`
      : 'https://www.tradecommissioner.gc.ca/trade-events-evenements-commerciaux/index.aspx';
    if (seen.has(link)) continue;
    seen.add(link);

    const text = cells.join(' ');
    events.push({
      id: slugify(title, date),
      title,
      description: text.slice(0, 400),
      date,
      source: 'Trade Commissioner Service',
      sourceUrl: link,
      eventType: detectEventType(title, text),
      countryIso3: detectCountries(text),
      fetchedAt: new Date().toISOString(),
    });
  }

  return events;
}

// ─── Source 4: EDC events (JSON API — discovered from page source) ───────────

async function fetchEDC(): Promise<TradeEvent[]> {
  const events: TradeEvent[] = [];
  // EDC loads events via a servlet JSON endpoint embedded in the page
  const raw = await fetchXml(
    'https://www.edc.ca/bin/upcomingeventsservlet.json?pageUrl=L2NvbnRlbnQvZWRjL2VuL2V2ZW50cw=='
  );
  if (!raw) return events;
  try {
    const data = JSON.parse(raw) as { pageItems?: any[] };
    for (const item of data.pageItems ?? []) {
      const title = String(item.linkText ?? '').trim();
      if (!title) continue;
      // webinarStartDateTime is a Unix ms timestamp
      const ts = item.webinarStartDateTime ?? item.webinarEndDateTime;
      const date = ts ? parseDate(new Date(ts).toISOString()) : null;
      if (!date) continue;
      const link = item.linkUrl?.startsWith('http')
        ? item.linkUrl
        : `https://www.edc.ca${item.linkUrl ?? '/en/events.html'}`;
      const desc = String(item.description ?? '').trim();
      events.push({
        id: slugify(title, date),
        title,
        description: desc.slice(0, 400),
        date,
        source: 'Export Development Canada',
        sourceUrl: link,
        eventType: detectEventType(title, desc),
        countryIso3: detectCountries(`${title} ${desc}`),
        fetchedAt: new Date().toISOString(),
      });
    }
  } catch { /* bad JSON */ }
  return events;
}

// ─── Source 5: CME (Canadian Manufacturers & Exporters) ──────────────────────

async function fetchCME(): Promise<TradeEvent[]> {
  const events: TradeEvent[] = [];
  const html = await fetchHtml('https://cme-mec.ca/events/');
  if (!html) return events;

  const cardRe = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(html)) !== null) {
    const block = m[1];
    const titleM = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(block);
    const title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : '';
    if (!title) continue;

    const dateM = /<time[^>]*datetime="([^"]+)"/.exec(block)
      ?? /(\d{4}-\d{2}-\d{2})/.exec(block);
    const date = parseDate(dateM?.[1]);
    if (!date) continue;

    const linkM = /href="(https?:\/\/cme-mec\.ca\/[^"]+)"/.exec(block);
    const link = linkM?.[1] ?? 'https://cme-mec.ca/events/';

    const desc = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    events.push({
      id: slugify(title, date),
      title,
      description: desc.slice(0, 400),
      date,
      source: 'Canadian Manufacturers & Exporters',
      sourceUrl: link,
      eventType: detectEventType(title, desc),
      countryIso3: detectCountries(`${title} ${desc}`),
      fetchedAt: new Date().toISOString(),
    });
  }

  return events;
}

// ─── Source 6: BDC Events ────────────────────────────────────────────────────

async function fetchBDC(): Promise<TradeEvent[]> {
  const events: TradeEvent[] = [];
  const html = await fetchHtml('https://www.bdc.ca/en/events-and-webinars') ?? await fetchHtml('https://www.bdc.ca/en/events.aspx');
  if (!html) return events;

  // BDC uses JSON-LD or card divs
  const jsonLdM = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = jsonLdM.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const items: any[] = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] !== 'Event') continue;
        const title = String(item.name ?? '').trim();
        if (!title) continue;
        const date = parseDate(item.startDate);
        if (!date) continue;
        const desc = String(item.description ?? '').replace(/<[^>]+>/g, '').trim();
        events.push({
          id: slugify(title, date),
          title,
          description: desc.slice(0, 400),
          date,
          endDate: item.endDate ? (parseDate(item.endDate) ?? undefined) : undefined,
          source: 'Business Development Bank of Canada',
          sourceUrl: item.url ?? 'https://www.bdc.ca/en/events',
          eventType: detectEventType(title, desc),
          countryIso3: detectCountries(`${title} ${desc}`),
          fetchedAt: new Date().toISOString(),
        });
      }
    } catch { /* skip bad JSON */ }
  }

  return events;
}

// ─── Source 7: GAC press release RSS feeds ───────────────────────────────────

async function fetchGACRSS(): Promise<TradeEvent[]> {
  const feeds = [
    'https://www.canada.ca/en/global-affairs/news/releases/feed.xml',
    'https://www.canada.ca/en/news.rss',
    'https://www.international.gc.ca/world-monde/news-nouvelles/rss.aspx',
    'https://www.canada.ca/content/canadasite/en/global-affairs/news.feed.rss',
  ];
  const events: TradeEvent[] = [];
  const seen = new Set<string>();

  for (const url of feeds) {
    const xml = await fetchXml(url);
    if (!xml) continue;
    for (const item of parseRssItems(xml)) {
      const title = String(item.title ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
      if (!title || !/trade|export|mission|delegation|tariff|bilateral/i.test(title)) continue;
      const event = rssItemToEvent(item, 'Global Affairs Canada');
      if (!event) continue;
      if (seen.has(event.sourceUrl)) continue;
      seen.add(event.sourceUrl);
      events.push(event);
    }
  }

  return events;
}

// ─── Source 8: Canadian Heritage — Creative Industries Trade Missions ────────

async function fetchCanadianHeritage(): Promise<TradeEvent[]> {
  const BASE = 'https://www.canada.ca';
  const events: TradeEvent[] = [];
  const html = await fetchHtml(
    `${BASE}/en/canadian-heritage/services/creative-industries-trade-missions.html`
  );
  if (!html) return events;

  const seen = new Set<string>();

  // Canada.ca pages typically wrap each listing in <details>, <section>, or <div class="panel-...">
  // Try to find anchors that look like event detail pages, then grab surrounding context
  const linkRe = /<a\s[^>]*href="([^"#]+(?:trade-mission|mission-commerciale)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(html)) !== null) {
    const rawLink = m[1];
    const linkText = m[2].replace(/<[^>]+>/g, '').trim();
    if (!linkText || linkText.length < 6) continue;
    const link = rawLink.startsWith('http') ? rawLink : `${BASE}${rawLink}`;
    if (seen.has(link)) continue;
    seen.add(link);

    // Grab ~800 chars of context around this match to find date and description
    const start = Math.max(0, m.index - 300);
    const ctx = html.slice(start, m.index + 800);
    const dateM = /(\w{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+\w{3,9}\s+\d{4})/i.exec(ctx);
    const date = parseDate(dateM?.[1]);
    if (!date) continue;

    const desc = ctx.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    events.push({
      id: slugify(linkText, date),
      title: linkText,
      description: desc.slice(0, 400),
      date,
      source: 'Canadian Heritage',
      sourceUrl: link,
      eventType: 'mission',
      countryIso3: detectCountries(`${linkText} ${desc}`),
      fetchedAt: new Date().toISOString(),
    });
  }

  // Fallback: Canada.ca uses <h3> / <h4> + nearby <p> for event lists
  // Match headings that sound like trade mission titles
  const headingRe = /<h[234][^>]*>([\s\S]*?)<\/h[234]>/gi;
  while ((m = headingRe.exec(html)) !== null) {
    const title = m[1].replace(/<[^>]+>/g, '').trim();
    if (!title || title.length < 8) continue;
    if (!/mission|trade|export|creative|industry|industries/i.test(title)) continue;

    const ctx = html.slice(m.index, m.index + 1200);
    const dateM = /(\w{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+\w{3,9}\s+\d{4})/i.exec(ctx);
    const date = parseDate(dateM?.[1]);
    if (!date) continue;

    const linkM = /href="([^"]+)"/.exec(ctx);
    const rawLink = linkM?.[1] ?? '';
    const link = rawLink.startsWith('http') ? rawLink
      : rawLink ? `${BASE}${rawLink}`
      : `${BASE}/en/canadian-heritage/services/creative-industries-trade-missions.html`;
    if (seen.has(link)) continue;
    seen.add(link);

    const desc = ctx.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    events.push({
      id: slugify(title, date),
      title,
      description: desc.slice(0, 400),
      date,
      source: 'Canadian Heritage',
      sourceUrl: link,
      eventType: 'mission',
      countryIso3: detectCountries(`${title} ${desc}`),
      fetchedAt: new Date().toISOString(),
    });
  }

  return events;
}

// ─── Source 9: Canadian Chamber of Commerce events ───────────────────────────

async function fetchCCC(): Promise<TradeEvent[]> {
  const events: TradeEvent[] = [];
  const html = await fetchHtml('https://chamber.ca/events/');
  if (!html) return events;

  // Events live in the event-slick-slider section as <a href="chamber.ca/events/..."> cards
  // Each card contains: <p class="dates">DATE</p> and <h3>TITLE</h3>
  const sliderStart = html.indexOf('event-slick-slider');
  const section = sliderStart !== -1 ? html.slice(sliderStart, sliderStart + 200000) : html;

  const seen = new Set<string>();
  // Match each event anchor card
  const cardRe = /<a\s[^>]*href="(https:\/\/chamber\.ca\/events\/[^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(section)) !== null) {
    const link = m[1].split('?')[0];
    if (seen.has(link)) continue;
    seen.add(link);

    const block = m[2];

    // Date: <p class="dates">Mar 23, 2026</p> or similar
    const dateM = /<p[^>]*class="[^"]*dates[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(block)
      ?? /<time[^>]*datetime="([^"]+)"/.exec(block)
      ?? /(\w{3,9}\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/.exec(block);
    const rawDate = dateM ? dateM[1].replace(/<[^>]+>/g, '').trim() : '';
    const date = parseDate(rawDate);
    if (!date) continue;

    // Title: <h3>...</h3>
    const titleM = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i.exec(block);
    const title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : '';
    if (!title || title.length < 6) continue;

    // Description: text-dark-body div or fallback to full block text
    const descM = /<div[^>]*class="[^"]*text-dark-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
    const desc = descM
      ? descM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    events.push({
      id: slugify(title, date),
      title,
      description: desc.slice(0, 400),
      date,
      source: 'Canadian Chamber of Commerce',
      sourceUrl: link,
      eventType: detectEventType(title, desc),
      countryIso3: detectCountries(`${title} ${desc}`),
      fetchedAt: new Date().toISOString(),
    });
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
    fetchInternationalGC().then(r => { console.log(`  ✓ Global Affairs Canada (HTML): ${r.length}`); return r; }),
    fetchCanadaCaNews().then(r => { console.log(`  ✓ Canada.ca news search: ${r.length}`); return r; }),
    fetchGACRSS().then(r => { console.log(`  ✓ Global Affairs Canada RSS: ${r.length}`); return r; }),
    fetchTCS().then(r => { console.log(`  ✓ Trade Commissioner Service: ${r.length}`); return r; }),
    fetchEDC().then(r => { console.log(`  ✓ Export Development Canada: ${r.length}`); return r; }),
    fetchCME().then(r => { console.log(`  ✓ Canadian Manufacturers & Exporters: ${r.length}`); return r; }),
    fetchBDC().then(r => { console.log(`  ✓ Business Development Bank: ${r.length}`); return r; }),
    fetchCanadianHeritage().then(r => { console.log(`  ✓ Canadian Heritage (Creative Industries): ${r.length}`); return r; }),
    fetchCCC().then(r => { console.log(`  ✓ Canadian Chamber of Commerce: ${r.length}`); return r; }),
  ]);

  const all: TradeEvent[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') all.push(...result.value);
    else console.warn('  ✗ Source error:', result.reason?.message);
  }

  const deduped = deduplicate(all).sort((a, b) => b.date.localeCompare(a.date));
  console.log(`\nTotal unique events: ${deduped.length}`);

  fs.writeFileSync(OUT_PATH, JSON.stringify({ events: deduped, lastUpdated: new Date().toISOString() }, null, 2));
  console.log(`Saved → ${OUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
