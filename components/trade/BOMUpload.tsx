'use client';

import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TariffItem, ImportOverlay, FTA_LABELS, getHS6, getBestFTA, fmtVal, CHAPTER_NAMES } from '@/lib/trade/data';

interface BOMLine {
  id: number;
  partNumber: string;
  description: string;
  hsCode: string;
  unitCost: number;
  annualQty: number;
  supplierCountry: string;
  matched?: TariffItem | null;
  imp?: { t: number; c: { k: string; n: string; v: number }[] } | null;
}

const SAMPLE_BOM: Omit<BOMLine, 'id' | 'matched' | 'imp'>[] = [
  { partNumber: 'SS-BOLT-M8', description: 'Steel hex bolts M8x30', hsCode: '7318.15', unitCost: 0.45, annualQty: 200000, supplierCountry: 'CN' },
  { partNumber: 'AL-BAR-6061', description: 'Aluminum bar 6061-T6', hsCode: '7604.10', unitCost: 12.50, annualQty: 5000, supplierCountry: 'US' },
  { partNumber: 'DC-MOT-750', description: 'DC motor 750W', hsCode: '8501.31', unitCost: 85.00, annualQty: 2000, supplierCountry: 'DE' },
  { partNumber: 'PE-FILM-03', description: 'Polyethylene film 0.3mm', hsCode: '3920.10', unitCost: 3.20, annualQty: 50000, supplierCountry: 'KR' },
  { partNumber: 'HYD-CYL-50', description: 'Hydraulic cylinder 50mm', hsCode: '8412.21', unitCost: 220.00, annualQty: 800, supplierCountry: 'DE' },
  { partNumber: 'BRK-ASM-01', description: 'Brake assembly front', hsCode: '8708.30', unitCost: 65.00, annualQty: 10000, supplierCountry: 'MX' },
  { partNumber: 'VEH-PRT-99', description: 'Vehicle parts misc', hsCode: '8708.99', unitCost: 28.00, annualQty: 15000, supplierCountry: 'CN' },
  { partNumber: 'ELEC-COND', description: 'Electric conductors 80V', hsCode: '8544.49', unitCost: 5.60, annualQty: 30000, supplierCountry: 'MX' },
];

const COUNTRY_NAMES: Record<string, string> = {
  CN: 'China', US: 'United States', DE: 'Germany', JP: 'Japan', MX: 'Mexico',
  KR: 'South Korea', TW: 'Taiwan', VN: 'Vietnam', UK: 'United Kingdom', IN: 'India',
  IT: 'Italy', FR: 'France', BR: 'Brazil', TH: 'Thailand',
};

interface Props {
  tariffData: TariffItem[];
  importData: ImportOverlay;
}

