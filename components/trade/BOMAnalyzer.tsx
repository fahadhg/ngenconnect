'use client';

import { useState, useMemo, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TariffItem, ImportOverlay, CHAPTER_NAMES, FTA_LABELS, getHS6, getBestFTA, fmtVal } from '@/lib/trade/data';

interface BOMLine {
  partNumber: string;
  description: string;
  hsCode: string;
  unitCost: number;
  annualQty: number;
  origin: string;
  matched?: TariffItem | null;
  imp?: { t: number; c: { k: string; n: string; v: number }[] } | null;
}

interface Props {
  tariffData: TariffItem[];
  importData: ImportOverlay;
}

const SAMPLE_BOM = `Part Number,Description,HS Code,Unit Cost (CAD),Annual Qty,Origin Country
BLT-M8-SS,Stainless steel M8 hex bolts,7318.15.00.00,0.45,120000,CN
COIL-HR-5MM,Hot-rolled steel coil 5mm,7208.51.00.00,890,200,US
BAR-AL-6061,Aluminum bar 6061-T6,7604.10.00.00,12.50,8000,US
MOT-DC-500W,DC motor 500W brushless,8501.31.00.00,85,2000,DE
BRK-ASSY-01,Brake assembly complete,8708.30.00.00,142,5000,MX
FILM-PE-50,Polyethylene film 50μm,3920.10.00.00,2.20,50000,KR
WIRE-CU-1KV,Electric conductor 1kV,8544.49.00.00,3.80,30000,MX
CYL-HYD-100,Hydraulic cylinder 100mm,8412.21.00.00,340,800,DE
BOLT-VEH-03,Vehicle body bolt assorted,8708.99.00.00,1.10,200000,CN
CTRL-REG-01,Automatic regulating instrument,9032.89.90.00,265,400,DE`;

const COUNTRY_MAP: Record<string, string> = {
  CN: 'China', US: 'United States', DE: 'Germany', JP: 'Japan', MX: 'Mexico',
  KR: 'South Korea', TW: 'Taiwan', VN: 'Vietnam', UK: 'United Kingdom', IN: 'India',
  FR: 'France', IT: 'Italy', BR: 'Brazil', TH: 'Thailand',
};

function parseBOM(csv: string): Omit<BOMLine, 'matched' | 'imp'>[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    return {
      partNumber: parts[0] || '',
      description: parts[1] || '',
      hsCode: parts[2] || '',
      unitCost: parseFloat(parts[3]) || 0,
      annualQty: parseInt(parts[4]) || 0,
      origin: (parts[5] || '').toUpperCase().slice(0, 2),
    };
  });
}

