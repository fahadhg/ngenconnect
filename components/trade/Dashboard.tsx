'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  TariffItem, ImportOverlay, USRatesOverlay, SurtaxOverlay,
  CHAPTER_NAMES, FTA_LABELS, FTA_COLORS, GAZETTE_ALERTS,
  getHS6, getBestFTA, fmtVal, findSurtax,
} from '@/lib/trade/data';
import { assessRisk } from '@/lib/trade/analysis';
import { getROO } from '@/lib/trade/roo';
import clsx from 'clsx';

const PG = 40;
const RISK_CLS = {
  low:      { bg: 'bg-positive/10', text: 'text-positive',  label: 'Low' },
  med:      { bg: 'bg-warn/10',     text: 'text-warn',      label: 'Medium' },
  high:     { bg: 'bg-negative/10', text: 'text-negative',  label: 'High' },
  critical: { bg: 'bg-negative/20', text: 'text-negative',  label: 'Critical' },
};

interface Props {
  tariffData: TariffItem[];
  importData: ImportOverlay;
  usRates: USRatesOverlay;
  surtaxData: SurtaxOverlay;
}

function Badge({ t, s }: { t: string; s: 'high' | 'med' | 'low' }) {
  const cls = { high: 'bg-negative/10 text-negative', med: 'bg-warn/10 text-warn', low: 'bg-accent/10 text-accent' };
  return <span className={clsx('inline-block text-[11px] font-medium px-2 py-0.5 rounded', cls[s])}>{t}</span>;
}

