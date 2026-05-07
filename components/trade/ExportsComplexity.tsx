'use client';

import { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, ReferenceLine, Cell,
} from 'recharts';
import { TrendingDown, Globe2, BarChart2, AlertTriangle } from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmtB = (v: number) => {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(0)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
};

function pciColor(pci: number): string {
  if (pci >= 1.5)  return '#10b981'; // emerald — very high
  if (pci >= 0.5)  return '#3b82f6'; // blue — high
  if (pci >= -0.2) return '#f59e0b'; // amber — medium
  return '#ef4444';                   // red — low / commodity
}

function pciLabel(pci: number): string {
  if (pci >= 1.5)  return 'Very High';
  if (pci >= 0.5)  return 'High';
  if (pci >= -0.2) return 'Medium';
  return 'Low';
}

function pciBadgeClass(pci: number): string {
  if (pci >= 1.5)  return 'bg-positive/10 text-positive border-positive/20';
  if (pci >= 0.5)  return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  if (pci >= -0.2) return 'bg-warn/10 text-warn border-warn/20';
  return 'bg-negative/10 text-negative border-negative/20';
}

// ─── sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, warn }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; warn?: boolean;
}) {
  return (
    <div className={clsx(
      'p-4 rounded-xl border flex flex-col gap-2',
      warn ? 'bg-negative/5 border-negative/20' : 'bg-surface-2 border-border'
    )}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-faint uppercase tracking-wider font-medium">{label}</span>
        <Icon className={clsx('w-4 h-4', warn ? 'text-negative' : 'text-ink-faint')} />
      </div>
      <div className={clsx('font-mono text-2xl font-bold', warn && 'text-negative')}>{value}</div>
      {sub && <div className="text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-4 mt-8 first:mt-0 flex items-center gap-2">
      <span className="w-3 h-px bg-accent/50 inline-block" />
      {children}
    </div>
  );
}

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
        active
          ? 'bg-accent text-white'
          : 'text-ink-muted hover:text-ink hover:bg-surface-2'
      )}
    >
      {children}
    </button>
  );
}

// ─── custom tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-2 border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <div className="text-ink-muted mb-1.5 font-medium">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-ink">{formatter ? formatter(p.value, p.name) : `${p.name}: ${p.value}`}</span>
        </div>
      ))}
    </div>
  );
}