export default function BOMUpload({ tariffData, importData }: Props) {
  const [lines, setLines] = useState<BOMLine[]>([]);
  const [csvText, setCsvText] = useState('');
  const [surtaxCountry, setSurtaxCountry] = useState('CN');
  const [surtaxRate, setSurtaxRate] = useState(25);

  const matchLine = (line: Omit<BOMLine, 'id' | 'matched' | 'imp'>, id: number): BOMLine => {
    const hsNorm = line.hsCode.replace(/\./g, '');
    const match = tariffData.find(r => r.h.replace(/\./g, '').startsWith(hsNorm));
    const imp = importData[getHS6(line.hsCode)] || null;
    return { ...line, id, matched: match || null, imp };
  };

  const loadSample = () => {
    setLines(SAMPLE_BOM.map((l, i) => matchLine(l, i)));
  };

  const handleCSV = (text: string) => {
    setCsvText(text);
    const rows = text.trim().split('\n').slice(1);
    const parsed: BOMLine[] = rows.map((row, i) => {
      const cols = row.split(',').map(c => c.trim().replace(/"/g, ''));
      return matchLine({
        partNumber: cols[0] || '',
        description: cols[1] || '',
        hsCode: cols[2] || '',
        unitCost: parseFloat(cols[3]) || 0,
        annualQty: parseInt(cols[4]) || 0,
        supplierCountry: (cols[5] || 'CN').toUpperCase(),
      }, i);
    });
    setLines(parsed);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleCSV(ev.target?.result as string);
    reader.readAsText(file);
  };

  const analysis = useMemo(() => {
    if (!lines.length) return null;
    let totalSpend = 0, totalDuty = 0, totalSaveable = 0, totalSurtaxExposure = 0;
    const byCountry: Record<string, { spend: number; duty: number }> = {};

    const lineDetails = lines.map(l => {
      const spend = l.unitCost * l.annualQty;
      const mfnRate = l.matched?.m || 0;
      const duty = spend * (mfnRate / 100);
      const best = l.matched ? getBestFTA(l.matched) : null;
      const bestRate = best?.rate || mfnRate;
      const saveable = spend * ((mfnRate - bestRate) / 100);
      const hasSurtax = l.supplierCountry === surtaxCountry;
      const surtaxCost = hasSurtax ? spend * (surtaxRate / 100) : 0;

      totalSpend += spend;
      totalDuty += duty;
      totalSaveable += saveable;
      totalSurtaxExposure += surtaxCost;

      const ctry = l.supplierCountry;
      if (!byCountry[ctry]) byCountry[ctry] = { spend: 0, duty: 0 };
      byCountry[ctry].spend += spend;
      byCountry[ctry].duty += duty + surtaxCost;

      return { ...l, spend, duty, best, bestRate, saveable, surtaxCost };
    });

    const countryChart = Object.entries(byCountry)
      .map(([k, v]) => ({ country: COUNTRY_NAMES[k] || k, spend: Math.round(v.spend), duty: Math.round(v.duty) }))
      .sort((a, b) => b.spend - a.spend);

    return { lineDetails, totalSpend, totalDuty, totalSaveable, totalSurtaxExposure, countryChart };
  }, [lines, surtaxCountry, surtaxRate]);

  return (
    <div>
      <h2 className="font-display text-base font-medium mb-1">Bill of materials exposure</h2>
      <p className="text-xs text-ink-muted mb-5">Upload your BOM to see total tariff exposure, FTA savings, and surtax risk</p>

      {/* Upload area */}
      <div className="flex flex-wrap gap-3 mb-5">
        <label className="flex-1 min-w-[200px] flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-accent/30 transition-colors">
          <input type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
          <span className="text-sm text-ink-muted">Drop CSV or click to upload</span>
        </label>
        <button onClick={loadSample}
          className="px-4 py-2 text-xs bg-surface-2 border border-border rounded-lg text-ink-muted hover:text-ink hover:border-accent/30 transition-all">
          Load sample BOM
        </button>
      </div>

      <div className="text-[10px] text-ink-faint mb-4 bg-surface-1 p-2 rounded font-mono">
        CSV format: PartNumber, Description, HSCode, UnitCost, AnnualQty, SupplierCountry
      </div>

      {/* Surtax scenario */}
      {lines.length > 0 && (
        <div className="flex items-center gap-3 mb-5 p-3 bg-surface-1 border border-border rounded-lg">
          <span className="text-xs text-ink-muted">Apply surtax:</span>
          <input type="number" value={surtaxRate} onChange={e => setSurtaxRate(Number(e.target.value) || 0)}
            className="w-16 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-ink" />
          <span className="text-xs text-ink-muted">% on</span>
          <select value={surtaxCountry} onChange={e => setSurtaxCountry(e.target.value)}
            className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-ink">
            {Object.entries(COUNTRY_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="text-xs text-ink-muted">origin</span>
        </div>
      )}

      {/* Results */}
      {analysis && (
        <div className="space-y-5">
          {/* Summary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger">
            <div className="bg-surface-2 rounded-lg p-4 border border-border">
              <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">Annual spend</div>
              <div className="font-mono text-xl font-medium">{fmtVal(analysis.totalSpend)}</div>
            </div>
            <div className="bg-surface-2 rounded-lg p-4 border border-border">
              <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">MFN duty cost</div>
              <div className="font-mono text-xl font-medium text-warn">{fmtVal(analysis.totalDuty)}</div>
              <div className="text-[10px] text-ink-faint mt-1">{(analysis.totalDuty / analysis.totalSpend * 100).toFixed(1)}% of spend</div>
            </div>
            <div className="bg-surface-2 rounded-lg p-4 border border-border">
              <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">Saveable via FTA</div>
              <div className="font-mono text-xl font-medium text-positive">{fmtVal(analysis.totalSaveable)}</div>
              <div className="text-[10px] text-ink-faint mt-1">by switching to best FTA origin</div>
            </div>
            <div className="bg-surface-2 rounded-lg p-4 border border-border">
              <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">Surtax exposure</div>
              <div className="font-mono text-xl font-medium text-negative">{fmtVal(analysis.totalSurtaxExposure)}</div>
              <div className="text-[10px] text-ink-faint mt-1">{surtaxRate}% on {COUNTRY_NAMES[surtaxCountry]} origin</div>
            </div>
          </div>

          {/* Spend by country chart */}
          <div>
            <h3 className="text-sm font-medium mb-3">Spend and duty by supplier country</h3>
            <div className="h-48">
              <ResponsiveContainer>
                <BarChart data={analysis.countryChart} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
                  <XAxis dataKey="country" tick={{ fontSize: 11, fill: '#4a5060' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#4a5060' }} tickFormatter={v => fmtVal(v)} />
                  <Tooltip contentStyle={{ fontSize: 12, background: '#1a1e25', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#e8eaed' }}
                    formatter={(v) => fmtVal(Number(v))} />
                  <Bar dataKey="spend" name="Spend" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="duty" name="Duty+surtax" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Line-by-line table */}
          <div>
            <h3 className="text-sm font-medium mb-3">Line detail</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    {['Part #', 'HS code', 'Origin', 'Unit cost', 'Qty', 'Spend', 'MFN %', 'Duty', 'Best FTA', 'Saveable', 'Surtax'].map(h => (
                      <th key={h} className="py-2 px-2 text-[10px] text-ink-faint tracking-wider uppercase text-right first:text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.lineDetails.map(l => (
                    <tr key={l.id} className="border-b border-border hover:bg-surface-2/30">
                      <td className="py-2 px-2 font-mono font-medium text-left">{l.partNumber}</td>
                      <td className="py-2 px-2 font-mono text-accent text-right">{l.hsCode}</td>
                      <td className="py-2 px-2 text-right">{COUNTRY_NAMES[l.supplierCountry] || l.supplierCountry}</td>
                      <td className="py-2 px-2 font-mono text-right">${l.unitCost.toFixed(2)}</td>
                      <td className="py-2 px-2 font-mono text-right">{l.annualQty.toLocaleString()}</td>
                      <td className="py-2 px-2 font-mono text-right">{fmtVal(l.spend)}</td>
                      <td className="py-2 px-2 font-mono text-right text-warn">{l.matched?.m || 0}%</td>
                      <td className="py-2 px-2 font-mono text-right">{fmtVal(l.duty)}</td>
                      <td className="py-2 px-2 text-right text-positive">{l.best ? (l.bestRate === 0 ? 'Free' : l.bestRate + '%') : '—'}</td>
                      <td className="py-2 px-2 font-mono text-right text-positive">{l.saveable > 0 ? fmtVal(l.saveable) : '—'}</td>
                      <td className="py-2 px-2 font-mono text-right text-negative">{l.surtaxCost > 0 ? fmtVal(l.surtaxCost) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {!lines.length && (
        <div className="py-12 text-center text-ink-faint text-sm">
          Upload a BOM or load the sample to see your tariff exposure
        </div>
      )}
    </div>
  );
}
