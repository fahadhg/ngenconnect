'use client';

import { useState, useMemo } from 'react';
import { TariffItem, CHAPTER_NAMES, getBestFTA, fmtVal } from '@/lib/trade/data';

interface DrawbackLine {
  importHS: string;
  exportHS: string;
  importItem: TariffItem | null;
  unitCost: number;
  qty: number;
  wastePct: number;
}

interface Props {
  tariffData: TariffItem[];
}

export default function DrawbackCalc({ tariffData }: Props) {
  const [lines, setLines] = useState<DrawbackLine[]>([
    { importHS: '7318.15.00.00', exportHS: '8708.99.00.00', importItem: null, unitCost: 0.45, qty: 50000, wastePct: 5 },
  ]);

  const updateLine = (i: number, field: string, val: any) => {
    const updated = [...lines];
    (updated[i] as any)[field] = val;
    if (field === 'importHS') {
      updated[i].importItem = tariffData.find(t => t.h === val) || null;
    }
    setLines(updated);
  };

  const addLine = () => {
    setLines([...lines, { importHS: '', exportHS: '', importItem: null, unitCost: 0, qty: 0, wastePct: 5 }]);
  };

  const removeLine = (i: number) => {
    if (lines.length > 1) setLines(lines.filter((_, idx) => idx !== i));
  };

  const analysis = useMemo(() => {
    let totalDutyPaid = 0, totalDrawback = 0;

    const results = lines.map(line => {
      const item = line.importItem || tariffData.find(t => t.h === line.importHS);
      if (!item || item.m <= 0 || !line.qty || !line.unitCost) return null;

      const totalImportVal = line.unitCost * line.qty;
      const dutyPaid = totalImportVal * (item.m / 100);
      totalDutyPaid += dutyPaid;

      // Drawback is typically 99% of duty paid on the portion that's exported
      // Waste reduces the exportable portion
      const exportablePct = (100 - line.wastePct) / 100;
      const drawbackRate = 0.99; // 99% of duty is refundable
      const drawback = dutyPaid * exportablePct * drawbackRate;
      totalDrawback += drawback;

      return {
        ...line, item,
        totalImportVal, dutyPaid, drawback,
        exportablePct, drawbackRate,
      };
    }).filter(Boolean);

    return { results, totalDutyPaid, totalDrawback };
  }, [lines, tariffData]);

  return (
    <div className="animate-fade-in">
      <h2 className="font-display text-base font-medium mb-1">Duty drawback calculator</h2>
      <p className="text-xs text-ink-muted mb-5">Estimate refundable duties when imported inputs are re-exported as finished goods</p>

      <div className="p-3 bg-surface-1 border border-border rounded mb-5 text-xs text-ink-muted">
        <strong className="text-ink">How it works:</strong> Under the <em>Customs Act</em> and <em>Duties Relief Program</em>,
        manufacturers can claim back up to 99% of duties paid on imported materials that are subsequently exported as finished goods.
        The waste/scrap percentage reduces the claimable amount.
      </div>

      {/* Input lines */}
      <div className="space-y-3 mb-5">
        {lines.map((line, i) => (
          <div key={i} className="p-3 bg-surface-1 border border-border rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-ink-faint">Line {i + 1}</span>
              {lines.length > 1 && (
                <button onClick={() => removeLine(i)} className="text-[10px] text-ink-faint hover:text-negative">Remove</button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div>
                <label className="text-[10px] text-ink-faint block mb-1">Import HS code</label>
                <select value={line.importHS} onChange={e => updateLine(i, 'importHS', e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-ink">
                  <option value="">Select...</option>
                  {tariffData.filter(t => t.m > 0).slice(0, 200).map(t => (
                    <option key={t.h} value={t.h}>{t.h.slice(0, 7)} — {t.d.slice(0, 30)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-ink-faint block mb-1">Export HS code</label>
                <input type="text" value={line.exportHS} onChange={e => updateLine(i, 'exportHS', e.target.value)}
                  placeholder="e.g. 8708.99"
                  className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-ink" />
              </div>
              <div>
                <label className="text-[10px] text-ink-faint block mb-1">Unit cost (CAD)</label>
                <input type="number" value={line.unitCost || ''} onChange={e => updateLine(i, 'unitCost', Number(e.target.value) || 0)}
                  className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-ink" />
              </div>
              <div>
                <label className="text-[10px] text-ink-faint block mb-1">Annual qty</label>
                <input type="number" value={line.qty || ''} onChange={e => updateLine(i, 'qty', Number(e.target.value) || 0)}
                  className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-ink" />
              </div>
              <div>
                <label className="text-[10px] text-ink-faint block mb-1">Waste/scrap %</label>
                <input type="number" value={line.wastePct} onChange={e => updateLine(i, 'wastePct', Number(e.target.value) || 0)}
                  min={0} max={100}
                  className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-ink" />
              </div>
            </div>
            {line.importItem && (
              <div className="mt-2 text-[11px] text-ink-faint">
                {line.importItem.d} · MFN: {line.importItem.m}%
                {getBestFTA(line.importItem) && ` · Best FTA: ${getBestFTA(line.importItem)!.label} ${getBestFTA(line.importItem)!.rate}%`}
              </div>
            )}
          </div>
        ))}
        <button onClick={addLine}
          className="w-full py-2 border border-dashed border-border rounded text-xs text-ink-muted hover:border-accent/30 hover:text-accent transition-colors">
          + Add line
        </button>
      </div>

      {/* Results */}
      {analysis.results.length > 0 && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-5 stagger">
            <div className="bg-surface-2 rounded-lg p-4 border border-border">
              <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">Total duty paid</div>
              <div className="font-mono text-lg font-medium text-negative">{fmtVal(analysis.totalDutyPaid)}</div>
            </div>
            <div className="bg-surface-2 rounded-lg p-4 border border-border">
              <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">Estimated drawback</div>
              <div className="font-mono text-lg font-medium text-positive">{fmtVal(analysis.totalDrawback)}</div>
            </div>
            <div className="bg-surface-2 rounded-lg p-4 border border-border">
              <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">Recovery rate</div>
              <div className="font-mono text-lg font-medium">
                {analysis.totalDutyPaid > 0 ? Math.round(analysis.totalDrawback / analysis.totalDutyPaid * 100) : 0}%
              </div>
            </div>
          </div>

          <h3 className="text-sm font-medium mb-2">Line detail</h3>
          {analysis.results.map((r: any, i: number) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-border text-xs">
              <span className="font-mono text-accent">{r.item.h.slice(0, 7)}</span>
              <span className="flex-1 text-ink-muted">{r.item.d}</span>
              <span className="text-ink-faint">MFN {r.item.m}%</span>
              <span className="font-mono text-negative">{fmtVal(r.dutyPaid)} paid</span>
              <span className="text-ink-faint">→</span>
              <span className="font-mono text-positive font-medium">{fmtVal(r.drawback)} back</span>
            </div>
          ))}

          <div className="mt-4 p-3 bg-accent/5 border border-accent/15 rounded text-xs text-ink-muted">
            <strong className="text-ink">Next steps:</strong> File CBSA Form K32 (Drawback Claim) or apply for the Duties Relief Program (DRP)
            for duty-free importation. Processing time: 60-90 days. Consult D7-4-2 memorandum for eligibility.
          </div>
        </div>
      )}
    </div>
  );
}
