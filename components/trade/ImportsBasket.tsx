'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import {
  Treemap, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Globe2, BarChart2, Search, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Sector colours ───────────────────────────────────────────────────────────
const SECTOR_COLORS: Record<string, string> = {
  '0': '#e8b84b', '1': '#5aaa3c', '2': '#999999', '3': '#e87c1e',
  '4': '#3d85c8', '5': '#cc2936', '6': '#3bbcd4', '7': '#d63b7a',
  '8': '#f0c040', '9': '#888888',
};
const SECTOR_NAMES: Record<string, string> = {
  '0': 'Textiles', '1': 'Agriculture', '2': 'Stone', '3': 'Minerals',
  '4': 'Metals', '5': 'Chemicals', '6': 'Vehicles', '7': 'Machinery',
  '8': 'Electronics', '9': 'Other',
};
const sectorColor = (code: string) => SECTOR_COLORS[code] ?? '#888888';

function darken(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - 40);
  const g = Math.max(0, ((n >> 8)  & 0xff) - 40);
  const b = Math.max(0, ((n)       & 0xff) - 40);
  return `rgb(${r},${g},${b})`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtUSD = (v: number | null | undefined) => {
  if (v == null) return '';
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (Math.abs(v) >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
};
const fmtPct = (v: number | null | undefined) => v == null ? '' : `${(v * 100).toFixed(2)}%`;
const fmtShare = (v: number | null | undefined) => v == null ? '' : `${v.toFixed(2)}%`;

function pciColor(pci: number | null) {
  if (pci == null) return '#5a6272';
  if (pci >= 1.5) return '#10b981'; if (pci >= 0.5) return '#3b82f6';
  if (pci >= -0.5) return '#f59e0b'; return '#ef4444';
}
function pciLabel(pci: number | null) {
  if (pci == null) return '';
  if (pci >= 1.5) return 'Very High'; if (pci >= 0.5) return 'High';
  if (pci >= -0.5) return 'Medium'; return 'Low';
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, warn }: {
  label: string; value: string; sub?: string; icon: React.ElementType; warn?: boolean;
}) {
  return (
    <div className={clsx('p-4 rounded-xl border flex flex-col gap-1.5',
      warn ? 'bg-negative/5 border-negative/20' : 'bg-surface-2 border-border')}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-ink-faint font-medium">{label}</span>
        <Icon className={clsx('w-3.5 h-3.5', warn ? 'text-negative' : 'text-ink-faint')} />
      </div>
      <div className={clsx('font-mono text-2xl font-bold', warn && 'text-negative')}>{value}</div>
      {sub && <div className="text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

// ─── Treemap cell ─────────────────────────────────────────────────────────────
function TreemapCell(props: any) {
  const { x, y, width, height, name, share, sectorCode, pci, colorBy } = props;
  if (!width || !height || width < 4 || height < 4) return null;

  const fill   = colorBy === 'complexity' ? pciColor(pci) : sectorColor(sectorCode ?? '9');
  const stroke = darken(fill);
  const area   = width * height;
  const shareFontSize = Math.min(22, Math.max(9, Math.sqrt(area) / 7));
  const nameFontSize  = Math.min(13, Math.max(8, Math.sqrt(area) / 11));
  const pad = 6;
  const showShare = width > 42 && height > 24;
  const showName  = width > 55 && height > 42;
  const blockH = (showShare ? shareFontSize + 4 : 0) + (showName ? nameFontSize + 2 : 0);
  const startY = y + (height - blockH) / 2 + shareFontSize * 0.8;
  const maxChars = Math.floor(width / (nameFontSize * 0.55));
  const label = name && name.length > maxChars ? name.slice(0, Math.max(4, maxChars - 1)) + '…' : name;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke={stroke} strokeWidth={1.5} />
      {showShare && share != null && (
        <text x={x + pad} y={startY} fontSize={shareFontSize} fontWeight={700}
          fill="rgba(255,255,255,0.95)"
          style={{ fontFamily: 'var(--font-mono, monospace)', userSelect: 'none' }}>
          {share.toFixed(2)}%
        </text>
      )}
      {showName && label && (
        <text x={x + pad} y={startY + (showShare ? shareFontSize * 0.5 + nameFontSize + 2 : 0)}
          fontSize={nameFontSize} fontWeight={500}
          fill="rgba(255,255,255,0.82)"
          style={{ userSelect: 'none' }}>
          {label}
        </text>
      )}
    </g>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function TreemapTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d?.name || !d?.importValue) return null;
  const fill = sectorColor(d.sectorCode ?? '9');
  return (
    <div className="pointer-events-none z-50 bg-[#181b21] border border-white/10 rounded-xl shadow-2xl w-64 overflow-hidden">
      <div className="h-1" style={{ background: fill }} />
      <div className="p-3.5 space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-medium mb-0.5" style={{ color: fill }}>
            {d.sector}
          </div>
          <div className="font-semibold text-sm leading-tight">{d.name}</div>
          <div className="font-mono text-[10px] text-ink-faint mt-0.5">HS {d.code}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-surface-2 rounded-lg p-2">
            <div className="text-[9px] text-ink-faint uppercase tracking-wider mb-0.5">Import value</div>
            <div className="font-mono text-sm font-bold">{fmtUSD(d.importValue)}</div>
          </div>
          <div className="bg-surface-2 rounded-lg p-2">
            <div className="text-[9px] text-ink-faint uppercase tracking-wider mb-0.5">Share of total</div>
            <div className="font-mono text-sm font-bold">{fmtShare(d.share)}</div>
          </div>
          {d.exportValue != null && (
            <div className="bg-surface-2 rounded-lg p-2">
              <div className="text-[9px] text-ink-faint uppercase tracking-wider mb-0.5">Export value</div>
              <div className="font-mono text-sm font-bold">{fmtUSD(d.exportValue)}</div>
            </div>
          )}
          {d.globalMarketShare != null && (
            <div className="bg-surface-2 rounded-lg p-2">
              <div className="text-[9px] text-ink-faint uppercase tracking-wider mb-0.5">World import share</div>
              <div className="font-mono text-sm font-bold">{fmtPct(d.globalMarketShare)}</div>
            </div>
          )}
        </div>
        {d.exportRca != null && (
          <div className={clsx('flex items-center justify-between text-xs border-t border-white/5 pt-2')}>
            <span className="text-ink-faint">Export RCA</span>
            <span className={clsx('font-mono font-semibold', d.exportRca >= 1 ? 'text-positive' : 'text-negative')}>
              {d.exportRca.toFixed(3)}
              <span className="ml-1 text-[10px] opacity-70">{d.exportRca >= 1 ? '(Competitive)' : '(Import-dependent)'}</span>
            </span>
          </div>
        )}
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
type SortKey = 'importValue' | 'exportValue' | 'pci' | 'exportRca';

export default function ImportsBasket() {
  const [year, setYear]     = useState(2024);
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [colorBy, setColorBy] = useState<'sector' | 'complexity'>('sector');
  const [search, setSearch]   = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('importValue');
  const [sortAsc, setSortAsc] = useState(false);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/atlas/canada-imports?year=${y}`);
      setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(year); }, [load, year]);

  const treemapData = useMemo(() => {
    if (!data?.products || !data.totalImports) return [];
    return data.products
      .filter((p: any) => (p.importValue ?? 0) >= 50_000_000)
      .map((p: any) => ({ ...p, size: p.importValue, share: (p.importValue / data.totalImports) * 100 }))
      .sort((a: any, b: any) => b.importValue - a.importValue)
      .slice(0, 100);
  }, [data]);

  const tableProducts = useMemo(() => {
    if (!data?.products) return [];
    let rows = data.products.map((p: any) => ({
      ...p, share: data.totalImports ? (p.importValue / data.totalImports) * 100 : null,
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

  const balanceTrend = useMemo(() => {
    if (!data?.eciHistory) return [];
    return data.eciHistory
      .filter((r: any) => r.year >= 2000)
      .map((r: any) => ({
        year: r.year,
        balance: r.exportValue && r.importValue ? +(((r.exportValue - r.importValue) / 1e9).toFixed(1)) : null,
        imports: r.importValue ? +(r.importValue / 1e9).toFixed(1) : null,
      }));
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
  const isDeficit = (data?.tradeBalance ?? 0) < 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <div className="w-9 h-9 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        <div className="text-xs text-ink-faint">Loading Harvard Atlas import data for {year}…</div>
      </div>
    );
  }
  if (!data || data.status === 'error') {
    return <div className="py-20 text-center text-sm text-negative">Failed to load import data from Harvard Atlas.</div>;
  }

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Canada Import Basket</h1>
          <p className="text-sm text-ink-muted max-w-xl">
            Import structure, product complexity (PCI) and trade balance.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-xs text-ink-faint font-medium">Year</label>
          <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))}
            className="bg-surface-2 border border-border text-sm rounded-lg px-3 py-1.5 text-ink focus:outline-none focus:border-accent">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Imports"   value={fmtUSD(data.totalImports)}       sub={`${year} merchandise`}  icon={Globe2} />
        <StatCard label="Trade Balance"   value={fmtUSD(data.tradeBalance)}        sub={isDeficit ? 'Trade deficit' : 'Trade surplus'} icon={isDeficit ? TrendingDown : TrendingUp} warn={isDeficit} />
        <StatCard label="ECI Score"       value={latestEci?.eci?.toFixed(3) ?? ''} sub="Economic Complexity Index" icon={BarChart2} />
        <StatCard label="Import-dependent" value={String(data.products?.filter((p: any) => (p.exportRca ?? 0) < 1 && p.importValue > 1e8).length ?? '')}
          sub="products with RCA < 1 & imports > $100M" icon={TrendingDown} />
      </div>

      {/* ── Treemap ─────────────────────────────────────────────────────────── */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div>
            <span className="text-sm font-semibold">Import Basket {year}</span>
            <span className="ml-2 text-xs text-ink-faint">Cell size = share of total imports · hover for details</span>
          </div>
          <div className="flex items-center gap-1 p-0.5 bg-surface-2 rounded-lg border border-border">
            {(['sector', 'complexity'] as const).map(opt => (
              <button key={opt} onClick={() => setColorBy(opt)}
                className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  colorBy === opt ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink')}>
                {opt === 'complexity' ? 'Complexity (PCI)' : 'Sector'}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[520px] bg-[#0d1014]">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap data={treemapData} dataKey="size" aspectRatio={16 / 9}
              content={<TreemapCell colorBy={colorBy} />}>
              <Tooltip content={<TreemapTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>

        {/* Sector legend / filter */}
        <div className="px-4 py-3 border-t border-border flex flex-wrap gap-2">
          <button onClick={() => setSectorFilter(null)}
            className={clsx('px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors',
              sectorFilter === null ? 'bg-accent/20 border-accent/40 text-accent' : 'border-border text-ink-faint hover:text-ink')}>
            All sectors
          </button>
          {activeSectors.map(([code, name]) => (
            <button key={code} onClick={() => setSectorFilter(sectorFilter === code ? null : code)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all"
              style={{
                borderColor: sectorFilter === code ? sectorColor(code) : 'rgba(255,255,255,0.08)',
                color: sectorFilter === code ? sectorColor(code) : '#9ca3af',
                background: sectorFilter === code ? sectorColor(code) + '18' : 'transparent',
              }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sectorColor(code) }} />
              {name}
            </button>
          ))}
        </div>

        {colorBy === 'complexity' && (
          <div className="px-4 py-2.5 border-t border-border flex flex-wrap items-center gap-4 text-[10px] text-ink-muted">
            <span className="font-medium text-ink-faint uppercase tracking-wider">PCI</span>
            {[{ label: 'Very High ≥1.5', color: '#10b981' }, { label: 'High 0.5–1.5', color: '#3b82f6' },
              { label: 'Medium −0.5–0.5', color: '#f59e0b' }, { label: 'Low <−0.5', color: '#ef4444' }]
              .map(({ label, color }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />{label}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* ── Products table ───────────────────────────────────────────────────── */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold">
            Imported Products
            {sectorFilter && <span className="ml-2 text-xs font-normal text-ink-faint">— {SECTOR_NAMES[sectorFilter]}</span>}
          </span>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input type="text" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)}
              className="bg-surface-2 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent w-52" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                {[
                  { label: 'HS92', key: null, cls: 'w-12' },
                  { label: 'Product', key: null, cls: '' },
                  { label: 'Sector', key: null, cls: 'hidden sm:table-cell' },
                  { label: 'Import Value', key: 'importValue' as SortKey, cls: 'text-right' },
                  { label: 'Share', key: null, cls: 'text-right hidden sm:table-cell' },
                  { label: 'Export Value', key: 'exportValue' as SortKey, cls: 'text-right hidden md:table-cell' },
                  { label: 'Export RCA', key: 'exportRca' as SortKey, cls: 'text-right' },
                  { label: 'PCI', key: 'pci' as SortKey, cls: 'text-right hidden lg:table-cell' },
                ].map(({ label, key, cls }) => (
                  <th key={label} onClick={() => key && handleSort(key)}
                    className={clsx('py-2.5 px-3 text-[10px] font-medium text-ink-faint uppercase tracking-wider',
                      cls, key ? 'cursor-pointer hover:text-ink select-none' : '')}>
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
                  <td className="py-2 px-3 text-right font-mono">{fmtUSD(p.importValue)}</td>
                  <td className="py-2 px-3 text-right font-mono text-ink-muted hidden sm:table-cell">
                    {p.share != null ? `${p.share.toFixed(2)}%` : ''}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-ink-muted hidden md:table-cell">{fmtUSD(p.exportValue)}</td>
                  <td className="py-2 px-3 text-right">
                    {p.exportRca != null
                      ? <span className={clsx('font-mono', p.exportRca >= 1 ? 'text-positive font-semibold' : 'text-negative')}>{p.exportRca.toFixed(2)}</span>
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
            <div className="text-center text-xs text-ink-faint py-3">Showing top 100 of {tableProducts.length} products.</div>
          )}
        </div>
      </div>

      {/* ── Trade balance trend ──────────────────────────────────────────────── */}
      <div className="bg-surface-1 border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-0.5">Trade Balance — Canada (2000–{year})</h2>
        <p className="text-xs text-ink-faint mb-4">Export value minus import value in USD billions · above zero = surplus</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={balanceTrend} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#5a6272' }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: '#5a6272' }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${v}B`} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
              <Tooltip content={({ active, payload, label }: any) => {
                if (!active || !payload?.length) return null;
                const bal = payload.find((p: any) => p.dataKey === 'balance');
                const imp = payload.find((p: any) => p.dataKey === 'imports');
                return (
                  <div className="bg-surface-2 border border-border rounded-lg px-3 py-2 shadow-lg text-xs space-y-1">
                    <div className="text-ink-muted font-medium">{label}</div>
                    {imp && <div className="font-mono text-ink">Imports: ${imp.value}B</div>}
                    {bal && <div className={clsx('font-mono', (bal.value ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
                      Balance: {(bal.value ?? 0) >= 0 ? '+' : ''}${bal.value}B
                    </div>}
                  </div>
                );
              }} />
              <Line type="monotone" dataKey="imports" stroke="#3bbcd4" strokeWidth={1.5} dot={false} name="Imports" connectNulls />
              <Line type="monotone" dataKey="balance" stroke="#F15A22" strokeWidth={2} dot={false} name="Balance" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px] text-ink-faint">
          <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-[#F15A22] inline-block" />Trade Balance</span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-0.5 bg-[#3bbcd4] inline-block" />Total Imports</span>
        </div>
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border text-[10px] text-ink-faint">
          <span className="live-dot" />
          <span>Source: Harvard Growth Lab — Atlas of Economic Complexity · atlas.hks.harvard.edu/api/graphql</span>
        </div>
      </div>
    </div>
  );
}
