'use client';

import { useMemo, useRef } from 'react';
import { TariffItem, ImportOverlay, CHAPTER_NAMES, getHS6, getBestFTA, fmtVal, FTA_LABELS } from '@/lib/trade/data';

interface Props {
  tariffData: TariffItem[];
  importData: ImportOverlay;
  watchlist: string[];
}

export default function ReportGenerator({ tariffData, importData, watchlist }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);

  const wlItems = useMemo(() =>
    watchlist.map(h => tariffData.find(r => r.h === h)).filter(Boolean) as TariffItem[]
  , [watchlist, tariffData]);

  const data = useMemo(() => {
    const dutiable = wlItems.filter(r => r.m > 0);
    const free = wlItems.filter(r => r.m === 0);
    let totalImp = 0, totalDuty = 0, totalSaveable = 0;

    const lines = dutiable.map(item => {
      const imp = importData[getHS6(item.h)] || null;
      const impVal = imp?.t || 0;
      totalImp += impVal;
      const duty = impVal * (item.m / 100);
      totalDuty += duty;
      const best = getBestFTA(item);
      const bestDuty = impVal * ((best?.rate || item.m) / 100);
      const saveable = duty - bestDuty;
      totalSaveable += saveable;
      return { ...item, imp, impVal, duty, best, saveable, topSource: imp?.c?.[0] };
    }).sort((a, b) => b.duty - a.duty);

    return { lines, free, totalImp, totalDuty, totalSaveable, dutiableCount: dutiable.length };
  }, [wlItems, importData]);

  const printReport = () => {
    const content = reportRef.current;
    if (!content) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Tariff Exposure Report</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; padding: 40px; max-width: 900px; margin: 0 auto; }
      h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
      h2 { font-size: 14px; font-weight: 600; margin: 20px 0 8px; border-bottom: 2px solid #1a1a1a; padding-bottom: 4px; }
      .subtitle { color: #666; font-size: 12px; margin-bottom: 20px; }
      .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
      .metric { border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
      .metric-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px; }
      .metric-val { font-size: 18px; font-weight: 600; font-family: 'JetBrains Mono', monospace; }
      .red { color: #dc2626; } .green { color: #16a34a; } .amber { color: #d97706; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10px; }
      th { text-align: left; padding: 6px 4px; border-bottom: 2px solid #333; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #555; }
      td { padding: 5px 4px; border-bottom: 1px solid #eee; }
      .mono { font-family: 'JetBrains Mono', monospace; }
      .right { text-align: right; }
      .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 9px; color: #888; }
      @media print { body { padding: 20px; } }
    </style></head><body>${content.innerHTML}
    <div class="footer">Generated ${new Date().toISOString().split('T')[0]} · Data: CBSA T2026 + StatsCan CIMT 2025 · This report is for informational purposes only.</div>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h2 className="font-display text-base font-medium mb-1">Export report</h2>
          <p className="text-xs text-ink-muted">Generate a printable tariff exposure report from your watchlist</p>
        </div>
        <button onClick={printReport}
          className="px-4 py-2 bg-accent/15 border border-accent/30 rounded text-sm text-accent hover:bg-accent/25 transition-colors">
          Print / Save PDF
        </button>
      </div>

      {/* Preview */}
      <div className="bg-white text-black rounded-lg overflow-hidden border border-border">
        <div ref={reportRef} className="p-8" style={{ fontFamily: '-apple-system, sans-serif', fontSize: 11, color: '#1a1a1a' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Tariff exposure report</h1>
          <div style={{ color: '#666', fontSize: 12, marginBottom: 20 }}>
            Generated {today} · {data.lines.length + data.free.length} HS codes tracked
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: '2025 import value', val: fmtVal(data.totalImp) },
              { label: 'Est. annual duty (MFN)', val: fmtVal(data.totalDuty), cls: 'red' },
              { label: 'FTA-saveable', val: fmtVal(data.totalSaveable), cls: 'green' },
              { label: 'Dutiable codes', val: `${data.dutiableCount} of ${data.lines.length + data.free.length}` },
            ].map(m => (
              <div key={m.label} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 12 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#888', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: m.cls === 'red' ? '#dc2626' : m.cls === 'green' ? '#16a34a' : '#1a1a1a' }}>{m.val}</div>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 14, fontWeight: 600, margin: '20px 0 8px', borderBottom: '2px solid #1a1a1a', paddingBottom: 4 }}>
            Dutiable codes — ranked by duty exposure
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr>
                {['HS code', 'Description', 'MFN', 'Best FTA', 'Top source', '2025 imports', 'Est. duty', 'Saveable'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '2px solid #333', fontWeight: 600, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, color: '#555' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.lines.map(l => (
                <tr key={l.h}>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #eee', fontFamily: 'monospace', fontWeight: 600 }}>{l.h.slice(0, 7)}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #eee', maxWidth: 180, overflow: 'hidden' }}>{l.d}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #eee', color: '#d97706', fontWeight: 600 }}>{l.m}%</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #eee', color: '#16a34a' }}>
                    {l.best ? `${l.best.rate === 0 ? 'Free' : l.best.rate + '%'} (${l.best.label})` : '—'}
                  </td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #eee', color: '#666' }}>{l.topSource?.n || '—'}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #eee', fontFamily: 'monospace', textAlign: 'right' }}>{fmtVal(l.impVal)}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #eee', fontFamily: 'monospace', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{fmtVal(l.duty)}</td>
                  <td style={{ padding: '5px 4px', borderBottom: '1px solid #eee', fontFamily: 'monospace', textAlign: 'right', color: '#16a34a' }}>{l.saveable > 0 ? fmtVal(l.saveable) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.free.length > 0 && (
            <>
              <h2 style={{ fontSize: 14, fontWeight: 600, margin: '20px 0 8px', borderBottom: '2px solid #1a1a1a', paddingBottom: 4 }}>
                Duty-free codes ({data.free.length})
              </h2>
              <div style={{ fontSize: 10, color: '#666', lineHeight: 1.6 }}>
                {data.free.map(r => `${r.h.slice(0, 7)} (${r.d})`).join(' · ')}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
