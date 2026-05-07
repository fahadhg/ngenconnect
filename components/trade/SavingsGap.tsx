'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TariffItem, ImportOverlay, CHAPTER_NAMES, FTA_LABELS, getHS6, fmtVal } from '@/lib/trade/data';

interface Props {
  tariffData: TariffItem[];
  importData: ImportOverlay;
}

export default function SavingsGap({ tariffData, importData }: Props) {
  const analysis = useMemo(() => {
    const FTA_ORIGINS: Record<string, string> = {
      US: 'us', MX: 'mx', DE: 'eu', FR: 'eu', IT: 'eu', NL: 'eu', BE: 'eu',
      SE: 'eu', DK: 'eu', FI: 'eu', AT: 'eu', ES: 'eu', PT: 'eu', IE: 'eu',
      CZ: 'eu', PL: 'eu', GB: 'uk', JP: 'jp', KR: 'kr', AU: 'cp', NZ: 'cp',
      VN: 'cp', MY: 'cp', SG: 'cp', CL: 'cp', PE: 'cp', BN: 'cp', MX2: 'cp',
    };

    const gaps: any[] = [];
    let totalGap = 0, totalPotential = 0;

    tariffData.filter(r => r.m > 0).forEach(item => {
      const imp = importData[getHS6(item.h)];
      if (!imp || !imp.c.length) return;

      imp.c.forEach(source => {
        const ftaKey = FTA_ORIGINS[source.k];
        const prefRate = ftaKey && item[ftaKey as keyof TariffItem] != null
          ? (item[ftaKey as keyof TariffItem] as number) : null;

        if (prefRate !== null && prefRate < item.m) {
          const mfnDuty = source.v * (item.m / 100);
          const prefDuty = source.v * (prefRate / 100);
          const gap = mfnDuty - prefDuty;
          if (gap > 100000) {
            totalGap += gap;
            totalPotential += mfnDuty;
            gaps.push({
              hs: item.h, desc: item.d, ch: item.c,
              origin: source.n, originCode: source.k,
              importVal: source.v, mfnRate: item.m,
              prefRate, ftaName: ftaKey ? FTA_LABELS[ftaKey] : '—',
              mfnDuty, prefDuty, gap,
            });
          }
        }
      });
    });

    gaps.sort((a, b) => b.gap - a.gap);
    return { gaps, totalGap, totalPotential, count: gaps.length };
  }, [tariffData, importData]);

  const chartData = useMemo(() => {
    const byFTA: Record<string, number> = {};
    analysis.gaps.forEach(g => {
      byFTA[g.ftaName] = (byFTA[g.ftaName] || 0) + g.gap;
    });
    return Object.entries(byFTA)
      .map(([name, gap]) => ({ name, gap: Math.round(gap / 1e6) }))
      .sort((a, b) => b.gap - a.gap);
  }, [analysis]);

  return (
    <div className="animate-fade-in">
      <h2 className="font-display text-base font-medium mb-1">FTA savings gap</h2>
      <p className="text-xs text-ink-muted mb-5">Quantify tariff savings left on the table nationally — imports from FTA partners still paying MFN rates</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 stagger">
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">Total savings gap</div>
          <div className="font-mono text-2xl font-medium text-positive">{fmtVal(analysis.totalGap)}</div>
          <div className="text-[10px] text-ink-faint mt-1">Across all manufacturing HS codes</div>
        </div>
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">HS codes with gaps</div>
          <div className="font-mono text-2xl font-medium">{analysis.count}</div>
          <div className="text-[10px] text-ink-faint mt-1">Where FTA rate &lt; MFN rate</div>
        </div>
        <div className="bg-surface-2 rounded-lg p-4 border border-border">
          <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-1">Avg utilization gap</div>
          <div className="font-mono text-2xl font-medium text-warn">
            {analysis.totalPotential > 0 ? Math.round(analysis.totalGap / analysis.totalPotential * 100) : 0}%
          </div>
          <div className="text-[10px] text-ink-faint mt-1">Of MFN duty could be avoided</div>
        </div>
      </div>

      {/* By FTA chart */}
      {chartData.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-3">Savings gap by trade agreement ($M)</h3>
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 16, top: 8, bottom: 4 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#4a5060' }} unit="M" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#8b919a' }} width={80} />
                <Tooltip contentStyle={{ fontSize: 11, background: '#1a1e25', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#e8eaed' }}
                  formatter={(v) => ['$' + v + 'M']} />
                <Bar dataKey="gap" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top gaps */}
      <h3 className="text-sm font-medium mb-3">Largest savings opportunities</h3>
      <div className="space-y-1.5">
        {analysis.gaps.slice(0, 25).map((g, i) => (
          <div key={g.hs + g.originCode + i} className="flex items-center gap-3 py-2 border-b border-border text-xs">
            <span className="font-mono text-accent w-20">{g.hs.slice(0, 7)}</span>
            <span className="flex-1 text-ink-muted truncate">{g.desc}</span>
            <span className="text-ink-faint">{g.origin}</span>
            <span className="font-mono text-warn w-12 text-right">{g.mfnRate}%</span>
            <span className="text-ink-faint">→</span>
            <span className="font-mono text-positive w-12 text-right">{g.prefRate === 0 ? 'Free' : g.prefRate + '%'}</span>
            <span className="text-[10px] text-ink-faint w-16 text-right">{g.ftaName}</span>
            <span className="font-mono text-positive font-medium w-20 text-right">{fmtVal(g.gap)}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 p-3 bg-surface-1 border border-border rounded text-xs text-ink-faint">
        <strong className="text-ink-muted">Methodology:</strong> Compares actual 2025 import values from FTA-partner countries against the preferential rate available under that FTA.
        The gap represents the difference between MFN duty paid and what would be paid if the preferential rate were used.
        This is an upper-bound estimate — some imports may already claim preferential treatment but are recorded at MFN origin in StatsCan data.
      </div>
    </div>
  );
}
