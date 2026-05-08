'use client';

import { useState, useEffect, useMemo } from 'react';
import { ExternalLink, ChevronDown, ChevronUp, Search, Calendar, Globe, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import type { EnrichedEvent, CountryTrade, EventType } from '@/lib/events/types';

const fmtUSD = (v: number) => {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (v > 0) return `$${v.toLocaleString()}`;
  return '—';
};

const fmtDate = (d: string) => {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

const EVENT_TYPE_META: Record<EventType | 'other', { label: string; color: string; bg: string }> = {
  mission:    { label: 'Trade Mission', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
  'trade-show': { label: 'Trade Show', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  summit:     { label: 'Summit', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
  conference: { label: 'Conference', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  other:      { label: 'Event', color: 'text-gray-600', bg: 'bg-gray-100 border-gray-200' },
};

const FILTERS: Array<{ key: EventType | 'all'; label: string }> = [
  { key: 'all', label: 'All Events' },
  { key: 'mission', label: 'Trade Missions' },
  { key: 'trade-show', label: 'Trade Shows' },
  { key: 'summit', label: 'Summits' },
  { key: 'conference', label: 'Conferences' },
  { key: 'other', label: 'Other' },
];

// Mini sparkline — inline SVG
function Sparkline({ data, width = 80, height = 28 }: {
  data: { year: number; exports: number; imports: number }[];
  width?: number;
  height?: number;
}) {
  if (!data.length) return null;
  const expMax = Math.max(...data.map(d => d.exports), 1);
  const impMax = Math.max(...data.map(d => d.imports), 1);
  const max = Math.max(expMax, impMax);
  const pts = (key: 'exports' | 'imports') =>
    data.map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (d[key] / max) * (height - 2) - 1;
      return `${x},${y}`;
    }).join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts('exports')} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" />
      <polyline points={pts('imports')} fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function CountryPanel({ country }: { country: CountryTrade }) {
  const [ftaOpen, setFtaOpen] = useState(false);
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{country.flag}</span>
        <div>
          <div className="font-semibold text-gray-900 text-sm">{country.name}</div>
          {country.fta && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 mt-0.5">
              <ShieldCheck size={9} />
              {country.fta.name} in force
            </span>
          )}
        </div>
      </div>

      {/* Trade figures */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-white rounded-lg border border-gray-200 p-2.5">
          <div className="text-[10px] text-gray-500 mb-0.5">Canadian Exports (2022)</div>
          <div className="text-sm font-semibold text-blue-700 font-mono">{fmtUSD(country.exports2022)}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-2.5">
          <div className="text-[10px] text-gray-500 mb-0.5">Canadian Imports (2022)</div>
          <div className="text-sm font-semibold text-orange-600 font-mono">{fmtUSD(country.imports2022)}</div>
        </div>
      </div>

      {/* Sparkline */}
      {country.sparkline.length > 1 && (
        <div className="mb-3">
          <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block rounded" /> Exports</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block rounded" /> Imports</span>
            <span className="ml-auto text-gray-300">2015–2022</span>
          </div>
          <Sparkline data={country.sparkline} width={200} height={36} />
        </div>
      )}

      {/* FTA details */}
      {country.fta && (
        <div className="border-t border-gray-200 pt-3">
          <button
            className="flex items-center justify-between w-full text-left text-xs font-semibold text-gray-700 hover:text-gray-900"
            onClick={() => setFtaOpen(o => !o)}
          >
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-emerald-600" />
              {country.fta.fullName}
            </span>
            {ftaOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {ftaOpen && (
            <div className="mt-2 space-y-2">
              <div className="text-[11px] text-gray-500">
                In force: <span className="text-gray-700 font-medium">{new Date(country.fta.inForce).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
              {country.fta.tariffCoverage && (
                <div className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg px-2.5 py-1.5">
                  {country.fta.tariffCoverage}
                </div>
              )}
              <p className="text-[11px] text-gray-600 leading-relaxed">{country.fta.description}</p>
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-1">Key Provisions</div>
              <ul className="space-y-1">
                {country.fta.keyProvisions.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[11px] text-gray-600">
                    <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-1.5 flex-wrap mt-1">
                {country.fta.covers.map(c => (
                  <span key={c} className="text-[10px] bg-gray-100 text-gray-600 border border-gray-200 rounded-full px-2 py-0.5">{c}</span>
                ))}
              </div>
              <a
                href={country.fta.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-1"
              >
                Full agreement details <ExternalLink size={9} />
              </a>
            </div>
          )}
        </div>
      )}

      {!country.fta && (
        <div className="text-[11px] text-gray-400 border-t border-gray-100 pt-2 mt-1">
          No bilateral FTA with Canada currently in force.
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: EnrichedEvent }) {
  const [expanded, setExpanded] = useState(false);
  const meta = EVENT_TYPE_META[event.eventType] ?? EVENT_TYPE_META.other;
  const hasCountries = event.countries.length > 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx('text-[10px] font-semibold border rounded-full px-2.5 py-0.5 uppercase tracking-wide', meta.bg, meta.color)}>
              {meta.label}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Calendar size={11} />
              {fmtDate(event.date)}
              {event.endDate && event.endDate !== event.date && ` – ${fmtDate(event.endDate)}`}
            </span>
          </div>
          <span className="text-[10px] text-gray-400 shrink-0">{event.source}</span>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-2">
          <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="hover:text-blue-700 transition-colors inline-flex items-start gap-1.5">
            {event.title}
            <ExternalLink size={11} className="shrink-0 mt-0.5 opacity-40" />
          </a>
        </h3>

        {/* Description */}
        {event.description && (
          <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-3">{event.description}</p>
        )}

        {/* Country tags */}
        {hasCountries && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {event.countries.slice(0, 8).map(c => (
              <span key={c.iso3} className="inline-flex items-center gap-1 text-[11px] bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5 text-gray-700">
                <span>{c.flag}</span>
                <span>{c.name}</span>
                {c.fta && <span className="text-emerald-600 font-semibold">· {c.fta.name}</span>}
              </span>
            ))}
            {event.countries.length > 8 && (
              <span className="text-[11px] text-gray-400 flex items-center">+{event.countries.length - 8} more</span>
            )}
          </div>
        )}

        {/* Expand / collapse */}
        {hasCountries && (
          <button
            onClick={() => setExpanded(o => !o)}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            <Globe size={12} />
            {expanded ? 'Hide trade data' : 'View trade data & FTA details'}
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {/* Expanded country panels */}
      {expanded && hasCountries && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {event.countries.map(c => (
              <CountryPanel key={c.iso3} country={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TradeEventsPage() {
  const [events, setEvents] = useState<EnrichedEvent[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<EventType | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/events')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setEvents(d.events ?? []); setLastUpdated(d.lastUpdated ?? ''); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    let list = events;
    if (filter !== 'all') list = list.filter(e => e.eventType === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.countries.some(c => c.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [events, filter, search]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: events.length };
    for (const e of events) map[e.eventType] = (map[e.eventType] ?? 0) + 1;
    return map;
  }, [events]);

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        {/* Filter tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto shrink-0">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={clsx(
                'px-3 py-1.5 text-xs rounded-lg font-medium transition-all whitespace-nowrap',
                filter === f.key
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {f.label}
              {counts[f.key] !== undefined && (
                <span className={clsx('ml-1.5 text-[10px]', filter === f.key ? 'text-gray-400' : 'text-gray-400')}>
                  {counts[f.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title, description, or country…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Last updated */}
      {lastUpdated && (
        <p className="text-xs text-gray-400 mb-4">
          Last refreshed: {new Date(lastUpdated).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
          &nbsp;·&nbsp;{filtered.length} event{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* States */}
      {loading && (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading trade events…</div>
      )}
      {error && (
        <div className="h-64 flex items-center justify-center text-red-500 text-sm">Failed to load events: {error}</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="h-64 flex flex-col items-center justify-center text-gray-400 gap-2">
          <Globe size={32} className="opacity-30" />
          <p className="text-sm">
            {events.length === 0
              ? 'No events yet — run the fetch script to populate data.'
              : 'No events match your filters.'}
          </p>
          {events.length === 0 && (
            <code className="text-xs bg-gray-100 rounded px-2 py-1 text-gray-600 mt-1">
              npx tsx scripts/fetch-trade-events.ts
            </code>
          )}
        </div>
      )}

      {/* Event list */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map(event => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
