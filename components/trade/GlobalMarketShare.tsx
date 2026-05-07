'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

interface SectorSeries {
  code: string;
  name: string;
  color: string;
  data: { year: number; share: number }[];
}

interface ShareData {
  years: number[];
  sectors: SectorSeries[];
  largestSector: string;
  largestShare: number;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md p-3 text-xs">
      <div className="font-semibold text-gray-700 mb-1">{label}</div>
      {payload
        .filter((p: any) => p.value > 0)
        .sort((a: any, b: any) => b.value - a.value)
        .slice(0, 6)
        .map((p: any) => (
          <div key={p.dataKey} className="flex justify-between gap-4">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="font-mono font-semibold">{p.value.toFixed(2)}%</span>
          </div>
        ))}
    </div>
  );
}

export default function GlobalMarketShare() {
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/atlas/global-share')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const toggleSector = (code: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  if (loading) return <div className="h-72 flex items-center justify-center text-ink-muted text-sm">Loading global market share data…</div>;
  if (error || !data) return <div className="h-72 flex items-center justify-center text-negative text-sm">Failed to load data</div>;

  // flatten to recharts format: [{ year, Vehicles: 8.2, Machinery: 3.1, ... }]
  const chartData = data.years.map(y => {
    const row: Record<string, any> = { year: y };
    for (const s of data.sectors) {
      if (!hidden.has(s.code)) {
        row[s.name] = s.data.find(d => d.year === y)?.share ?? 0;
      }
    }
    return row;
  });

  // find trending sector (biggest 5yr change)
  const latestIdx = data.years.length - 1;
  const prev5Idx = Math.max(0, latestIdx - 5);
  const trending = data.sectors.reduce((best, s) => {
    const diff = (s.data[latestIdx]?.share ?? 0) - (s.data[prev5Idx]?.share ?? 0);
    const bestDiff = (best.data[latestIdx]?.share ?? 0) - (best.data[prev5Idx]?.share ?? 0);
    return diff > bestDiff ? s : best;
  });

  const latestYear = data.years[latestIdx];

  return (
    <div>
      {/* header bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs text-ink-muted">
        <span className="font-semibold text-ink">Largest Market Share</span>
        <span className="font-semibold text-accent">{data.largestSector}</span>
        <span className="border-l border-border pl-3">Share of Global Trade</span>
        <span className="font-semibold text-ink">{data.largestShare.toFixed(2)}%</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* narrative panel */}
        <div className="text-sm text-ink space-y-3">
          <div className="text-xs uppercase tracking-wide text-accent font-semibold">↑ Export Growth Dynamics</div>
          <h3 className="text-lg font-bold font-display text-ink">Growth in Global Market Share</h3>
          <p className="text-ink-muted leading-relaxed">
            Canada's largest export sector by global share is <strong>{data.largestSector}</strong> at{' '}
            <strong>{data.largestShare.toFixed(2)}%</strong> of world trade in {latestYear}.
          </p>
          <p className="text-ink-muted leading-relaxed">
            Over the past 5 years, <strong>{trending.name}</strong> has shown the strongest positive
            trend in global market share, suggesting growing competitive advantage in this sector.
          </p>
          <div className="text-xs uppercase tracking-wide text-accent font-semibold mt-4">↓ Diversification into New Products</div>
        </div>

        {/* chart */}
        <div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false} axisLine={false}
                />
                <YAxis
                  tickFormatter={v => `${v}%`}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickLine={false} axisLine={false}
                  label={{ value: 'Share of World Market by Sector', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#9ca3af' }, offset: 12 }}
                />
                <Tooltip content={<CustomTooltip />} />
                {data.sectors
                  .filter(s => !hidden.has(s.code))
                  .map(s => (
                    <Line
                      key={s.code}
                      type="monotone"
                      dataKey={s.name}
                      stroke={s.color}
                      strokeWidth={1.5}
                      dot={{ r: 2, fill: s.color }}
                      activeDot={{ r: 4 }}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* sector toggles */}
          <div className="flex flex-wrap gap-2 mt-3">
            {data.sectors.map(s => (
              <button
                key={s.code}
                onClick={() => toggleSector(s.code)}
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-all"
                style={{
                  borderColor: hidden.has(s.code) ? '#e5e7eb' : s.color,
                  color: hidden.has(s.code) ? '#9ca3af' : s.color,
                  background: hidden.has(s.code) ? 'transparent' : `${s.color}12`,
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: hidden.has(s.code) ? '#d1d5db' : s.color }} />
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
