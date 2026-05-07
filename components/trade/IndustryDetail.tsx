'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  TariffItem, ImportOverlay, USRatesOverlay, SurtaxOverlay, HSSection,
  CHAPTER_NAMES, FTA_LABELS, FTA_COLORS, GAZETTE_ALERTS,
  getHS6, getBestFTA, fmtVal, findSurtax,
} from '@/lib/trade/data';
import { assessRisk } from '@/lib/trade/analysis';
import { getROO } from '@/lib/trade/roo';
import { HS_SLUG_TO_SECTOR } from '@/lib/trade/sectorHsMap';

const PG = 50;

const RISK_CLS = {
  low: { bg: 'bg-positive/10', text: 'text-positive', label: 'Low' },
  med: { bg: 'bg-warn/10', text: 'text-warn', label: 'Medium' },
  high: { bg: 'bg-negative/10', text: 'text-negative', label: 'High' },
  critical: { bg: 'bg-negative/20', text: 'text-negative', label: 'Critical' },
};

const SEV_CLS = {
  high: 'bg-negative/10 text-negative',
  med: 'bg-warn/10 text-warn',
  low: 'bg-accent/10 text-accent',
};

function Badge({ t, s }: { t: string; s: 'high' | 'med' | 'low' }) {
  return <span className={clsx('inline-block text-[11px] font-medium px-2 py-0.5 rounded', SEV_CLS[s])}>{t}</span>;
}

interface Props {
  section: HSSection;
  codes: TariffItem[];
  importData: ImportOverlay;
  usRates: USRatesOverlay;
  surtaxData: SurtaxOverlay;
}