export default function BOMAnalyzer({ tariffData, importData }: Props) {
  const [csv, setCsv] = useState('');
  const [bomLines, setBomLines] = useState<BOMLine[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const processCSV = useCallback((text: string) => {
    setCsv(text);
    const parsed = parseBOM(text);
    const matched = parsed.map(line => {
      const found = tariffData.find(t => t.h === line.hsCode) ||
        tariffData.find(t => t.h.startsWith(line.hsCode.replace(/\.00\.00$/, '').replace(/\.00$/, '')));
      const imp = importData[getHS6(line.hsCode)] || null;
      return { ...line, matched: found || null, imp };
    });
    setBomLines(matched);
  }, [tariffData, importData]);

  const loadSample = () => processCSV(SAMPLE_BOM);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => processCSV(ev.target?.result as string || '');
      reader.readAsText(file);
    }
  }, [processCSV]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => processCSV(ev.target?.result as string || '');
      reader.readAsText(file);
    }
  };

  const analysis = useMemo(() => {
    if (!bomLines.length) return null;
    let totalSpend = 0, totalDuty = 0, totalBestDuty = 0;
    const lineDetails = bomLines.map(line => {
      const annualSpend = line.unitCost * line.annualQty;
      totalSpend += annualSpend;
      const mfnRate = line.matched?.m || 0;
      const duty = annualSpend * (mfnRate / 100);
      totalDuty += duty;
      const best = line.matched ? getBestFTA(line.matched) : null;
      const bestDuty = annualSpend * ((best?.rate || mfnRate) / 100);
      totalBestDuty += bestDuty;
      return { ...line, annualSpend, duty, bestDuty, bestFTA: best, mfnRate };
    });
    return {
      lines: lineDetails.sort((a, b) => b.duty - a.duty),
      totalSpend, totalDuty, totalBestDuty,
      saveable: totalDuty - totalBestDuty,
      effectiveRate: totalSpend > 0 ? Math.round(totalDuty / totalSpend * 1000) / 10 : 0,
      matchRate: bomLines.filter(l => l.matched).length / bomLines.length * 100,
    };
  }, [bomLines]);

  const chartData = useMemo(() => {
    if (!analysis) return [];
    return analysis.lines.slice(0, 10).map(l => ({
      name: l.partNumber.slice(0, 12),
      duty: Math.round(l.duty),
      saveable: Math.round(l.duty - l.bestDuty),
    }));
  }, [analysis]);

  return (
    <div className="animate-fade-in">
      <h2 className="font-display text-base font-medium mb-1">BOM exposure calculator</h2>
      <p className="text-xs text-ink-muted mb-5">Upload your bill of materials to calculate total tariff exposure and FTA savings</p>

      {!bomLines.length ? (
        <div>
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${dragOver ? 'border-accent/50 bg-accent/5' : 'border-border hover:border-border-hover'}`}>
            <div className="text-ink-muted mb-2">Drop a CSV file here</div>
            <div className="text-xs text-ink-faint mb-4">Columns: Part Number, Description, HS Code, Unit Cost (CAD), Annual Qty, Origin Country</div>
            <div className="flex gap-3 justify-center">
              <label className="px-3 py-1.5 text-xs bg-surface-2 border border-border rounded cursor-pointer hover:border-accent/40 text-ink-muted hover:text-ink transition-colors">
                Browse files
                <input type="file" accept=".csv,.txt" onChange={handleFileInput} className="hidden" />
              </label>
              <button onClick={loadSample}
                className="px-3 py-1.5 text-xs bg-accent/10 border border-accent/20 rounded text-accent hover:bg-accent/20 transition-colors">
                Load sample BOM
              </button>
            </div>
          </div>

          <div className="mt-4 p-3 bg-surface-1 border border-border rounded text-xs text-ink-faint">
            <div className="font-medium text-ink-muted mb-1">CSV format</div>
            <code className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap">Part Number,Description,HS Code,Unit Cost (CAD),Annual Qty,Origin Country
BLT-M8-SS,Stainless steel M8 hex bolts,7318.15.00.00,0.45,120000,CN</code>
          </div>
        </div>
      ) : analysis && (
        <div className="space-y-6">
          {/* Summary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 stagger">
            <div className="bg-surface-2 rounded-lg p-4 border border-border">
              <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">Annual spend</div>
              <div className="font-mono text-lg font-medium">{fmtVal(analysis.totalSpend)}</div>
            </div>
            <div className="bg-surface-2 rounded-lg p-4 border border-border">
              <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">Total duty at MFN</div>
              <div className="font-mono text-lg font-medium text-negative">{fmtVal(analysis.totalDuty)}</div>
            </div>
            <div className="bg-surface-2 rounded-lg p-4 border border-border">
              <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">Effective rate</div>
              <div className="font-mono text-lg font-medium text-warn">{analysis.effectiveRate}%</div>
            </div>
            <div className="bg-surface-2 rounded-lg p-4 border border-border">
              <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">FTA saveable</div>
              <div className="font-mono text-lg font-medium text-positive">{fmtVal(analysis.saveable)}</div>
            </div>
            <div className="bg-surface-2 rounded-lg p-4 border border-border">
              <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">HS match rate</div>
              <div className="font-mono text-lg font-medium">{Math.round(analysis.matchRate)}%</div>
            </div>
          </div>

          {/* Duty chart */}
          {chartData.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Annual duty by part (top 10)</h3>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 4 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#4a5060' }} angle={-20} textAnchor="end" height={40} />
                    <YAxis tick={{ fontSize: 10, fill: '#4a5060' }} tickFormatter={v => fmtVal(v)} />
                    <Tooltip contentStyle={{ fontSize: 11, background: '#1a1e25', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#e8eaed' }}
                      formatter={(v) => ['$' + Number(v).toLocaleString()]} />
                    <Bar dataKey="duty" name="MFN duty" fill="#ef4444" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="saveable" name="FTA saveable" fill="#22c55e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Line detail table */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-medium">Line-by-line analysis</h3>
              <button onClick={() => { setBomLines([]); setCsv(''); }}
                className="text-xs text-ink-muted hover:text-ink px-2 py-1 border border-border rounded">
                Clear BOM
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    {['Part', 'HS code', 'Origin', 'Unit cost', 'Qty', 'Spend', 'MFN', 'Duty', 'Best FTA', 'Saveable'].map(h => (
                      <th key={h} className="py-2 px-2 font-medium text-ink-faint text-[10px] tracking-wider uppercase text-right first:text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.lines.map((l, i) => (
                    <tr key={i} className="border-b border-border hover:bg-surface-2/30">
                      <td className="py-2 px-2 text-left font-medium">{l.partNumber}</td>
                      <td className="py-2 px-2 text-right font-mono text-accent">{l.hsCode.slice(0, 7)}</td>
                      <td className="py-2 px-2 text-right text-ink-muted">{COUNTRY_MAP[l.origin] || l.origin}</td>
                      <td className="py-2 px-2 text-right font-mono">${l.unitCost.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-mono">{l.annualQty.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right font-mono">{fmtVal(l.annualSpend)}</td>
                      <td className="py-2 px-2 text-right font-mono text-warn">{l.mfnRate}%</td>
                      <td className="py-2 px-2 text-right font-mono text-negative font-medium">{fmtVal(l.duty)}</td>
                      <td className="py-2 px-2 text-right text-positive text-[11px]">
                        {l.bestFTA ? `${l.bestFTA.label} ${l.bestFTA.rate === 0 ? 'Free' : l.bestFTA.rate + '%'}` : '—'}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-positive font-medium">
                        {l.duty - l.bestDuty > 0 ? fmtVal(l.duty - l.bestDuty) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-medium">
                    <td colSpan={5} className="py-2 px-2">Total</td>
                    <td className="py-2 px-2 text-right font-mono">{fmtVal(analysis.totalSpend)}</td>
                    <td className="py-2 px-2 text-right font-mono text-warn">{analysis.effectiveRate}%</td>
                    <td className="py-2 px-2 text-right font-mono text-negative">{fmtVal(analysis.totalDuty)}</td>
                    <td className="py-2 px-2"></td>
                    <td className="py-2 px-2 text-right font-mono text-positive">{fmtVal(analysis.saveable)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
