'use client';

import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';

const SECTOR_COLORS: Record<string, string> = {
  '0': '#e8b84b', '1': '#5aaa3c', '2': '#999999', '3': '#c4a35a',
  '4': '#cc6633', '5': '#cc2936', '6': '#7c4dbd', '7': '#3d85c8',
  '8': '#3bbcd4', '9': '#888888',
};

interface Product {
  productId: string;
  name: string;
  hs: string;
  sector: string;
  sectorCode: string;
  distanceDiamonds: number;
  opportunityDiamonds: number;
  complexityDiamonds: number;
  globalSize: number;
  globalGrowthPct: number | null;
  importValue: number;
  pci: number;
}

interface OppData {
  opportunities: Product[];
  totalGlobalSize: number;
  year: number;
}

const fmtUSD = (v: number) => {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
};

function Diamonds({ filled, total = 5 }: { filled: number; total?: number }) {
  return (
    <span className="flex gap-0.5 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="text-[10px]"
          style={{ color: i < filled ? '#374151' : '#d1d5db' }}
        >
          ◆
        </span>
      ))}
    </span>
  );
}

function ColTooltip({ label, definition }: { label: string; definition: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative inline-flex items-center gap-1 cursor-default"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="border-b border-dotted border-current">{label}</span>
      <Info size={10} className="opacity-60" />
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-60 bg-gray-900 text-white text-[11px] leading-snug rounded-lg px-3 py-2 shadow-xl z-50 pointer-events-none font-normal normal-case tracking-normal">
          {definition}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
        </div>
      )}
    </div>
  );
}

const COL_DEFS = {
  distance: "A country's ability to enter in to a new product, measured from 0 to 1. A 'nearby' product (closer to 0) requires related capabilities to existing products, offering a greater likelihood of success.",
  opportunity: "Measures opportunities for future diversification in entering a product, by opening new links to complex products.",
  complexity: "Measures the amount of diversity of knowhow required to make a product.",
};

export default function GrowthOpportunity() {
  const [data, setData] = useState<OppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<'opportunity' | 'distance' | 'complexity' | 'size' | 'growth'>('opportunity');

  useEffect(() => {
    fetch('/api/atlas/growth-opportunity')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="h-72 flex items-center justify-center text-ink-muted text-sm">Loading growth opportunities…</div>;
  if (error || !data || !data.opportunities) return <div className="h-72 flex items-center justify-center text-negative text-sm">Failed to load data</div>;

  const sorted = [...data.opportunities].sort((a, b) => {
    if (sort === 'opportunity') return b.opportunityDiamonds - a.opportunityDiamonds || b.globalSize - a.globalSize;
    if (sort === 'distance')   return b.distanceDiamonds - a.distanceDiamonds;
    if (sort === 'complexity') return b.complexityDiamonds - a.complexityDiamonds;
    if (sort === 'size')       return b.globalSize - a.globalSize;
    if (sort === 'growth')     return (b.globalGrowthPct ?? -999) - (a.globalGrowthPct ?? -999);
    return 0;
  });

  function SortTh({ col, align = 'center', children }: { col: typeof sort; align?: string; children: React.ReactNode }) {
    return (
      <th
        className={clsx('py-2 px-3 font-semibold cursor-pointer select-none', `text-${align}`, sort === col ? 'text-accent' : 'text-ink-muted')}
        onClick={() => setSort(col)}
      >
        <span className="inline-flex items-center gap-0.5">{children} ↕</span>
      </th>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-ink-muted">Products Canada doesn&apos;t yet export competitively (RCA &lt; 1)</div>
          <div className="font-semibold text-ink">
            Total Value: <span className="text-accent font-mono">{fmtUSD(data.totalGlobalSize)} USD</span>
            <span className="text-xs text-ink-faint ml-2">({sorted.length} products)</span>
          </div>
        </div>
        <div className="text-xs text-ink-faint">{data.year}</div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <div className="overflow-y-auto max-h-[600px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-surface-2">
              <th className="py-2 px-3 text-left font-semibold text-ink-muted">PRODUCT NAME</th>
              <SortTh col="distance">
                <ColTooltip label='"NEARBY" DIST.' definition={COL_DEFS.distance} />
              </SortTh>
              <SortTh col="opportunity">
                <ColTooltip label="OPP. GAIN" definition={COL_DEFS.opportunity} />
              </SortTh>
              <SortTh col="complexity">
                <ColTooltip label="COMPLEXITY" definition={COL_DEFS.complexity} />
              </SortTh>
              <SortTh col="size" align="right">
                GLOBAL SIZE
              </SortTh>
              <SortTh col="growth" align="right">
                GLOBAL GROWTH 5 YR
              </SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.productId} className="border-b border-border hover:bg-surface-2 transition-colors">
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-1.5 shrink-0 self-stretch rounded-full"
                      style={{ background: SECTOR_COLORS[p.sectorCode] ?? '#888' }}
                    />
                    <div>
                      <div className="font-medium text-ink">{p.name}</div>
                      <div className="text-[10px] text-ink-faint font-mono">{p.hs} HS</div>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <Diamonds filled={p.distanceDiamonds} />
                </td>
                <td className="py-2.5 px-3 text-center">
                  <Diamonds filled={p.opportunityDiamonds} />
                </td>
                <td className="py-2.5 px-3 text-center">
                  <Diamonds filled={p.complexityDiamonds} />
                </td>
                <td className="py-2.5 px-3 text-right font-mono">{fmtUSD(p.globalSize)}</td>
                <td className="py-2.5 px-3 text-right font-mono">
                  {p.globalGrowthPct != null ? (
                    <span className={clsx('flex items-center justify-end gap-1', p.globalGrowthPct >= 0 ? 'text-positive' : 'text-negative')}>
                      {p.globalGrowthPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {Math.abs(p.globalGrowthPct)}%
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        </div>
      </div>

      {/* sector legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-ink-muted">
        <span className="uppercase tracking-wide font-medium">Product Sectors</span>
        {[
          { code: '1', name: 'Agriculture' }, { code: '0', name: 'Textiles' },
          { code: '2', name: 'Stone' }, { code: '3', name: 'Minerals' },
          { code: '4', name: 'Metals' }, { code: '5', name: 'Chemicals' },
          { code: '6', name: 'Vehicles' }, { code: '7', name: 'Machinery' },
          { code: '8', name: 'Electronics' }, { code: '9', name: 'Other' },
        ].map(s => (
          <span key={s.code} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ background: SECTOR_COLORS[s.code] }} />
            {s.name.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
