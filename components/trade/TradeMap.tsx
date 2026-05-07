'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import clsx from 'clsx';

const TradeMapInner = dynamic(() => import('./TradeMapInner'), { ssr: false });

interface Partner {
  iso3: string;
  exportValue: number;
  importValue: number;
}

const fmtUSD = (v: number) => {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
};

export default function TradeMap() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'export' | 'import'>('export');
  const [tooltip, setTooltip] = useState<{ name: string; value: number; x: number; y: number } | null>(null);
  const [year] = useState(2022);

  useEffect(() => {
    fetch(`/api/atlas/trade-partners?year=${year}`)
      .then(r => r.json())
      .then(d => { setPartners(d.partners ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [year]);

  const valueMap = new Map<string, number>();
  for (const p of partners) {
    valueMap.set(p.iso3, mode === 'export' ? p.exportValue : p.importValue);
  }

  const maxValue = Math.max(...Array.from(valueMap.values()));

  const total = partners.reduce(
    (s, p) => s + (mode === 'export' ? p.exportValue : p.importValue), 0
  );

  const handleMove = useCallback((name: string, value: number, x: number, y: number) => {
    if (value > 0) {
      setTooltip({ name, value, x, y });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleLeave = useCallback(() => setTooltip(null), []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-ink-muted">
            {mode === 'export' ? `Where did Canada export to in ${year}?` : `Where did Canada import from in ${year}?`}
          </div>
          <div className="font-semibold text-ink">
            Total Value: <span className="text-accent font-mono">{fmtUSD(total)} USD</span>
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
              {m === 'export' ? 'Exporter' : 'Importer'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-72 flex items-center justify-center text-ink-muted text-sm">Loading trade map…</div>
      ) : (
        <div className="relative rounded-xl overflow-hidden border border-border bg-surface-1">
          <TradeMapInner
            valueMap={valueMap}
            maxValue={maxValue}
            onMove={handleMove}
            onLeave={handleLeave}
          />

          <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] text-ink-muted">
            <span>$100K</span>
            <div className="w-32 h-2 rounded" style={{
              background: 'linear-gradient(to right, #d1fae5, #1e3a8a)',
            }} />
            <span>$1T</span>
          </div>

          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[10px] text-ink-muted">
            <span className="w-3 h-2 rounded-sm inline-block bg-ngen-orange" />
            Canada (selected)
          </div>
        </div>
      )}

      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs rounded px-2.5 py-1.5 pointer-events-none shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 28 }}
        >
          <div className="font-semibold">{tooltip.name}</div>
          <div className="font-mono text-gray-300">{mode === 'export' ? 'Exports' : 'Imports'}: {fmtUSD(tooltip.value)}</div>
        </div>
      )}
    </div>
  );
}
