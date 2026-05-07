'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

const CANADA_LAT = 56;
const CANADA_LNG = -96;
const EXPORT_COLOR = '#F15A22';
const IMPORT_COLOR = '#3bbcd4';

const fmtUSD = (v: number) => {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
};

type Partner = {
  name: string; iso3: string;
  lat: number; lng: number;
  exportValue: number; importValue: number; totalTrade: number;
};
type Mode = 'both' | 'exports' | 'imports';

export default function TradeGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef     = useRef<any>(null);
  const [width, setWidth]       = useState(800);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading]   = useState(true);
  const [mode, setMode]         = useState<Mode>('both');

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      setWidth(entries[0].contentRect.width || 800);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/atlas/trade-partners?year=2022');
      const json = await res.json();
      if (json.status === 'ok') setPartners(json.partners);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Point globe at Canada after data loads
  useEffect(() => {
    if (globeRef.current && partners.length) {
      setTimeout(() => {
        globeRef.current?.pointOfView({ lat: CANADA_LAT, lng: CANADA_LNG - 20, altitude: 1.8 }, 800);
      }, 500);
    }
  }, [partners]);

  const maxTrade = Math.max(...partners.map(p => p.totalTrade), 1);

  // Arcs — animated dashed lines
  const arcs = partners.flatMap(p => {
    const out: any[] = [];
    if (mode !== 'imports' && p.exportValue > 0) {
      out.push({
        startLat: CANADA_LAT, startLng: CANADA_LNG,
        endLat: p.lat, endLng: p.lng,
        color: [EXPORT_COLOR, EXPORT_COLOR + '44'],
        stroke: Math.max(0.5, (p.exportValue / maxTrade) * 5),
        label: `Exports to ${p.name}: ${fmtUSD(p.exportValue)}`,
      });
    }
    if (mode !== 'exports' && p.importValue > 0) {
      out.push({
        startLat: p.lat, startLng: p.lng,
        endLat: CANADA_LAT, endLng: CANADA_LNG,
        color: [IMPORT_COLOR, IMPORT_COLOR + '44'],
        stroke: Math.max(0.5, (p.importValue / maxTrade) * 5),
        label: `Imports from ${p.name}: ${fmtUSD(p.importValue)}`,
      });
    }
    return out;
  });

  // Partner country dots
  const partnerPoints = partners.map(p => ({
    lat: p.lat, lng: p.lng,
    size: Math.max(0.4, (p.totalTrade / maxTrade) * 1.0) + 0.15,
    color: p.exportValue >= p.importValue ? EXPORT_COLOR : IMPORT_COLOR,
    name: p.name,
    exportValue: p.exportValue,
    importValue: p.importValue,
  }));

  // Canada dot
  const canadaPoint = {
    lat: CANADA_LAT, lng: CANADA_LNG,
    size: 0.7, color: '#ffffff',
    name: 'Canada',
    exportValue: partners.reduce((s, p) => s + p.exportValue, 0),
    importValue: partners.reduce((s, p) => s + p.importValue, 0),
  };

  const allPoints = [canadaPoint, ...partnerPoints];

  const pointLabel = (d: any) => `
    <div style="background:#0f1318;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:10px 14px;font-size:12px;color:#e2e8f0;line-height:1.6;min-width:160px">
      <div style="font-weight:700;margin-bottom:4px">${d.name}</div>
      <div style="color:${EXPORT_COLOR}">▶ Exports: ${fmtUSD(d.exportValue)}</div>
      <div style="color:${IMPORT_COLOR}">◀ Imports: ${fmtUSD(d.importValue)}</div>
    </div>`;

  return (
    <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold">Canada Trade Globe</h2>
          <p className="text-xs text-ink-faint mt-0.5">
            Bilateral trade flows · 2022 · {partners.length} partners
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-[10px] text-ink-faint">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-[2px] rounded bg-[#F15A22] inline-block" />Exports
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-[2px] rounded bg-[#3bbcd4] inline-block" />Imports
            </span>
          </div>
          <div className="flex items-center gap-0.5 p-0.5 bg-surface-2 rounded-lg border border-border">
            {(['both', 'exports', 'imports'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-medium transition-colors capitalize ${
                  mode === m ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
                }`}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Globe container */}
      <div ref={containerRef} className="relative bg-[#050911]" style={{ height: 500 }}>
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <div className="text-xs text-ink-faint">Loading trade data…</div>
          </div>
        ) : (
          <Globe
            ref={globeRef}
            width={width}
            height={500}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
            atmosphereColor="#1e3a5f"
            atmosphereAltitude={0.18}
            // Arcs
            arcsData={arcs}
            arcStartLat="startLat"
            arcStartLng="startLng"
            arcEndLat="endLat"
            arcEndLng="endLng"
            arcColor="color"
            arcStroke="stroke"
            arcDashLength={0.5}
            arcDashGap={0.25}
            arcDashAnimateTime={1800}
            arcAltitudeAutoScale={0.3}
            // Points
            pointsData={allPoints}
            pointLat="lat"
            pointLng="lng"
            pointRadius="size"
            pointColor="color"
            pointAltitude={0.01}
            pointLabel={pointLabel}
            pointsMerge={false}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border flex items-center justify-between text-[10px] text-ink-faint">
        <span>Drag to rotate · scroll to zoom · hover dots for details</span>
        <span>Source: Harvard Atlas of Economic Complexity</span>
      </div>
    </div>
  );
}