function ImportBars({ imp, small }: { imp: any; small?: boolean }) {
  if (!imp) return <span className="text-[10px] text-ink-faint">—</span>;
  const max = imp.c[0]?.v || 1;
  return (
    <div className={clsx('flex items-center', small ? 'gap-1' : 'gap-2')}>
      {imp.c.map((c: any, i: number) => (
        <div key={c.k} className="flex items-center gap-1" title={`${c.n}: ${fmtVal(c.v)} (${Math.round(c.v / imp.t * 100)}%)`}>
          <div className="rounded-sm" style={{
            height: small ? 8 : 12,
            width: Math.max(Math.round(c.v / max * (small ? 32 : 52)), 3),
            background: i === 0 ? '#3b82f6' : i === 1 ? '#f59e0b' : '#4a5060',
            opacity: 1 - i * 0.2,
          }} />
          <span className={clsx(small ? 'text-[10px]' : 'text-[11px]', i === 0 ? 'text-ink font-medium' : 'text-ink-muted')}>{c.n}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ tariffData, importData, usRates, surtaxData }: Props) {
  const D   = tariffData;
  const IMP = importData;
  const USR = usRates;
  const STX = surtaxData;

  const [q,        setQ]        = useState('');
  const [chF,      setChF]      = useState('all');
  const [rateF,    setRateF]    = useState('all');
  const [sortBy,   setSortBy]   = useState('imp');
  const [pg,       setPg]       = useState(0);
  const [wl,       setWl]       = useState<string[]>([]);
  const [mounted,  setMounted]  = useState(false);
  const [detailHS, setDetailHS] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    try { const s = localStorage.getItem('tm-wl2'); if (s) setWl(JSON.parse(s)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (mounted) try { localStorage.setItem('tm-wl2', JSON.stringify(wl)); } catch { /* ignore */ }
  }, [wl, mounted]);

  const getImp  = useCallback((hs: string) => IMP[hs] || IMP[getHS6(hs)] || null, [IMP]);
  const toggle  = (hs: string) => setWl(p => p.includes(hs) ? p.filter(h => h !== hs) : [...p, hs]);
  const chapters = useMemo(() => [...new Set(D.map(r => r.c))].sort((a, b) => a - b), [D]);

  const filtered = useMemo(() => {
    let f = [...D];
    if (chF !== 'all')       f = f.filter(r => r.c === Number(chF));
    if (rateF === 'dutiable') f = f.filter(r => r.m > 0);
    else if (rateF === 'free') f = f.filter(r => r.m === 0);
    if (q) { const lq = q.toLowerCase(); f = f.filter(r => r.h.toLowerCase().includes(lq) || r.d.toLowerCase().includes(lq)); }
    if (sortBy === 'imp')  f.sort((a, b) => (getImp(b.h)?.t || 0) - (getImp(a.h)?.t || 0));
    else if (sortBy === 'rate') f.sort((a, b) => (b.m || 0) - (a.m || 0));
    return f;
  }, [q, chF, rateF, sortBy, D, getImp]);

  useEffect(() => { setPg(0); }, [q, chF, rateF, sortBy]);

  const paged   = useMemo(() => filtered.slice(pg * PG, (pg + 1) * PG), [filtered, pg]);
  const totalPg = Math.ceil(filtered.length / PG);

  const stats = useMemo(() => {
    const dut = D.filter(r => r.m > 0);
    return { total: D.length, dutiable: dut.length, free: D.filter(r => r.m === 0).length };
  }, [D]);

  return (
    <div>
      {/* ── All codes table ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-3">
        <input type="text" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)}
          className="flex-1 min-w-[160px] bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/40" />
        <select value={chF} onChange={e => setChF(e.target.value)}
          className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink">
          <option value="all">All chapters</option>
          {chapters.map(c => <option key={c} value={c}>Ch {c}: {CHAPTER_NAMES[c]}</option>)}
        </select>
        <select value={rateF} onChange={e => setRateF(e.target.value)}
          className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink">
          <option value="all">All</option>
          <option value="dutiable">Dutiable</option>
          <option value="free">Free</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-ink">
          <option value="imp">Sort: imports</option>
          <option value="rate">Sort: rate</option>
        </select>
      </div>

      <div className="text-[11px] text-ink-faint mb-2">
        {filtered.length.toLocaleString()} results · page {pg + 1}/{totalPg || 1}
        <span className="ml-3 text-ink-faint">{stats.total.toLocaleString()} total codes · {stats.dutiable.toLocaleString()} dutiable · {stats.free.toLocaleString()} free</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse zebra-table">
          <thead>
            <tr className="border-b border-border">
              {['', 'HS', 'Description', 'MFN', 'Best FTA', 'Imports', 'Sources'].map(h => (
                <th key={h} className={clsx('py-2 px-2 font-medium text-ink-faint text-[10px] uppercase tracking-wider',
                  ['MFN', 'Best FTA', 'Imports'].includes(h) ? 'text-right' : 'text-left')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map(r => {
              const inW = wl.includes(r.h);
              const imp = getImp(r.h);
              const best = getBestFTA(r);
              const sx = findSurtax(STX, r.h, 'US');
              return (
                <tr key={r.h} className="border-b border-border/50 transition-colors">
                  <td className="py-1.5 px-2 text-center">
                    <span onClick={() => toggle(r.h)}
                      className={clsx('cursor-pointer text-sm', inW ? 'text-warn' : 'text-ink-faint/30 hover:text-ink-faint')}>
                      {inW ? '★' : '☆'}
                    </span>
                  </td>
                  <td className="py-1.5 px-2">
                    <span onClick={() => setDetailHS(r.h)}
                      className="font-mono font-medium text-accent hover:underline cursor-pointer">{r.h}</span>
                  </td>
                  <td className="py-1.5 px-2 max-w-[180px] truncate text-ink-muted">{r.d}</td>
                  <td className={clsx('py-1.5 px-2 text-right font-mono font-medium',
                    r.m > 15 ? 'text-negative' : r.m > 5 ? 'text-warn' : r.m === 0 ? 'text-positive' : 'text-ink')}>
                    {r.m === -1 ? 'Spec' : r.m === 0 ? 'Free' : r.m + '%'}
                    {sx && <span className="ml-1 text-[9px] text-negative font-sans">+{sx.rate}%</span>}
                  </td>
                  <td className={clsx('py-1.5 px-2 text-right font-mono',
                    best && best.rate === 0 ? 'text-positive' : 'text-ink-muted')}>
                    {best ? (best.rate === 0 ? 'Free' : best.rate + '%') : '—'}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-ink-muted">{imp ? fmtVal(imp.t) : '—'}</td>
                  <td className="py-1.5 px-2"><ImportBars imp={imp} small /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPg > 1 && (
        <div className="flex gap-2 mt-3 items-center justify-center">
          <button onClick={() => setPg(0)} disabled={pg === 0}
            className="px-2 py-1 text-xs bg-surface-2 border border-border rounded text-ink-muted disabled:opacity-30">First</button>
          <button onClick={() => setPg(Math.max(0, pg - 1))} disabled={pg === 0}
            className="px-2 py-1 text-xs bg-surface-2 border border-border rounded text-ink-muted disabled:opacity-30">Prev</button>
          <span className="text-xs text-ink-faint min-w-[60px] text-center">{pg + 1}/{totalPg}</span>
          <button onClick={() => setPg(Math.min(totalPg - 1, pg + 1))} disabled={pg >= totalPg - 1}
            className="px-2 py-1 text-xs bg-surface-2 border border-border rounded text-ink-muted disabled:opacity-30">Next</button>
          <button onClick={() => setPg(totalPg - 1)} disabled={pg >= totalPg - 1}
            className="px-2 py-1 text-xs bg-surface-2 border border-border rounded text-ink-muted disabled:opacity-30">Last</button>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-border text-[10px] text-ink-faint flex flex-wrap justify-between gap-2">
        <span>CBSA T2026 · StatsCan CIMT 2025 · {stats.total.toLocaleString()} codes</span>
        <span>cbsa-asfc.gc.ca · statcan.gc.ca</span>
      </div>

      {/* ── HS Code detail panel ──────────────────────────────────────────────── */}
      {detailHS && (() => {
        const item = D.find(r => r.h === detailHS);
        if (!item) { setDetailHS(null); return null; }
        const imp  = getImp(item.h);
        const best = getBestFTA(item);
        const risk = assessRisk(item, imp);
        const roo  = getROO(item.c);
        const inWatchlist   = wl.includes(item.h);
        const relatedAlerts = GAZETTE_ALERTS.filter(g => (g.chs as number[]).includes(item.c));
        const keys = ['us', 'mx', 'eu', 'cp', 'uk', 'jp', 'kr'] as const;
        const allRates = [
          ...keys.filter(k => item[k] != null).map(k => ({ key: k, label: FTA_LABELS[k], rate: item[k] || 0, color: FTA_COLORS[k] })),
          { key: 'mfn', label: 'MFN', rate: item.m, color: FTA_COLORS.mfn },
        ].sort((a, b) => a.rate - b.rate);
        const maxRate  = Math.max(...allRates.map(r => r.rate), 1);
        const usRate   = USR[item.h.replace(/\./g, '').slice(0, 6)];
        const surtaxUS  = findSurtax(STX, item.h, 'US');
        const surtaxCN  = findSurtax(STX, item.h, 'CN');
        const surtaxAll = findSurtax(STX, item.h, 'ALL');

        return (
          <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDetailHS(null)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative w-full max-w-xl bg-surface-0 border-l border-border overflow-y-auto"
              onClick={e => e.stopPropagation()}
              style={{ animation: 'slideIn 0.25s ease-out' }}>
              <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

              {/* Header */}
              <div className="sticky top-0 bg-surface-0 border-b border-border px-5 py-4 flex justify-between items-start z-10">
                <div>
                  <div className="font-mono text-lg font-medium text-accent">{item.h}</div>
                  <div className="text-sm text-ink-muted mt-0.5">{item.d}</div>
                  <div className="text-xs text-ink-faint mt-1">Ch {item.c}: {CHAPTER_NAMES[item.c]} · UOM: {item.u}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggle(item.h)}
                    className={clsx('text-xs px-3 py-1.5 rounded border transition-colors',
                      inWatchlist ? 'border-warn/30 bg-warn/10 text-warn' : 'border-border text-ink-muted hover:text-accent hover:border-accent/30')}>
                    {inWatchlist ? '★ In watchlist' : '☆ Watchlist'}
                  </button>
                  <button onClick={() => setDetailHS(null)} className="text-ink-faint hover:text-ink text-lg px-2">✕</button>
                </div>
              </div>

              <div className="px-5 py-4 space-y-5">
                {/* Tariff rates */}
                <div>
                  <h3 className="text-sm font-medium mb-3">Tariff rates by origin</h3>
                  <div className="space-y-1.5">
                    {allRates.map((r, i) => (
                      <div key={r.key} className="flex items-center gap-3">
                        <div className={clsx('w-24 text-right text-xs', i === 0 ? 'font-medium text-positive' : 'text-ink-muted')}>{r.label}</div>
                        <div className="flex-1 h-4 bg-surface-2 rounded overflow-hidden">
                          <div className="h-full rounded" style={{ width: Math.max(r.rate / maxRate * 100, r.rate === 0 ? 1 : 2) + '%', background: r.color, opacity: i === 0 ? 1 : 0.7 }} />
                        </div>
                        <div className={clsx('min-w-[50px] text-right text-xs font-mono', i === 0 ? 'font-medium text-positive' : r.rate === 0 ? 'text-positive' : 'text-ink')}>
                          {r.rate === 0 ? 'Free' : r.rate + '%'}
                        </div>
                      </div>
                    ))}
                  </div>
                  {item.g != null && <div className="text-[11px] text-ink-faint mt-2">General tariff (Col 2): {item.g}%</div>}
                  {usRate !== undefined && <div className="text-[11px] text-ink-faint">US HTS rate: {usRate}%</div>}
                  {best && item.m > 0 && (
                    <div className="mt-2 px-3 py-2 bg-positive/8 border border-positive/15 rounded text-xs text-positive">
                      Best: {best.label} at {best.rate === 0 ? 'Free' : best.rate + '%'} — saves {Math.round((item.m - best.rate) / item.m * 100)}% vs MFN
                    </div>
                  )}
                  {(surtaxUS || surtaxCN || surtaxAll) && (
                    <div className="mt-2 space-y-1.5">
                      {surtaxUS && (
                        <div className="px-3 py-2 bg-negative/10 border border-negative/20 rounded text-xs">
                          <span className="font-medium text-negative">US surtax: +{surtaxUS.rate}%</span>
                          <span className="text-ink-muted ml-2">{surtaxUS.order}</span>
                          <div className="text-ink-faint mt-0.5">Effective US rate: {(item.us ?? item.m) + surtaxUS.rate}%</div>
                        </div>
                      )}
                      {surtaxCN && (
                        <div className="px-3 py-2 bg-negative/10 border border-negative/20 rounded text-xs">
                          <span className="font-medium text-negative">China surtax: +{surtaxCN.rate}%</span>
                          <span className="text-ink-muted ml-2">{surtaxCN.order}</span>
                          <div className="text-ink-faint mt-0.5">Effective CN rate: {item.m + surtaxCN.rate}%</div>
                        </div>
                      )}
                      {surtaxAll && !surtaxUS && (
                        <div className="px-3 py-2 bg-warn/10 border border-warn/20 rounded text-xs">
                          <span className="font-medium text-warn">Global surtax: +{surtaxAll.rate}%</span>
                          <span className="text-ink-muted ml-2">{surtaxAll.order}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Import sources */}
                {imp ? (
                  <div>
                    <h3 className="text-sm font-medium mb-3">Import sources (2025)</h3>
                    <div className="space-y-1.5">
                      {imp.c.map((c: any, i: number) => {
                        const pct = Math.round(c.v / imp.t * 100);
                        return (
                          <div key={c.k} className="flex items-center gap-3">
                            <div className="w-14 text-right text-xs font-medium" style={{ color: i === 0 ? '#3b82f6' : i === 1 ? '#f59e0b' : '#6b7280' }}>{c.n}</div>
                            <div className="flex-1 h-4 bg-surface-2 rounded overflow-hidden">
                              <div className="h-full rounded" style={{ width: pct + '%', background: i === 0 ? '#3b82f6' : i === 1 ? '#f59e0b' : '#4a5060' }} />
                            </div>
                            <div className="min-w-[80px] text-right text-xs font-mono">{fmtVal(c.v)} <span className="text-ink-faint">{pct}%</span></div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-right text-sm font-mono font-medium mt-2">Total: {fmtVal(imp.t)}</div>
                  </div>
                ) : (
                  <div className="text-xs text-ink-faint">No import data for this code.</div>
                )}

                {/* Risk */}
                {risk && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Risk assessment</h3>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={clsx('text-sm font-mono font-medium px-2.5 py-1 rounded', RISK_CLS[risk.level].bg, RISK_CLS[risk.level].text)}>
                        {risk.score}/100 — {RISK_CLS[risk.level].label}
                      </div>
                      <div className="text-xs text-ink-muted">HHI: {risk.hhi} ({risk.hhiLevel})</div>
                    </div>
                    {risk.factors.length > 0 && (
                      <div className="space-y-1">
                        {risk.factors.map((f, i) => (
                          <div key={i} className="text-xs text-ink-muted flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-warn shrink-0" />
                            {f}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Rules of Origin */}
                {roo && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Rules of origin</h3>
                    <div className="p-3 bg-surface-1 border border-border rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded',
                          roo.difficulty === 'easy' ? 'bg-positive/10 text-positive' :
                          roo.difficulty === 'hard' ? 'bg-negative/10 text-negative' : 'bg-warn/10 text-warn')}>
                          {roo.difficulty === 'easy' ? 'Likely qualifies' : roo.difficulty === 'hard' ? 'Complex rule' : 'Needs verification'}
                        </span>
                        <span className="font-mono text-xs text-ink-muted">{roo.type.toUpperCase()}</span>
                      </div>
                      <div className="text-xs text-ink-muted mt-1">CUSMA: {roo.cusma}</div>
                      <div className="text-xs text-ink-muted">CETA: {roo.ceta}</div>
                      <div className="text-[11px] text-ink-faint mt-2">{roo.note}</div>
                    </div>
                  </div>
                )}

                {/* Gazette alerts */}
                {relatedAlerts.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Regulatory alerts (Ch {item.c})</h3>
                    {relatedAlerts.map(g => (
                      <div key={g.id} className="px-3 py-2 mb-1.5 bg-surface-1 border-l-2 border-l-negative border border-border rounded-r text-xs">
                        <div className="flex gap-2 items-center mb-0.5">
                          <Badge t={g.sev} s={g.sev} />
                          <span className="text-ink-faint">{g.date}</span>
                        </div>
                        <div className="text-ink">{g.title}</div>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={() => toggle(item.h)}
                  className="text-xs bg-surface-2 border border-border text-ink-muted px-4 py-2 rounded hover:text-ink transition-colors">
                  {inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