function logTradeNav(event: string, data: Record<string, string>) {
  try {
    const key = "ngen_trade_nav";
    const prev = JSON.parse(localStorage.getItem(key) ?? "[]");
    prev.push({ event, ...data, ts: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(prev.slice(-200)));
  } catch {}
}

function FindSuppliersButton({ section }: { section: HSSection }) {
  const router = useRouter();
  const sector = HS_SLUG_TO_SECTOR[section.slug];
  const query = encodeURIComponent(`${section.name} manufacturers Canada`);
  const href = sector
    ? `/?q=${query}&sector=${encodeURIComponent(sector)}`
    : `/?q=${query}`;

  return (
    <button
      onClick={() => {
        logTradeNav("trade_to_connect", { slug: section.slug, sector: sector ?? "", query: section.name });
        router.push(href);
      }}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
      style={{ background: '#C8102E', color: '#fff' }}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      Find Canadian Suppliers
    </button>
  );
}

export default function IndustryDetail({ section, codes, importData, usRates, surtaxData }: Props) {
  const [q, setQ] = useState('');
  const [chapterFilter, setChapterFilter] = useState('all');
  const [rateFilter, setRateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('imp');
  const [pg, setPg] = useState(0);
  const [detailHS, setDetailHS] = useState<string | null>(null);
  const [wl, setWl] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try { const s = localStorage.getItem('tm-wl2'); if (s) setWl(JSON.parse(s)); } catch { }
  }, []);
  useEffect(() => {
    if (mounted) try { localStorage.setItem('tm-wl2', JSON.stringify(wl)); } catch { }
  }, [wl, mounted]);

  const toggle = (hs: string) => setWl(p => p.includes(hs) ? p.filter(h => h !== hs) : [...p, hs]);

  const getImp = (hs: string) => importData[hs] || importData[getHS6(hs)] || null;

  // Chapter options for filter
  const chapters = useMemo(() => [...new Set(codes.map(r => r.c))].sort((a, b) => a - b), [codes]);

  // Filtered + sorted codes
  const filtered = useMemo(() => {
    let f = [...codes];
    if (chapterFilter !== 'all') f = f.filter(r => r.c === Number(chapterFilter));
    if (rateFilter === 'dutiable') f = f.filter(r => r.m > 0);
    else if (rateFilter === 'free') f = f.filter(r => r.m === 0);
    if (q) { const lq = q.toLowerCase(); f = f.filter(r => r.h.toLowerCase().includes(lq) || r.d.toLowerCase().includes(lq)); }
    if (sortBy === 'imp') f.sort((a, b) => (getImp(b.h)?.t || 0) - (getImp(a.h)?.t || 0));
    else if (sortBy === 'rate') f.sort((a, b) => (b.m || 0) - (a.m || 0));
    else if (sortBy === 'hs') f.sort((a, b) => a.h.localeCompare(b.h));
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes, q, chapterFilter, rateFilter, sortBy]);

  // Reset page when filters change
  useEffect(() => { setPg(0); }, [q, chapterFilter, rateFilter, sortBy]);

  const paged = useMemo(() => filtered.slice(pg * PG, (pg + 1) * PG), [filtered, pg]);
  const totalPg = Math.ceil(filtered.length / PG);

  // Chapter breakdown stats
  const chapterStats = useMemo(() => chapters.map(c => {
    const cCodes = codes.filter(r => r.c === c);
    const totalImp = cCodes.reduce((s, r) => s + (getImp(r.h)?.t || 0), 0);
    const dutiable = cCodes.filter(r => r.m > 0).length;
    return { c, name: CHAPTER_NAMES[c] || `Ch ${c}`, count: cCodes.length, dutiable, totalImp };
  }).sort((a, b) => b.totalImp - a.totalImp), [chapters, codes]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

      {/* Breadcrumb */}
      <nav className="text-[11px] text-ink-faint mb-4 flex items-center gap-1.5 flex-wrap">
        <Link href="/trade" className="hover:text-ink-muted transition-colors">ResilienceHQ</Link>
        <span>›</span>
        <Link href="/trade" className="hover:text-ink-muted transition-colors">Industries</Link>
        <span>›</span>
        <span className="text-ink-muted">{section.name}</span>
      </nav>

      {/* Section header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">{section.name}</h1>
        <p className="text-sm text-ink-muted mb-4">{section.description}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-surface-1 border border-border rounded-lg p-3">
            <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">Total Imports</div>
            <div className="font-mono text-lg font-semibold" style={{ color: '#C8102E' }}>
              {section.totalImports > 0 ? fmtVal(section.totalImports) : '—'}
            </div>
          </div>
          <div className="bg-surface-1 border border-border rounded-lg p-3">
            <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">HS Codes</div>
            <div className="font-mono text-lg font-semibold">{section.codeCount.toLocaleString()}</div>
          </div>
          <div className="bg-surface-1 border border-border rounded-lg p-3">
            <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">Dutiable</div>
            <div className="font-mono text-lg font-semibold">{section.dutiableCount.toLocaleString()}</div>
          </div>
          <div className="bg-surface-1 border border-border rounded-lg p-3">
            <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1">Under Surtax</div>
            <div className="font-mono text-lg font-semibold" style={section.surtaxAffected > 0 ? { color: '#ef4444' } : undefined}>
              {section.surtaxAffected}
            </div>
          </div>
        </div>

        {/* Top sources + Find Suppliers CTA */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {section.topSources.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-ink-faint uppercase tracking-wider">Top import sources:</span>
              {section.topSources.map((s, i) => (
                <span key={s.k} className="text-xs text-ink-muted">
                  <span className="font-medium" style={{ color: i === 0 ? '#3b82f6' : i === 1 ? '#f59e0b' : undefined }}>{s.n}</span>
                  <span className="text-ink-faint ml-1">{fmtVal(s.v)}</span>
                </span>
              ))}
            </div>
          )}
          <FindSuppliersButton section={section} />
        </div>
      </div>

      {/* Chapter breakdown */}
      {chapterStats.length > 1 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium mb-2">By Chapter</h2>
          <div className="flex flex-wrap gap-2">
            {chapterStats.map(cs => (
              <button
                key={cs.c}
                onClick={() => setChapterFilter(chapterFilter === String(cs.c) ? 'all' : String(cs.c))}
                className={clsx(
                  'px-3 py-1.5 rounded border text-xs transition-colors',
                  chapterFilter === String(cs.c)
                    ? 'border-[#F15A22]/50 bg-[#F15A22]/10 text-[#F15A22]'
                    : 'border-border text-ink-muted hover:border-border/80 hover:text-ink'
                )}
              >
                <span className="font-mono">Ch {cs.c}</span>
                <span className="ml-1.5 text-ink-faint">{cs.name}</span>
                <span className="ml-2 text-[10px]">{cs.count} · {cs.totalImp > 0 ? fmtVal(cs.totalImp) : '—'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search HS code or description…"
          className="flex-1 min-w-[200px] max-w-xs bg-surface-2 border border-border rounded px-3 py-1.5 text-xs placeholder:text-ink-faint focus:outline-none focus:border-accent/40"
        />
        <select
          value={rateFilter}
          onChange={e => setRateFilter(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-ink-muted focus:outline-none"
        >
          <option value="all">All rates</option>
          <option value="dutiable">Dutiable only</option>
          <option value="free">Free only</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-ink-muted focus:outline-none"
        >
          <option value="imp">Sort: Import value</option>
          <option value="rate">Sort: MFN rate</option>
          <option value="hs">Sort: HS code</option>
        </select>
        <span className="text-[11px] text-ink-faint ml-auto">{filtered.length.toLocaleString()} codes</span>
        <Link
          href="/trade/browse"
          className="text-xs border border-border text-ink-muted hover:text-ink hover:border-[#F15A22]/30 px-3 py-1.5 rounded transition-colors"
        >
          Open in full toolkit →
        </Link>
      </div>

      {/* HS codes table */}
      <div className="bg-surface-1 border border-border rounded-lg overflow-hidden mb-4">
        <div className="grid grid-cols-[140px_1fr_80px_90px_130px_60px] gap-0 px-4 py-2 border-b border-border bg-surface-2/50 text-[10px] text-ink-faint uppercase tracking-wider">
          <span>HS Code</span>
          <span>Description</span>
          <span className="text-right">MFN</span>
          <span className="text-right">Best FTA</span>
          <span className="text-right">Top Source</span>
          <span className="text-right">Surtax</span>
        </div>
        {paged.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-ink-faint">No codes match your filters.</div>
        )}
        {paged.map(item => {
          const imp = getImp(item.h);
          const best = getBestFTA(item);
          const surtaxUS = findSurtax(surtaxData, item.h, 'US');
          const surtaxCN = findSurtax(surtaxData, item.h, 'CN');
          const surtaxAll = findSurtax(surtaxData, item.h, 'ALL');
          const hasSurtax = !!(surtaxUS || surtaxCN || surtaxAll);
          const topSource = imp?.c?.[0];
          return (
            <button
              key={item.h}
              onClick={() => setDetailHS(item.h)}
              className="w-full grid grid-cols-[140px_1fr_80px_90px_130px_60px] gap-0 px-4 py-2.5 border-b border-border/50 hover:bg-surface-2 transition-colors text-left group"
            >
              <span className="font-mono text-xs text-accent group-hover:underline">{item.h}</span>
              <span className="text-xs text-ink-muted truncate pr-2">{item.d}</span>
              <span className={clsx('text-xs font-mono text-right', item.m > 0 ? 'text-warn' : 'text-positive')}>
                {item.m === 0 ? 'Free' : item.m + '%'}
              </span>
              <span className="text-xs text-right">
                {best ? (
                  <span className="text-positive">{best.rate === 0 ? 'Free' : best.rate + '%'}</span>
                ) : (
                  <span className="text-ink-faint">—</span>
                )}
              </span>
              <span className="text-[11px] text-right text-ink-muted truncate">
                {topSource ? (
                  <span>{topSource.n} <span className="text-ink-faint">{fmtVal(topSource.v)}</span></span>
                ) : '—'}
              </span>
              <span className="text-right">
                {hasSurtax && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-negative/10 text-negative">
                    +{(surtaxUS || surtaxCN || surtaxAll)!.rate}%
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPg > 1 && (
        <div className="flex items-center justify-between text-xs text-ink-muted mb-6">
          <button
            onClick={() => setPg(p => Math.max(0, p - 1))}
            disabled={pg === 0}
            className="px-3 py-1.5 border border-border rounded disabled:opacity-30 hover:text-ink transition-colors"
          >
            ← Previous
          </button>
          <span>Page {pg + 1} of {totalPg} ({filtered.length.toLocaleString()} codes)</span>
          <button
            onClick={() => setPg(p => Math.min(totalPg - 1, p + 1))}
            disabled={pg >= totalPg - 1}
            className="px-3 py-1.5 border border-border rounded disabled:opacity-30 hover:text-ink transition-colors"
          >
            Next →
          </button>
        </div>
      )}

      {/* Disclaimer */}
      <div className="text-[10px] text-ink-faint border-t border-border pt-4">
        Verify all rates with CBSA or a licensed customs broker before making sourcing decisions. Data: CBSA T2026 · StatsCan CIMT 2025 · surtax snapshot {surtaxData.generated}.
      </div>

      {/* ══════════ HS CODE DETAIL PANEL ══════════ */}
      {detailHS && (() => {
        const item = codes.find(r => r.h === detailHS);
        if (!item) { setDetailHS(null); return null; }
        const imp = getImp(item.h);
        const best = getBestFTA(item);
        const risk = assessRisk(item, imp);
        const roo = getROO(item.c);
        const inWatchlist = wl.includes(item.h);
        const relatedAlerts = GAZETTE_ALERTS.filter(g => (g.chs as number[]).includes(item.c));
        const keys = ['us', 'mx', 'eu', 'cp', 'uk', 'jp', 'kr'] as const;
        const allRates: { key: string; label: string; rate: number; color: string }[] = keys
          .filter(k => item[k] != null)
          .map(k => ({ key: k, label: FTA_LABELS[k], rate: item[k] || 0, color: FTA_COLORS[k] }));
        allRates.push({ key: 'mfn', label: 'MFN', rate: item.m, color: FTA_COLORS.mfn });
        allRates.sort((a, b) => a.rate - b.rate);
        const maxRate = Math.max(...allRates.map(r => r.rate), 1);
        const usRate = usRates[item.h.replace(/\./g, '').slice(0, 6)];
        const surtaxUS = findSurtax(surtaxData, item.h, 'US');
        const surtaxCN = findSurtax(surtaxData, item.h, 'CN');
        const surtaxAll = findSurtax(surtaxData, item.h, 'ALL');

        return (
          <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDetailHS(null)}>
            <div className="absolute inset-0 bg-black/50" />
            <div
              className="relative w-full max-w-xl bg-surface-0 border-l border-border overflow-y-auto slide-in"
              onClick={e => e.stopPropagation()}
            >

              {/* Header */}
              <div className="sticky top-0 bg-surface-0 border-b border-border px-5 py-4 flex justify-between items-start z-10">
                <div>
                  <div className="font-mono text-lg font-medium text-accent">{item.h}</div>
                  <div className="text-sm text-ink-muted mt-0.5">{item.d}</div>
                  <div className="text-xs text-ink-faint mt-1">Ch {item.c}: {CHAPTER_NAMES[item.c]} · UOM: {item.u}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggle(item.h)}
                    className={clsx('text-xs px-3 py-1.5 rounded border transition-colors',
                      inWatchlist ? 'border-warn/30 bg-warn/10 text-warn' : 'border-border text-ink-muted hover:text-accent hover:border-accent/30')}
                  >
                    {inWatchlist ? '★ In watchlist' : '☆ Add to watchlist'}
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
                  {item.g != null && <div className="text-[11px] text-ink-faint mt-2">General tariff (Column 2): {item.g}%</div>}
                  {usRate !== undefined && <div className="text-[11px] text-ink-faint">US HTS general rate: {usRate}% <span className="text-ink-faint/60">(USITC)</span></div>}
                  {best && item.m > 0 && (
                    <div className="mt-2 px-3 py-2 bg-positive/8 border border-positive/15 rounded text-xs text-positive">
                      Best: {best.label} at {best.rate === 0 ? 'Free' : best.rate + '%'} — saves {Math.round((item.m - best.rate) / item.m * 100)}% vs MFN
                    </div>
                  )}
                  {(surtaxUS || surtaxCN || surtaxAll) && (
                    <div className="mt-2 space-y-1.5">
                      {surtaxUS && <div className="px-3 py-2 bg-negative/10 border border-negative/20 rounded text-xs">
                        <span className="font-medium text-negative">US surtax active: +{surtaxUS.rate}%</span>
                        <span className="text-ink-muted ml-2">{surtaxUS.order} ({surtaxUS.cn})</span>
                        <div className="text-ink-faint mt-0.5">Real US rate: {(item.us ?? item.m) + surtaxUS.rate}% (CUSMA {item.us ?? item.m}% + surtax {surtaxUS.rate}%)</div>
                      </div>}
                      {surtaxCN && <div className="px-3 py-2 bg-negative/10 border border-negative/20 rounded text-xs">
                        <span className="font-medium text-negative">China surtax active: +{surtaxCN.rate}%</span>
                        <span className="text-ink-muted ml-2">{surtaxCN.order} ({surtaxCN.cn})</span>
                        <div className="text-ink-faint mt-0.5">Real CN rate: {item.m + surtaxCN.rate}% (MFN {item.m}% + surtax {surtaxCN.rate}%)</div>
                      </div>}
                      {surtaxAll && !surtaxUS && <div className="px-3 py-2 bg-warn/10 border border-warn/20 rounded text-xs">
                        <span className="font-medium text-warn">Global surtax: +{surtaxAll.rate}%</span>
                        <span className="text-ink-muted ml-2">{surtaxAll.order} ({surtaxAll.cn})</span>
                        <div className="text-ink-faint mt-0.5">Applies to all origins. Non-stackable: doesn&apos;t apply if US/CN steel surtax already applies.</div>
                      </div>}
                    </div>
                  )}
                </div>

                {/* Import data */}
                {imp && (
                  <div>
                    <h3 className="text-sm font-medium mb-3">Import sources (2025)</h3>
                    <div className="space-y-1.5">
                      {imp.c.map((c: { k: string; n: string; v: number }, i: number) => {
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
                )}
                {!imp && <div className="text-xs text-ink-faint">No import data available for this code.</div>}

                {/* Risk assessment */}
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
                        {risk.factors.map((f: string, i: number) => (
                          <div key={i} className="text-xs text-ink-muted flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-warn shrink-0" />
                            {f}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-3 mt-2 text-xs text-ink-muted">
                      <span>{risk.isAllied ? <span className="text-positive">Allied origin</span> : <span className="text-negative">Non-allied</span>}</span>
                      <span>{risk.hasFTA ? <span className="text-positive">FTA available ({risk.ftaSaving}% saving)</span> : 'No FTA advantage'}</span>
                    </div>
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

                {/* Gazette alerts for this chapter */}
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

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Link
                    href="/trade/browse"
                    className="text-xs bg-accent/10 border border-accent/20 text-accent px-4 py-2 rounded hover:bg-accent/20 transition-colors"
                  >
                    Open in full toolkit
                  </Link>
                  <button
                    onClick={() => toggle(item.h)}
                    className="text-xs bg-surface-2 border border-border text-ink-muted px-4 py-2 rounded hover:text-ink transition-colors"
                  >
                    {inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
