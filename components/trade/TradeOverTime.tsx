'use client';

import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import clsx from 'clsx';

interface RegionSeries {
  name: string;
  color: string;
  data: { year: number; value: number }[];
}

interface HistoryData {
  years: number[];
  regions: RegionSeries[];
  total: number;
  latestYear: number;
}

const fmtB = (v: number) => {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(0)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
};

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md p-3 text-xs">
      <div className="font-semibold text-gray-700 mb-2">{label}</div>
      {[...payload].reverse().map((p: any) => (
        <div key={p.name} className="flex justify-between gap-4 mb-0.5">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono">{fmtB(p.value)}</span>
        </div>
      ))}
      <div className="border-t border-gray-100 mt-1 pt-1 flex justify-between font-semibold">
        <span>Total</span>
        <span className="font-mono">{fmtB(total)}</span>
      </div>
    </div>
  );
}

export default function TradeOverTime() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'export' | 'import'>('export');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/atlas/trade-history?mode=${mode}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [mode]);

  if (loading) return <div className="h-80 flex items-center justify-center text-ink-muted text-sm">Loading trade history…</div>;
  if (error || !data) return <div className="h-80 flex items-center justify-center text-negative text-sm">Failed to load data</div>;

  const chartData = data.years.map(y => {
    const row: Record<string, any> = { year: y };
    for (const r of data.regions) row[r.name] = r.data.find(d => d.year === y)?.value ?? 0;
    return row;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-ink-muted">
            {mode === 'export' ? 'Who imported from Canada' : 'Where Canada imported from'}, 1995–{data.latestYear}
          </div>
          <div className="font-semibold text-ink">
            Total Value ({data.latestYear}): <span className="text-accent font-mono">{fmtB(data.total)} USD</span>
          </div>
        </div>
        <div className="flex gap-1 bg-surface-2 rounded-lg p-0.5">
          {(['export', 'import'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={clsx(
                'px-3 py-1 text-xs rounded-md font-medium transition-all',
                mode === m ? 'bg-white shadow-sm text-ink' : 'text-ink-muted hover:text-ink'
              )}
            >
              {m === 'export' ? 'Exports' : 'Imports'}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false} axisLine={false}
            />
            <YAxis
              tickFormatter={v => fmtB(v)}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false} axisLine={false}
              label={{ value: `Current Gross ${mode === 'export' ? 'Exports' : 'Imports'}`, angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#9ca3af' }, offset: 14 }}
            />
            <Tooltip content={<CustomTooltip />} />
            {data.regions.map(r => (
              <Area
                key={r.name}
                type="monotone"
                dataKey={r.name}
                stackId="1"
                stroke={r.color}
                fill={r.color}
                fillOpacity={0.85}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs">
        <span className="text-ink-faint font-medium uppercase tracking-wide">Regions</span>
        {data.regions.map(r => (
          <span key={r.name} className="flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm inline-block" style={{ background: r.color }} />
            {r.name.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
