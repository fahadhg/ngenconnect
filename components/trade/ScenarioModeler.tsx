'use client';

import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TariffItem, ImportOverlay, CHAPTER_NAMES, getHS6, fmtVal } from '@/lib/trade/data';

interface Scenario {
  id: string;
  name: string;
  rules: { type: 'chapter' | 'origin' | 'all'; target: string; surtax: number }[];
}

const PRESET_SCENARIOS: Scenario[] = [
  { id: 's1', name: '25% surtax on all Chinese inputs', rules: [{ type: 'origin', target: 'CN', surtax: 25 }] },
  { id: 's2', name: '50% on metals (Ch 72-76)', rules: [{ type: 'chapter', target: '72-76', surtax: 50 }] },
  { id: 's3', name: '10% global tariff (Section 122)', rules: [{ type: 'all', target: '', surtax: 10 }] },
  { id: 's4', name: 'US retaliation: 25% on vehicles + parts', rules: [{ type: 'chapter', target: '87', surtax: 25 }] },
  { id: 's5', name: 'Decoupling: 35% on CN electronics', rules: [{ type: 'chapter', target: '85', surtax: 35 }, { type: 'origin', target: 'CN', surtax: 0 }] },
];

interface Props {
  tariffData: TariffItem[];
  importData: ImportOverlay;
  watchlist: string[];
}

