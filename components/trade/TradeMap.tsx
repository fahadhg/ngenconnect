'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import clsx from 'clsx';

// react-simple-maps requires client-side only
const ComposableMap = dynamic(
  () => import('react-simple-maps').then(m => ({ default: m.ComposableMap })),
  { ssr: false }
);
const Geographies = dynamic(
  () => import('react-simple-maps').then(m => ({ default: m.Geographies })),
  { ssr: false }
);
const Geography = dynamic(
  () => import('react-simple-maps').then(m => ({ default: m.Geography })),
  { ssr: false }
);

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

// ISO numeric → ISO3 lookup for top trade partners
const NUM_TO_ISO3: Record<number, string> = {
  840: 'USA', 156: 'CHN', 484: 'MEX', 392: 'JPN', 276: 'DEU', 826: 'GBR',
  410: 'KOR', 250: 'FRA', 380: 'ITA', 356: 'IND', 76: 'BRA', 528: 'NLD',
  756: 'CHE', 36: 'AUS', 724: 'ESP', 458: 'MYS', 158: 'TWN', 56: 'BEL',
  752: 'SWE', 764: 'THA', 578: 'NOR', 704: 'VNM', 710: 'ZAF', 360: 'IDN',
  784: 'ARE', 682: 'SAU', 792: 'TUR', 616: 'POL', 152: 'CHL', 32: 'ARG',
  170: 'COL', 608: 'PHL', 203: 'CZE', 40: 'AUT', 208: 'DNK', 643: 'RUS',
  246: 'FIN', 620: 'PRT', 702: 'SGP', 348: 'HUN', 376: 'ISR', 554: 'NZL',
  300: 'GRC', 368: 'IRQ', 586: 'PAK', 818: 'EGY', 100: 'BGR', 642: 'ROU',
  804: 'UKR', 191: 'HRV', 398: 'KAZ', 12: 'DZA', 504: 'MAR', 604: 'PER',
  566: 'NGA', 50: 'BGD', 218: 'ECU', 320: 'GTM', 188: 'CRI', 384: 'CIV',
  414: 'KWT', 634: 'QAT', 512: 'OMN', 400: 'JOR', 144: 'LKA',
  104: 'MMR', 116: 'KHM', 344: 'HKG', 196: 'CYP',
  703: 'SVK', 705: 'SVN', 440: 'LTU', 428: 'LVA', 233: 'EST', 372: 'IRL',
  442: 'LUX', 352: 'ISL',
};

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

function getColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return '#d1fae5';
  const t = Math.log(value + 1) / Math.log(max + 1);
  // light green → dark blue (matching Atlas palette)
  const r = Math.round(209 - t * (209 - 30));
  const g = Math.round(250 - t * (250 - 58));
  const b = Math.round(229 - t * (229 - 138));
  return `rgb(${r},${g},${b})`;
}

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

  const handleMove = useCallback((geo: any, evt: React.MouseEvent) => {
    const iso3 = NUM_TO_ISO3[parseInt(geo.id)] ?? null;
    const value = iso3 ? (valueMap.get(iso3) ?? 0) : 0;
    if (value > 0) {
      setTooltip({ name: geo.properties.name ?? iso3, value, x: evt.clientX, y: evt.clientY });
    } else {
      setTooltip(null);
    }
  }, [valueMap]);

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
          <ComposableMap
            projectionConfig={{ scale: 140, center: [0, 20] }}
            style={{ width: '100%', height: 'auto' }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }: any) =>
                geographies.map((geo: any) => {
                  const numId = parseInt(geo.id);
                  const iso3 = NUM_TO_ISO3[numId];
                  const value = iso3 ? (valueMap.get(iso3) ?? 0) : 0;
                  const isCanada = iso3 === 'CAN';

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={isCanada ? '#FF6B35' : getColor(value, maxValue)}
                      stroke="#fff"
                      strokeWidth={0.3}
                      style={{
                        default: { outline: 'none' },
                        hover:   { outline: 'none', opacity: 0.85 },
                        pressed: { outline: 'none' },
                      }}
                      onMouseMove={(evt: React.MouseEvent) => handleMove(geo, evt)}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>

          {/* color scale */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] text-ink-muted">
            <span>$100K</span>
            <div className="w-32 h-2 rounded" style={{
              background: 'linear-gradient(to right, #d1fae5, #1e3a8a)',
            }} />
            <span>$1T</span>
          </div>

          {/* Canada highlight note */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[10px] text-ink-muted">
            <span className="w-3 h-2 rounded-sm inline-block bg-ngen-orange" />
            Canada (selected)
          </div>
        </div>
      )}

      {/* fixed tooltip */}
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
