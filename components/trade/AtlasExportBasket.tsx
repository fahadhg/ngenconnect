'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import {
  Treemap, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { TrendingUp, TrendingDown, Globe2, BarChart2, Search, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Sector colours — matching Harvard Atlas palette ──────────────────────────
const SECTOR_COLORS: Record<string, string> = {
  '0': '#e8b84b', // Textiles       — gold
  '1': '#5aaa3c', // Agriculture    — green
  '2': '#999999', // Stone          — mid-grey
  '3': '#e87c1e', // Minerals       — orange
  '4': '#3d85c8', // Metals         — blue
  '5': '#cc2936', // Chemicals      — red
  '6': '#3bbcd4', // Vehicles       — cyan
  '7': '#d63b7a', // Machinery      — pink
  '8': '#f0c040', // Electronics    — yellow
  '9': '#888888', // Other          — grey
};

const SECTOR_NAMES: Record<string, string> = {
  '0': 'Textiles', '1': 'Agriculture', '2': 'Stone', '3': 'Minerals',
  '4': 'Metals', '5': 'Chemicals', '6': 'Vehicles', '7': 'Machinery',
  '8': 'Electronics', '9': 'Other',
};

const sectorColor = (code: string) => SECTOR_COLORS[code] ?? '#888888';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtUSD = (v: number | null | undefined) => {
  if (v == null) return '';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
};

const fmtPct = (v: number | null | undefined, decimals = 2) =>
  v == null ? '' : `${(v * 100).toFixed(decimals)}%`;

const fmtShare = (v: number | null | undefined) =>
  v == null ? '' : `${v.toFixed(2)}%`;

function pciColor(pci: number | null): string {
  if (pci == null) return '#5a6272';
  if (pci >= 1.5)  return '#10b981';
  if (pci >= 0.5)  return '#3b82f6';
  if (pci >= -0.5) return '#f59e0b';
  return '#ef4444';
}
function pciLabel(pci: number | null) {
  if (pci == null) return '';
  if (pci >= 1.5)  return 'Very High';
  if (pci >= 0.5)  return 'High';
  if (pci >= -0.5) return 'Medium';
  return 'Low';
}

// darken a hex colour slightly for the stroke
function darken(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - 40);
  const g = Math.max(0, ((n >> 8)  & 0xff) - 40);
  const b = Math.max(0, ((n)       & 0xff) - 40);
  return `rgb(${r},${g},${b})`;
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, trend }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; trend?: 'up' | 'down' | null;
}) {
  return (
    <div className="p-4 bg-surface-2 rounded-xl border border-border flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-ink-faint font-medium">{label}</span>
        <Icon className="w-3.5 h-3.5 text-ink-faint" />
      </div>
      <div className="font-mono text-2xl font-bold">{value}</div>
      {sub && (
        <div className="flex items-center gap-1 text-xs text-ink-muted">
          {trend === 'up'   && <TrendingUp   className="w-3 h-3 text-positive" />}
          {trend === 'down' && <TrendingDown className="w-3 h-3 text-negative" />}
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Treemap cell — scaled labels, share % prominent ─────────────────────────
function TreemapCell(props: any) {
  const { x, y, width, height, name, share, exportValue, sectorCode, pci, colorBy } = props;
  if (!width || !height || width < 4 || height < 4) return null;

  const fill   = colorBy === 'complexity' ? pciColor(pci) : sectorColor(sectorCode ?? '9');
  const stroke = darken(fill);
  const area   = width * height;

  // scale font sizes with cell area
  const shareFontSize = Math.min(22, Math.max(9,  Math.sqrt(area) / 7));
  const nameFontSize  = Math.min(13, Math.max(8,  Math.sqrt(area) / 11));
  const pad = 6;

  const showShare = width > 42  && height > 24;
  const showName  = width > 55  && height > 42;

  // centre content vertically
  const blockH    = (showShare ? shareFontSize + 4 : 0) + (showName ? nameFontSize + 2 : 0);
  const startY    = y + (height - blockH) / 2 + shareFontSize * 0.8;

  // truncate name to fit
  const maxChars = Math.floor(width / (nameFontSize * 0.55));
  const label    = name && name.length > maxChars ? name.slice(0, Math.max(4, maxChars - 1)) + '…' : name;

  return (
    <g>
      <rect
        x={x} y={y} width={width} height={height}
        fill={fill} stroke={stroke} strokeWidth={1.5}
      />
      {showShare && share != null && (
        <text
          x={x + pad} y={startY}
          fontSize={shareFontSize}
          fontWeight={700}
          fill="rgba(255,255,255,0.95)"
          style={{ fontFamily: 'var(--font-mono, monospace)', userSelect: 'none' }}
        >
          {share.toFixed(2)}%
        </text>
      )}
      {showName && label && (
        <text
          x={x + pad}
          y={startY + (showShare ? shareFontSize * 0.5 + nameFontSize + 2 : 0)}
          fontSize={nameFontSize}
          fontWeight={500}
          fill="rgba(255,255,255,0.82)"
          style={{ userSelect: 'none' }}
        >
          {label}
        </text>
      )}
    </g>
  );
}

// ─── Hover tooltip — rich popup card ─────────────────────────────────────────
function TreemapTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d?.name || !d?.exportValue) return null;

  const fill = sectorColor(d.sectorCode ?? '9');

  return (
    <div className="pointer-events-none z-50 bg-[#181b21] border border-white/10 rounded-xl shadow-2xl w-64 overflow-hidden">
      {/* colour band at top */}
      <div className="h-1" style={{ background: fill }} />
      <div className="p-3.5 space-y-3">
        {/* header */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-medium mb-0.5" style={{ color: fill }}>
            {d.sector}
          </div>
          <div className="font-semibold text-sm leading-tight">{d.name}</div>
          <div className="font-mono text-[10px] text-ink-faint mt-0.5">HS {d.code}</div>
        </div>

        {/* key metrics */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-surface-2 rounded-lg p-2">
            <div className="text-[9px] text-ink-faint uppercase tracking-wider mb-0.5">Export value</div>
            <div className="font-mono text-sm font-bold">{fmtUSD(d.exportValue)}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-2">
            <div className="text-[9px] text-ink-faint uppercase tracking-wider mb-0.5">Share of total</div>
            <div className="font-mono text-sm font-bold">{fmtShare(d.share)}</div>
          </div>
          {d.globalMarketShare != null && (
            <div className="bg-surface-2 rounded-lg p-2">
              <div className="text-[9px] text-ink-faint uppercase tracking-wider mb-0.5">World market share</div>
              <div className="font-mono text-sm font-bold">{fmtPct(d.globalMarketShare)}</div>
            </div>
          )}
          {d.exportRca != null && (
            <div className={clsx('rounded-lg p-2', d.exportRca >= 1 ? 'bg-positive/10' : 'bg-surface-2')}>
              <div className="text-[9px] text-ink-faint uppercase tracking-wider mb-0.5">RCA</div>
              <div className={clsx('font-mono text-sm font-bold', d.exportRca >= 1 ? 'text-positive' : '')}>
                {d.exportRca.toFixed(3)}{d.exportRca >= 1 ? ' ✓' : ''}
              </div>
            </div>
          )}
        </div>

        {/* PCI */}
        {d.pci != null && (
          <div className="flex items-center justify-between text-xs border-t border-white/5 pt-2">
            <span className="text-ink-faint">Product Complexity (PCI)</span>
            <span className="font-mono font-semibold" style={{ color: pciColor(d.pci) }}>
              {d.pci > 0 ? '+' : ''}{d.pci.toFixed(3)}
              <span className="ml-1 text-[10px] opacity-70">({pciLabel(d.pci)})</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
type SortKey = 'exportValue' | 'pci' | 'exportRca' | 'globalMarketShare';

export default function AtlasExportBasket() {
  const [year, setYear]           = useState(2024);
  const [data, setData]           = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [colorBy, setColorBy]     = useState<'sector' | 'complexity'>('sector');
  const [search, setSearch]       = useState('');
  const [sortKey, setSortKey]     = useState<SortKey>('exportValue');
  const [sortAsc, setSortAsc]     = useState(false);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/atlas/canada?year=${y}`);
      setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(year); }, [load, year]);

  // Flat treemap — products with share computed, >$50M
  const treemapData = useMemo(() => {
    if (!data?.products || !data.totalExports) return [];
    return data.products
      .filter((p: any) => (p.exportValue ?? 0) >= 50_000_000)
      .map((p: any) => ({
        ...p,
        size:  p.exportValue,
        share: (p.exportValue / data.totalExports) * 100,
      }))
      .sort((a: any, b: any) => b.exportValue - a.exportValue)
      .slice(0, 100);
  }, [data]);

  // Table products with share
  const tableProducts = useMemo(() => {
    if (!data?.products) return [];
    let rows = data.products.map((p: any) => ({
      ...p,
      share: data.totalExports ? (p.exportValue / data.totalExports) * 100 : null,
    })) as any[];
    if (sectorFilter) rows = rows.filter((p: any) => p.sectorCode === sectorFilter);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((p: any) => p.name?.toLowerCase().includes(q) || p.code?.includes(q));
    }
    return [...rows].sort((a: any, b: any) => {
      const av = a[sortKey] ?? (sortAsc ? Infinity : -Infinity);
      const bv = b[sortKey] ?? (sortAsc ? Infinity : -Infinity);
      return sortAsc ? av - bv : bv - av;
    });
  }, [data, search, sortKey, sortAsc, sectorFilter]);

  const activeSectors = useMemo(() => {
    if (!data?.products) return [];
    const seen = new Map<string, string>();
    for (const p of data.products) {
      if (p.sectorCode && !seen.has(p.sectorCode)) seen.set(p.sectorCode, p.sector);
    }
    return Array.from(seen.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  const eciTrend = useMemo(() => {
    if (!data?.eciHistory) return [];
    return data.eciHistory
      .filter((r: any) => r.year >= 2000)
      .map((r: any) => ({ year: r.year, eci: r.eci ? +r.eci.toFixed(3) : null }));
  }, [data]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a); else { setSortKey(key); setSortAsc(false); }
  };
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? (sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />)
      : <ChevronDown className="w-3 h-3 inline opacity-25" />;

  const years = Array.from({ length: 2024 - 1995 + 1 }, (_, i) => 2024 - i);
  const latestEci = data?.eciHistory?.find((r: any) => r.year === year);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-24 flex flex-col items-center gap-4">
        <div className="w-9 h-9 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        <div className="text-xs text-ink-faint">Loading Harvard Atlas data for {year}…</div>
      </div>
    );
  }
  if (!data || data.status === 'error') {
    return (
      <div className="max-w-6xl mx-auto px-4 py-24 text-center text-sm text-negative">
        Failed to load data from Harvard Atlas.
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Canada Export Basket</h1>
          <p className="text-sm text-ink-muted max-w-xl">
            Export structure, product complexity (PCI) and revealed comparative advantage (RCA).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs text-ink-faint font-medium">Year</label>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value, 10))}
            className="bg-surface-2 border border-border text-sm rounded-lg px-3 py-1.5 text-ink focus:outline-none focus:border-accent"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Exports"      value={fmtUSD(data.totalExports)}           sub={`${year} merchandise`}  icon={Globe2} />
        <StatCard label="ECI Score"          value={latestEci?.eci?.toFixed(3) ?? ''}   sub="Economic Complexity Index" icon={BarChart2} />
        <StatCard label="GDP"                value={fmtUSD(latestEci?.gdp)}              sub={latestEci?.gdppc ? `GDPpc $${latestEci.gdppc.toLocaleString()}` : undefined} icon={TrendingUp} />
        <StatCard label="Products Exported"  value={data.products?.length?.toLocaleString() ?? ''}
          sub={`RCA ≥ 1: ${data.products?.filter((p: any) => (p.exportRca ?? 0) >= 1).length}`} icon={BarChart2} />
      </div>

      {/* ── Treemap ───────────────────────────────────────────────────────────── */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden mb-6">
        {/* toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div>
            <span className="text-sm font-semibold">Export Basket {year}</span>
            <span className="ml-2 text-xs text-ink-faint">Cell size = share of total exports · hover for details</span>
          </div>
          <div className="flex items-center gap-1 p-0.5 bg-surface-2 rounded-lg border border-border">
            {(['sector', 'complexity'] as const).map(opt => (
              <button key={opt} onClick={() => setColorBy(opt)}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  colorBy === opt ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
                )}>
                {opt === 'complexity' ? 'Complexity (PCI)' : 'Sector'}
              </button>
            ))}
          </div>
        </div>

        {/* the treemap */}
        <div className="h-[540px] bg-[#0d1014]">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={treemapData}
              dataKey="size"
              aspectRatio={16 / 9}
              content={<TreemapCell colorBy={colorBy} />}
            >
              <Tooltip content={<TreemapTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>

        {/* sector legend / filter */}
        <div className="px-4 py-3 border-t border-border flex flex-wrap gap-2">
          <button
            onClick={() => setSectorFilter(null)}
            className={clsx(
              'px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors',
              sectorFilter === null ? 'bg-accent/20 border-accent/40 text-accent' : 'border-border text-ink-faint hover:text-ink'
            )}
          >
            All sectors
          </button>
          {activeSectors.map(([code, name]) => (
            <button key={code}
              onClick={() => setSectorFilter(sectorFilter === code ? null : code)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all"
              style={{
                borderColor: sectorFilter === code ? sectorColor(code) : 'rgba(255,255,255,0.08)',
                color: sectorFilter === code ? sectorColor(code) : '#9ca3af',
                background: sectorFilter === code ? sectorColor(code) + '18' : 'transparent',
              }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sectorColor(code) }} />
              {name}
            </button>
          ))}
        </div>

        {/* PCI complexity legend */}
        {colorBy === 'complexity' && (
          <div className="px-4 py-2.5 border-t border-border flex flex-wrap items-center gap-4 text-[10px] text-ink-muted">
            <span className="font-medium text-ink-faint uppercase tracking-wider">PCI</span>
            {[
              { label: 'Very High  ≥ 1.5', color: '#10b981' },
              { label: 'High  0.5–1.5',   color: '#3b82f6' },
              { label: 'Medium  −0.5–0.5',color: '#f59e0b' },
              { label: 'Low  < −0.5',     color: '#ef4444' },
            ].map(({ label, color }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Products table ─────────────────────────────────────────────────────── */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold">
            Products
            {sectorFilter && <span className="ml-2 text-xs font-normal text-ink-faint">— {SECTOR_NAMES[sectorFilter]}</span>}
          </span>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input type="text" placeholder="Search products…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent w-52"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                {[
                  { label: 'HS92', key: null,               cls: 'w-12' },
                  { label: 'Product',      key: null,        cls: '' },
                  { label: 'Sector',       key: null,        cls: 'hidden sm:table-cell' },
                  { label: 'Export Value', key: 'exportValue' as SortKey, cls: 'text-right' },
                  { label: 'Share',        key: null,        cls: 'text-right hidden sm:table-cell' },
                  { label: 'World Share',  key: 'globalMarketShare' as SortKey, cls: 'text-right hidden md:table-cell' },
                  { label: 'RCA',          key: 'exportRca' as SortKey,  cls: 'text-right' },
                  { label: 'PCI',          key: 'pci' as SortKey,        cls: 'text-right hidden lg:table-cell' },
                ].map(({ label, key, cls }) => (
                  <th key={label}
                    onClick={() => key && handleSort(key)}
                    className={clsx('py-2.5 px-3 text-[10px] font-medium text-ink-faint uppercase tracking-wider',
                      cls, key ? 'cursor-pointer hover:text-ink select-none' : '')}
                  >
                    {label}{key && <SortIcon k={key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableProducts.slice(0, 100).map((p: any) => (
                <tr key={p.productId} className="border-b border-border hover:bg-surface-2 transition-colors">
                  <td className="py-2 px-3 font-mono text-[10px] text-ink-faint">{p.code}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sectorColor(p.sectorCode) }} />
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-ink-muted hidden sm:table-cell">{p.sector}</td>
                  <td className="py-2 px-3 text-right font-mono">{fmtUSD(p.exportValue)}</td>
                  <td className="py-2 px-3 text-right font-mono text-ink-muted hidden sm:table-cell">
                    {p.share != null ? `${p.share.toFixed(2)}%` : ''}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-ink-muted hidden md:table-cell">
                    {fmtPct(p.globalMarketShare)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {p.exportRca != null
                      ? <span className={clsx('font-mono', p.exportRca >= 1 ? 'text-positive font-semibold' : 'text-ink-muted')}>{p.exportRca.toFixed(2)}</span>
                      : null}
                  </td>
                  <td className="py-2 px-3 text-right hidden lg:table-cell">
                    {p.pci != null
                      ? <span className="font-mono text-[10px]" style={{ color: pciColor(p.pci) }}>{p.pci > 0 ? '+' : ''}{p.pci.toFixed(2)}</span>
                      : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tableProducts.length > 100 && (
            <div className="text-center text-xs text-ink-faint py-3">
              Showing top 100 of {tableProducts.length} products.
            </div>
          )}
        </div>
      </div>

      {/* ── ECI trend ─────────────────────────────────────────────────────────── */}
      <div className="bg-surface-1 border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-0.5">Economic Complexity Index (ECI) — Canada</h2>
        <p className="text-xs text-ink-faint mb-4">2000–{year} · Higher = more complex export basket</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={eciTrend} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#5a6272' }} axisLine={false} tickLine={false} interval={4} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#5a6272' }} axisLine={false} tickLine={false} />
              <Tooltip
                content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-surface-2 border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
                      <div className="text-ink-muted mb-0.5">{label}</div>
                      <div className="font-mono text-ink">ECI: {payload[0]?.value?.toFixed(3)}</div>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="eci" stroke="#F15A22" strokeWidth={2}
                dot={false} activeDot={{ r: 5, fill: '#F15A22' }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border text-[10px] text-ink-faint">
          <span className="live-dot" />
          <span>Source: Harvard Growth Lab — Atlas of Economic Complexity · atlas.hks.harvard.edu/api/graphql</span>
        </div>
      </div>

    </div>
  );
}