// ─── TAB 1: Overview ─────────────────────────────────────────────────────────
function OverviewTab({ data }: { data: any }) {
  const destinations: any[] = data.topDestinations || [];

  return (
    <div>
      {/* US dependency warning */}
      {data.concentration?.usShare > 70 && (
        <div className="mb-6 p-3 rounded-lg border border-warn/30 bg-warn/5 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-warn mt-0.5 shrink-0" />
          <div className="text-xs text-ink-muted">
            <span className="font-semibold text-warn">High US concentration risk.</span>{' '}
            {data.concentration.usShare}% of Canadian exports go to the US — up from ~70% in 2010.
            IEEPA tariffs (25–50%) represent significant bilateral exposure.
          </div>
        </div>
      )}

      <SectionTitle>Top Export Destinations (2024, CAD)</SectionTitle>
      <div className="h-64 mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={destinations} layout="vertical" margin={{ left: 8, right: 32, top: 0, bottom: 0 }}>
            <XAxis
              type="number"
              tickFormatter={(v) => `$${(v / 1e9).toFixed(0)}B`}
              tick={{ fontSize: 10, fill: '#5a6272' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              type="category" dataKey="name" width={100}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<ChartTooltip formatter={(v: number) => fmtB(v)} />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {destinations.map((d: any) => (
                <Cell
                  key={d.country}
                  fill={d.country === 'US' ? '#F15A22' : d.hasFTA ? '#10b981' : '#5a6272'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-3 text-xs mb-6">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#F15A22]" />US (IEEPA-exposed)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-positive" />FTA partner</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ink-faint" />No FTA</span>
      </div>

      <SectionTitle>Destination Details</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['Country', 'Export Value', 'Share', 'FTA', 'US Tariff Risk'].map(h => (
                <th key={h} className="py-2 px-3 text-[10px] font-medium text-ink-faint uppercase tracking-wider text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {destinations.map((d: any) => (
              <tr key={d.country} className="border-b border-border hover:bg-surface-2 transition-colors">
                <td className="py-2 px-3 font-medium">{d.name}</td>
                <td className="py-2 px-3 font-mono">{fmtB(d.value)}</td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-surface-1 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(d.share * 1.2, 100)}%`,
                          background: d.country === 'US' ? '#F15A22' : '#10b981',
                        }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-ink-muted">{d.share}%</span>
                  </div>
                </td>
                <td className="py-2 px-3">
                  {d.hasFTA
                    ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-positive/10 text-positive border-positive/20">{d.ftaName}</span>
                    : <span className="text-ink-faint">—</span>
                  }
                </td>
                <td className="py-2 px-3">
                  {d.country === 'US'
                    ? <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-negative/10 text-negative border-negative/20">25–50% IEEPA</span>
                    : <span className="text-ink-faint text-[10px]">—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TAB 2: Complexity ────────────────────────────────────────────────────────
function ComplexityTab({ data }: { data: any }) {
  const trend: any[]  = data.eci?.trend  || [];
  const peers: any[]  = data.eci?.peers  || [];
  const products: any[] = data.topProducts || [];

  return (
    <div>
      {/* ECI overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="p-4 bg-surface-2 rounded-xl border border-border">
          <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">Canada ECI</div>
          <div className="font-mono text-2xl font-bold text-blue-400">{data.eci?.value?.toFixed(2)}</div>
          <div className="text-xs text-ink-muted mt-1">Harvard Atlas 2022</div>
        </div>
        <div className="p-4 bg-surface-2 rounded-xl border border-border">
          <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">Global Rank</div>
          <div className="font-mono text-2xl font-bold">#{data.eci?.rank}</div>
          <div className="text-xs text-ink-muted mt-1">of ~130 countries</div>
        </div>
        <div className="col-span-2 sm:col-span-1 p-4 bg-surface-2 rounded-xl border border-border">
          <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">ECI Trend</div>
          <div className="font-mono text-2xl font-bold text-negative">
            {((data.eci?.trend?.at(-1)?.eci ?? 0) - (data.eci?.trend?.at(0)?.eci ?? 0)).toFixed(2)}
          </div>
          <div className="text-xs text-ink-muted mt-1">Change 2012–2022</div>
        </div>
      </div>

      <SectionTitle>ECI Trend — Canada (2012–2022)</SectionTitle>
      <div className="h-52 mb-8">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#5a6272' }} axisLine={false} tickLine={false} />
            <YAxis domain={[0.8, 1.7]} tick={{ fontSize: 10, fill: '#5a6272' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip formatter={(v: number, n: string) => `ECI: ${v.toFixed(2)}`} />} />
            <Line
              type="monotone" dataKey="eci" stroke="#3b82f6"
              strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <SectionTitle>Peer Comparison — ECI 2022</SectionTitle>
      <div className="h-64 mb-8">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={peers} margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="country" tick={{ fontSize: 10, fill: '#5a6272' }} axisLine={false} tickLine={false} />
            <YAxis domain={[-2, 2.5]} tick={{ fontSize: 10, fill: '#5a6272' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip formatter={(v: number) => `ECI: ${v.toFixed(2)}`} />} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
            <Bar dataKey="eci" radius={[3, 3, 0, 0]}>
              {peers.map((p: any) => (
                <Cell
                  key={p.iso2}
                  fill={p.iso2 === 'CA' ? '#F15A22' : p.eci >= 1.0 ? '#3b82f6' : p.eci >= 0 ? '#f59e0b' : '#ef4444'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <SectionTitle>Top Export Products by Complexity (PCI)</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['HS', 'Product', 'Export Value', 'Share', 'PCI Score', 'Complexity'].map(h => (
                <th key={h} className="py-2 px-3 text-[10px] font-medium text-ink-faint uppercase tracking-wider text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...products].sort((a, b) => b.pci - a.pci).map((p: any) => (
              <tr key={p.hs2} className="border-b border-border hover:bg-surface-2 transition-colors">
                <td className="py-2 px-3 font-mono text-ink-faint">{p.hs2}</td>
                <td className="py-2 px-3 font-medium">{p.label}</td>
                <td className="py-2 px-3 font-mono">{fmtB(p.exportValue)}</td>
                <td className="py-2 px-3 font-mono text-ink-muted">{p.share}%</td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-surface-1 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(((p.pci + 1) / 3.5) * 100, 100)}%`,
                          background: pciColor(p.pci),
                        }}
                      />
                    </div>
                    <span className="font-mono text-[10px]" style={{ color: pciColor(p.pci) }}>
                      {p.pci > 0 ? '+' : ''}{p.pci.toFixed(2)}
                    </span>
                  </div>
                </td>
                <td className="py-2 px-3">
                  <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full border', pciBadgeClass(p.pci))}>
                    {pciLabel(p.pci)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-3 rounded-lg bg-surface-2 border border-border text-xs text-ink-muted">
        <span className="font-semibold text-ink">PCI (Product Complexity Index)</span> measures how
        sophisticated a product is, based on the diversity and ubiquity of the countries that export it.
        Higher PCI = more complex know-how embedded. Canada's export basket is pulled down by large
        commodity volumes (energy, ores, ag), despite having capacity in high-PCI sectors.
      </div>
    </div>
  );
}

// ─── TAB 3: Diversification ───────────────────────────────────────────────────
function DiversificationTab({ data }: { data: any }) {
  const products: any[] = data.topProducts || [];
  const highPci = products.filter((p: any) => p.pci >= 0.5).sort((a, b) => b.pci - a.pci);
  const commodities = products.filter((p: any) => p.pci < 0.5).sort((a, b) => b.exportValue - a.exportValue);

  return (
    <div>
      <div className="mb-6 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
        <div className="text-sm font-semibold text-blue-400 mb-1.5">Diversification Context</div>
        <p className="text-xs text-ink-muted leading-relaxed">
          Canada's HHI concentration index is <span className="font-mono text-ink">{data.concentration?.hhi}</span> —
          significantly above the OECD average of ~0.15. With{' '}
          <span className="font-semibold text-ink">{data.concentration?.usShare}%</span> of exports
          going to the US and IEEPA tariffs now at 25–50%, the Atlas framework identifies
          high-complexity sectors with latent capability as natural diversification targets.
        </p>
      </div>

      <SectionTitle>High-Complexity Exports — Diversification Levers</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-3 mb-8">
        {highPci.map((p: any) => (
          <div key={p.hs2} className="p-4 bg-surface-2 rounded-xl border border-border">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="text-sm font-semibold">{p.label}</div>
                <div className="text-xs text-ink-faint font-mono">HS {p.hs2}</div>
              </div>
              <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full border', pciBadgeClass(p.pci))}>
                PCI {p.pci > 0 ? '+' : ''}{p.pci.toFixed(2)}
              </span>
            </div>
            <div className="flex items-end justify-between mt-3">
              <div>
                <div className="text-[10px] text-ink-faint">2024 exports</div>
                <div className="font-mono text-base font-bold">{fmtB(p.exportValue)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-ink-faint">Share of total</div>
                <div className="font-mono text-base">{p.share}%</div>
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-surface-1 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(p.share * 5, 100)}%`, background: pciColor(p.pci) }}
              />
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Commodity-Heavy Exports — Complexity Drag</SectionTitle>
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              {['Product', 'Export Value', 'Share', 'PCI', 'Issue'].map(h => (
                <th key={h} className="py-2 px-3 text-[10px] font-medium text-ink-faint uppercase tracking-wider text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {commodities.map((p: any) => (
              <tr key={p.hs2} className="border-b border-border hover:bg-surface-2 transition-colors">
                <td className="py-2 px-3 font-medium">{p.label}</td>
                <td className="py-2 px-3 font-mono">{fmtB(p.exportValue)}</td>
                <td className="py-2 px-3 font-mono text-ink-muted">{p.share}%</td>
                <td className="py-2 px-3 font-mono" style={{ color: pciColor(p.pci) }}>
                  {p.pci > 0 ? '+' : ''}{p.pci.toFixed(2)}
                </td>
                <td className="py-2 px-3 text-ink-faint">Low value-add; price-taker</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>Opportunity Matrix</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-positive/20 bg-positive/5">
          <div className="text-xs font-semibold text-positive mb-2">Near-term: Existing Capability</div>
          <ul className="space-y-1.5 text-xs text-ink-muted">
            <li className="flex items-start gap-2"><span className="text-positive mt-0.5">→</span>Scale aerospace (HS 88, PCI +2.14) into CPTPP markets</li>
            <li className="flex items-start gap-2"><span className="text-positive mt-0.5">→</span>Expand machinery (HS 84, PCI +1.78) under CETA to EU</li>
            <li className="flex items-start gap-2"><span className="text-positive mt-0.5">→</span>Grow pharma (HS 30, PCI +1.54) into Japan/Korea</li>
          </ul>
        </div>
        <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
          <div className="text-xs font-semibold text-blue-400 mb-2">Medium-term: Upgrade Pathway</div>
          <ul className="space-y-1.5 text-xs text-ink-muted">
            <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">→</span>Move from raw aluminum (HS 76) to advanced alloys / EVs</li>
            <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">→</span>Convert steel (HS 72) capacity to specialty/AHSS grades</li>
            <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">→</span>Process critical minerals domestically before export</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ExportsComplexity() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'complexity' | 'diversification'>('overview');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [exRes, cxRes] = await Promise.all([
        fetch('/api/statcan/exports'),
        fetch('/api/complexity'),
      ]);
      const exports = await exRes.json();
      const complexity = await cxRes.json();
      setData({ ...complexity, topDestinations: exports.topDestinations });
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-xs text-ink-faint">
        Loading exports & complexity data…
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 stagger">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Canada Exports & Economic Complexity</h1>
        <p className="text-sm text-ink-muted">
          Export market concentration, product complexity (PCI), and Economic Complexity Index (ECI)
          sourced from Statistics Canada and the Harvard Atlas.
        </p>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Total Exports"
          value={fmtB(data.totalExports)}
          sub="2024 merchandise"
          icon={Globe2}
        />
        <StatCard
          label="ECI Score"
          value={data.eci?.value?.toFixed(2)}
          sub={`Rank #${data.eci?.rank} globally`}
          icon={BarChart2}
        />
        <StatCard
          label="US Dependency"
          value={`${data.concentration?.usShare}%`}
          sub="of total exports"
          icon={TrendingDown}
          warn={data.concentration?.usShare > 70}
        />
        <StatCard
          label="FTA Coverage"
          value={`${data.concentration?.ftaShare}%`}
          sub="exports under FTA"
          icon={Globe2}
        />
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-border pb-3">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</TabBtn>
        <TabBtn active={tab === 'complexity'} onClick={() => setTab('complexity')}>Complexity</TabBtn>
        <TabBtn active={tab === 'diversification'} onClick={() => setTab('diversification')}>Diversification</TabBtn>
      </div>

      {/* Tab content */}
      {tab === 'overview'       && <OverviewTab data={data} />}
      {tab === 'complexity'     && <ComplexityTab data={data} />}
      {tab === 'diversification' && <DiversificationTab data={data} />}

      {/* Data banner */}
      <div className="flex items-center gap-2 text-xs text-ink-faint mt-10 pt-4 border-t border-border">
        <span className="live-dot" />
        <span>{data.source}</span>
        <span className="text-ink-muted">·</span>
        <span>Data period: {data.generated}</span>
      </div>
    </div>
  );
}