export default function ScenarioModeler({ tariffData, importData, watchlist }: Props) {
  const [selected, setSelected] = useState<string>('s1');
  const [customSurtax, setCustomSurtax] = useState(25);
  const [customTarget, setCustomTarget] = useState('all');
  const [useCustom, setUseCustom] = useState(false);

  const wlItems = useMemo(() =>
    watchlist.map(h => tariffData.find(r => r.h === h)).filter(Boolean) as TariffItem[]
  , [watchlist, tariffData]);

  const scenario = useCustom
    ? { id: 'custom', name: 'Custom scenario', rules: [{ type: customTarget as any, target: customTarget === 'all' ? '' : customTarget, surtax: customSurtax }] }
    : PRESET_SCENARIOS.find(s => s.id === selected) || PRESET_SCENARIOS[0];

  const analysis = useMemo(() => {
    const items = wlItems.filter(r => r.m >= 0);
    let beforeTotal = 0, afterTotal = 0;

    const lines = items.map(item => {
      const imp = importData[getHS6(item.h)] || null;
      const importVal = imp?.t || 0;
      const beforeDuty = importVal * (item.m / 100);
      beforeTotal += beforeDuty;

      let additionalSurtax = 0;
      for (const rule of scenario.rules) {
        if (rule.type === 'all') {
          additionalSurtax = Math.max(additionalSurtax, rule.surtax);
        } else if (rule.type === 'chapter') {
          const chs = rule.target.includes('-')
            ? Array.from({ length: parseInt(rule.target.split('-')[1]) - parseInt(rule.target.split('-')[0]) + 1 },
              (_, i) => parseInt(rule.target.split('-')[0]) + i)
            : [parseInt(rule.target)];
          if (chs.includes(item.c)) additionalSurtax = Math.max(additionalSurtax, rule.surtax);
        } else if (rule.type === 'origin') {
          const topOrigin = imp?.c?.[0]?.k || '';
          if (topOrigin === rule.target) additionalSurtax = Math.max(additionalSurtax, rule.surtax);
        }
      }

      const afterRate = item.m + additionalSurtax;
      const afterDuty = importVal * (afterRate / 100);
      afterTotal += afterDuty;

      return {
        ...item, imp, importVal, beforeDuty, afterDuty,
        additionalSurtax, afterRate,
        increase: afterDuty - beforeDuty,
      };
    }).filter(l => l.increase > 0).sort((a, b) => b.increase - a.increase);

    return { lines, beforeTotal, afterTotal, increase: afterTotal - beforeTotal };
  }, [wlItems, importData, scenario]);

  const chartData = useMemo(() =>
    analysis.lines.slice(0, 8).map(l => ({
      name: l.h.slice(0, 7),
      before: Math.round(l.beforeDuty / 1e6),
      after: Math.round(l.afterDuty / 1e6),
    }))
  , [analysis]);

  return (
    <div className="animate-fade-in">
      <h2 className="font-display text-base font-medium mb-1">What-if scenario modeler</h2>
      <p className="text-xs text-ink-muted mb-5">See how hypothetical tariff changes impact your watchlist costs</p>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {/* Preset scenarios */}
        <div>
          <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-2">Preset scenarios</div>
          <div className="space-y-1.5">
            {PRESET_SCENARIOS.map(s => (
              <button key={s.id} onClick={() => { setSelected(s.id); setUseCustom(false); }}
                className={`w-full text-left px-3 py-2 rounded border text-xs transition-all ${
                  !useCustom && selected === s.id
                    ? 'border-accent/40 bg-accent/8 text-ink'
                    : 'border-border bg-surface-1 text-ink-muted hover:border-border-hover'
                }`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Custom */}
        <div>
          <div className="text-[10px] text-ink-faint tracking-wider uppercase mb-2">Custom scenario</div>
          <div className={`p-3 rounded border transition-all ${useCustom ? 'border-accent/40 bg-accent/8' : 'border-border bg-surface-1'}`}>
            <div className="flex gap-2 mb-2">
              <select value={customTarget} onChange={e => { setCustomTarget(e.target.value); setUseCustom(true); }}
                className="flex-1 bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-ink">
                <option value="all">All imports</option>
                <option value="72">Ch 72: Iron and steel</option>
                <option value="73">Ch 73: Iron/steel articles</option>
                <option value="76">Ch 76: Aluminium</option>
                <option value="84">Ch 84: Machinery</option>
                <option value="85">Ch 85: Electrical machinery</option>
                <option value="87">Ch 87: Vehicles</option>
              </select>
              <div className="flex items-center gap-1">
                <span className="text-xs text-ink-muted">+</span>
                <input type="number" value={customSurtax} onChange={e => { setCustomSurtax(Number(e.target.value) || 0); setUseCustom(true); }}
                  min={0} max={200} className="w-16 bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-ink text-center" />
                <span className="text-xs text-ink-muted">%</span>
              </div>
            </div>
            <button onClick={() => setUseCustom(true)}
              className="text-xs text-accent hover:underline">Apply custom</button>
          </div>
        </div>
      </div>

      {/* Impact summary */}
      <div className="p-4 bg-surface-1 border border-border rounded-lg mb-5">
        <div className="text-sm font-medium mb-3">Scenario: <span className="text-accent">{scenario.name}</span></div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] text-ink-faint tracking-wider uppercase">Current duty</div>
            <div className="font-mono text-lg">{fmtVal(analysis.beforeTotal)}</div>
          </div>
          <div>
            <div className="text-[10px] text-ink-faint tracking-wider uppercase">After scenario</div>
            <div className="font-mono text-lg text-negative">{fmtVal(analysis.afterTotal)}</div>
          </div>
          <div>
            <div className="text-[10px] text-ink-faint tracking-wider uppercase">Additional cost</div>
            <div className="font-mono text-lg text-negative font-medium">+{fmtVal(analysis.increase)}</div>
          </div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-medium mb-3">Duty impact by code ($M)</h3>
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#4a5060' }} />
                <YAxis tick={{ fontSize: 10, fill: '#4a5060' }} unit="M" />
                <Tooltip contentStyle={{ fontSize: 11, background: '#1a1e25', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#e8eaed' }} />
                <Bar dataKey="before" name="Current" fill="#6b7280" radius={[3, 3, 0, 0]} />
                <Bar dataKey="after" name="After scenario" fill="#ef4444" radius={[3, 3, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Affected lines */}
      {analysis.lines.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">{analysis.lines.length} codes affected</h3>
          <div className="space-y-1">
            {analysis.lines.slice(0, 15).map(l => (
              <div key={l.h} className="flex items-center gap-3 py-2 border-b border-border text-xs">
                <span className="font-mono text-accent w-20">{l.h.slice(0, 7)}</span>
                <span className="flex-1 text-ink-muted truncate">{l.d}</span>
                <span className="text-ink-faint">Ch {l.c}</span>
                <span className="font-mono w-14 text-right">{l.m}%</span>
                <span className="text-negative font-mono w-14 text-right">→{l.afterRate}%</span>
                <span className="text-negative font-mono font-medium w-20 text-right">+{fmtVal(l.increase)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
