'use client';

import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { TrendingUp, TrendingDown } from 'lucide-react';

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
    <span className="flex gap-0.5">
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

export default function GrowthOpportunity() {
  const [data, setData] = useState<OppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<'opportunity' | 'complexity' | 'size' | 'growth'>('opportunity');

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
    if (sort === 'complexity') return b.complexityDiamonds - a.complexityDiamonds;
    if (sort === 'size') return b.globalSize - a.globalSize;
    if (sort === 'growth') return (b.globalGrowthPct ?? -999) - (a.globalGrowthPct ?? -999);
    return 0;
  });

  const COLS = [
    { key: 'opportunity' as const, label: '"Nearby" Distance · Opportunity Gain' },
    { key: 'complexity' as const, label: 'Product Complexity' },
    { key: 'size' as const, label: 'Global Size (USD)' },
    { key: 'growth' as const, label: 'Global Growth 5 YR' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-ink-muted">Products Canada doesn't yet export competitively (RCA &lt; 1)</div>
          <div className="font-semibold text-ink">
            Total Value: <span className="text-accent font-mono">{fmtUSD(data.totalGlobalSize)} USD</span>
          </div>
        </div>
        <div className="text-xs text-ink-faint">{data.year}</div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="py-2 px-3 text-left font-semibold text-ink-muted">PRODUCT NAME</th>
              <th
                className={clsx('py-2 px-3 text-center font-semibold cursor-pointer select-none', sort === 'opportunity' ? 'text-accent' : 'text-ink-muted')}
                onClick={() => setSort('opportunity')}
              >
                "NEARBY" DIST. ↕ OPP. GAIN
              </th>
              <th
                className={clsx('py-2 px-3 text-center font-semibold cursor-pointer select-none', sort === 'complexity' ? 'text-accent' : 'text-ink-muted')}
                onClick={() => setSort('complexity')}
              >
                COMPLEXITY ↕
              </th>
              <th
                className={clsx('py-2 px-3 text-right font-semibold cursor-pointer select-none', sort === 'size' ? 'text-accent' : 'text-ink-muted')}
                onClick={() => setSort('size')}
              >
                GLOBAL SIZE ↕
              </th>
              <th
                className={clsx('py-2 px-3 text-right font-semibold cursor-pointer select-none', sort === 'growth' ? 'text-accent' : 'text-ink-muted')}
                onClick={() => setSort('growth')}
              >
                GLOBAL GROWTH 5 YR ↕
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 20).map(p => (
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
                <td className="py-2.5 px-3">
                  <div className="flex flex-col items-center gap-1">
                    <Diamonds filled={p.distanceDiamonds} />
                    <Diamonds filled={p.opportunityDiamonds} />
                  </div>
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
