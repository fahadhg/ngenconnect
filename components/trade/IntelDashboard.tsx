'use client';

import { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { Factory, Users, Package, Globe2 } from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmtB = (v: number | null | undefined) => {
  if (v == null) return '—';
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Number(v).toLocaleString()}`;
};

const fmtPct = (v: string | number | null | undefined, showSign = true) => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return showSign ? `${n > 0 ? '+' : ''}${n.toFixed(1)}%` : `${n.toFixed(1)}%`;
};

const yoyColor = (v: string | number | null | undefined) => {
  const n = Number(v);
  if (isNaN(n)) return 'text-ink-muted';
  return n > 5 ? 'text-negative' : n < -5 ? 'text-positive' : 'text-warn';
};

const capColor = (r: number) =>
  r > 85 ? 'bg-negative' : r > 75 ? 'bg-warn' : 'bg-positive';

function Badge({ label, color }: { label: string; color: 'green' | 'red' | 'yellow' | 'blue' | 'orange' }) {
  const cls: Record<string, string> = {
    green:  'bg-positive/10 text-positive border-positive/20',
    red:    'bg-negative/10 text-negative border-negative/20',
    yellow: 'bg-warn/10 text-warn border-warn/20',
    blue:   'bg-accent/10 text-accent border-accent/20',
    orange: 'bg-[#F15A22]/10 text-[#F15A22] border-[#F15A22]/20',
  };
  return (
    <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full border', cls[color])}>
      {label}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3 mt-6 first:mt-0">
      {children}
    </div>
  );
}

function DataBanner({ source, generated }: { source?: string; generated?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-ink-faint mt-6 pt-4 border-t border-border">
      <span className="live-dot" />
      <span>{source}</span>
      {generated && <><span className="text-ink-muted">·</span><span>Data period: {generated}</span></>}
    </div>
  );
}

// ─── Module 1: Manufacturing Health ──────────────────────────────────────────
function MfgHealthModule() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/statcan/mfg-health');
      setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-12 text-center text-xs text-ink-faint">Loading…</div>;
  if (!data) return null;

  const sales: any[] = data.sales || [];
  const cap: any[] = data.capacity || [];
  const totalRow = sales.find((r: any) => r.naics === '31-33');
  const sectors = sales.filter((r: any) => r.naics !== '31-33');

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="p-3 bg-surface-2 rounded-lg border border-border">
          <div className="text-[10px] text-ink-faint mb-1">Total mfg sales</div>
          <div className="font-mono text-lg font-bold">{fmtB(totalRow?.value * 1e6)}</div>
          <div className={clsx('text-xs font-mono', yoyColor(totalRow?.yoy))}>{fmtPct(totalRow?.yoy)} YoY</div>
        </div>
        <div className="p-3 bg-surface-2 rounded-lg border border-border">
          <div className="text-[10px] text-ink-faint mb-1">Avg capacity util.</div>
          <div className="font-mono text-lg font-bold">
            {cap.length ? `${(cap.reduce((s: number, c: any) => s + c.rate, 0) / cap.length).toFixed(1)}%` : '—'}
          </div>
          <div className="text-xs text-ink-faint">{cap[0]?.period}</div>
        </div>
        <div className="p-3 bg-surface-2 rounded-lg border border-border">
          <div className="text-[10px] text-ink-faint mb-1">Top sector</div>
          <div className="text-sm font-semibold">Food mfg</div>
          <div className="font-mono text-xs text-ink-muted">{fmtB((sectors.find((r: any) => r.naics === '311')?.value || 0) * 1e6)}/mo</div>
        </div>
        <div className="p-3 bg-surface-2 rounded-lg border border-border">
          <div className="text-[10px] text-ink-faint mb-1">Period</div>
          <div className="text-sm font-semibold">{totalRow?.period}</div>
          <div className="text-xs text-ink-faint">Seasonally adj.</div>
        </div>
      </div>

      {/* Sales by sector */}
      <SectionTitle>Monthly Sales by Sector (CAD millions, seasonally adjusted)</SectionTitle>
      <div className="overflow-x-auto mb-5">
        <table className="w-full text-xs border-collapse zebra-table">
          <thead>
            <tr className="border-b border-border">
              {['Industry (NAICS)', 'Monthly sales', 'YoY change', 'Share of total'].map(h => (
                <th key={h} className="py-2 px-3 text-[10px] font-medium text-ink-faint uppercase tracking-wider text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectors.map((r: any) => {
              const share = totalRow?.value ? ((r.value / totalRow.value) * 100).toFixed(1) : '—';
              return (
                <tr key={r.naics} className="border-b border-border hover:bg-surface-2 transition-colors">
                  <td className="py-2 px-3">
                    <span className="font-medium">{r.industry}</span>
                    <span className="text-ink-faint ml-1.5 font-mono text-[10px]">{r.naics}</span>
                  </td>
                  <td className="py-2 px-3 font-mono">${r.value?.toLocaleString()}M</td>
                  <td className={clsx('py-2 px-3 font-mono font-medium', yoyColor(r.yoy))}>{fmtPct(r.yoy)}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-surface-1 rounded-full overflow-hidden">
                        <div className="h-full bg-accent/50 rounded-full" style={{ width: `${Math.min(parseFloat(share) * 3, 100)}%` }} />
                      </div>
                      <span className="text-ink-faint font-mono text-[10px]">{share}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Capacity utilization */}
      <SectionTitle>Capacity Utilization — {cap[0]?.period}</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {cap.map((c: any, i: number) => (
          <div key={i} className="p-2.5 bg-surface-2 rounded-lg border border-border">
            <div className="text-[10px] text-ink-faint truncate mb-1.5">{c.industry}</div>
            <div className="flex items-end justify-between mb-1">
              <span className={clsx('font-mono text-sm font-bold',
                c.rate > 85 ? 'text-negative' : c.rate > 75 ? 'text-warn' : 'text-positive')}>
                {c.rate}%
              </span>
              {c.rate > 85 && <Badge label="HIGH" color="red" />}
              {c.rate > 75 && c.rate <= 85 && <Badge label="MED" color="yellow" />}
              {c.rate <= 75 && <Badge label="SLACK" color="green" />}
            </div>
            <div className="h-1.5 bg-surface-1 rounded-full overflow-hidden">
              <div className={clsx('h-full rounded-full transition-all', capColor(c.rate))}
                style={{ width: `${c.rate}%` }} />
            </div>
          </div>
        ))}
      </div>

      <DataBanner source={data.source} generated={data.generated} />
    </div>
  );
}

// ─── Module 2: Labour ─────────────────────────────────────────────────────────
function LabourModule() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [province, setProvince] = useState('All');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/statcan/labour');
      setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-12 text-center text-xs text-ink-faint">Loading…</div>;
  if (!data) return null;

  const PROVINCES = ['All', 'Ontario', 'Quebec', 'British Columbia', 'Alberta'];
  const vacancies: any[] = (data.vacancies || []).filter((v: any) =>
    province === 'All' || (v.province || '').includes(province)
  );
  const flags: string[] = data.hardToFillFlags || [];
  const employment: any[] = data.employment || [];

  const totalVac = data.vacancies?.reduce((s: number, v: any) =>
    v.industry === 'Total manufacturing' ? s + (v.vacancies || 0) : s, 0) || 0;

  return (
    <div>
      {/* Alert banner */}
      {flags.length > 0 && (
        <div className="mb-5 p-3 bg-warn/5 border border-warn/20 rounded-lg">
          <div className="text-[10px] font-semibold text-warn uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span>⚠</span> Hard-to-fill roles in advanced manufacturing
          </div>
          <div className="space-y-1">
            {flags.map((f, i) => (
              <div key={i} className="text-xs text-ink">{f}</div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <div className="p-3 bg-surface-2 rounded-lg border border-border">
          <div className="text-[10px] text-ink-faint mb-1">Total mfg vacancies (CA)</div>
          <div className="font-mono text-lg font-bold">{totalVac.toLocaleString()}</div>
          <div className="text-xs text-ink-faint">{data.vacancies?.[0]?.period}</div>
        </div>
        <div className="p-3 bg-surface-2 rounded-lg border border-border">
          <div className="text-[10px] text-ink-faint mb-1">Mfg employment</div>
          <div className="font-mono text-lg font-bold">
            {employment.find((e: any) => e.naics === '31-33')?.employed?.toFixed(0)}K
          </div>
          <div className="text-xs text-ink-faint">employees</div>
        </div>
        <div className="p-3 bg-surface-2 rounded-lg border border-border">
          <div className="text-[10px] text-ink-faint mb-1">Flagged roles</div>
          <div className="font-mono text-lg font-bold text-warn">{flags.length}</div>
          <div className="text-xs text-ink-faint">high-stress specialties</div>
        </div>
      </div>

      {/* Province filter */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {PROVINCES.map(p => (
          <button key={p} onClick={() => setProvince(p)}
            className={clsx('text-[10px] px-2.5 py-1 rounded-full border transition-colors',
              province === p
                ? 'bg-accent/10 border-accent/30 text-accent'
                : 'border-border text-ink-muted hover:border-border-hover hover:text-ink'
            )}>
            {p}
          </button>
        ))}
      </div>

      <SectionTitle>Job Vacancies by Industry & Province</SectionTitle>
      <div className="overflow-x-auto mb-5">
        <table className="w-full text-xs border-collapse zebra-table">
          <thead>
            <tr className="border-b border-border">
              {['Industry', 'Province', 'Vacancies', 'Rate', 'Period'].map(h => (
                <th key={h} className="py-2 px-3 text-[10px] font-medium text-ink-faint uppercase tracking-wider text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vacancies.map((v: any, i: number) => (
              <tr key={i} className="border-b border-border hover:bg-surface-2 transition-colors">
                <td className="py-2 px-3 font-medium">{v.industry}</td>
                <td className="py-2 px-3 text-ink-muted">{v.province}</td>
                <td className="py-2 px-3 font-mono font-medium">{v.vacancies?.toLocaleString()}</td>
                <td className="py-2 px-3">
                  {v.rate != null && (
                    <span className={clsx('font-mono', v.rate > 5 ? 'text-negative' : v.rate > 4 ? 'text-warn' : 'text-ink-muted')}>
                      {v.rate}%
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-ink-faint font-mono">{v.period}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>Manufacturing Employment by Sector</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {employment.filter((e: any) => e.naics !== '31-33').map((e: any, i: number) => (
          <div key={i} className="p-2.5 bg-surface-2 rounded-lg border border-border">
            <div className="text-[10px] text-ink-faint truncate mb-1">{e.industry}</div>
            <div className="font-mono text-sm font-bold">{e.employed?.toFixed(1)}K</div>
            <div className="text-[10px] text-ink-faint">{e.period}</div>
          </div>
        ))}
      </div>

      <DataBanner source={data.source} generated={data.generated} />
    </div>
  );
}

// ─── Module 3: Input Costs ────────────────────────────────────────────────────
function InputCostModule() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/statcan/input-costs');
      setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-12 text-center text-xs text-ink-faint">Loading…</div>;
  if (!data) return null;

  const alerts: any[]  = data.alerts  || [];
  const ippi: any[]    = data.ippi    || [];
  const rmpi: any[]    = data.rmpi    || [];

  return (
    <div>
      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-5">
          <SectionTitle>Price Spike Alerts (|YoY| &gt; 5%)</SectionTitle>
          <div className="space-y-2">
            {alerts.map((a: any, i: number) => (
              <div key={i} className={clsx(
                'flex items-center justify-between px-4 py-2.5 rounded-lg border text-xs',
                a.severity === 'high' ? 'bg-negative/5 border-negative/20' : 'bg-warn/5 border-warn/20'
              )}>
                <div>
                  <span className="font-medium">{a.product}</span>
                  <span className="text-ink-faint ml-2 text-[10px]">Index: {a.latest?.toFixed?.(1) ?? a.latest}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={clsx('font-mono font-semibold text-sm', a.yoy > 0 ? 'text-negative' : 'text-positive')}>
                    {fmtPct(a.yoy)}
                  </span>
                  <Badge label={a.severity === 'high' ? 'CRITICAL' : 'WATCH'} color={a.severity === 'high' ? 'red' : 'yellow'} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* IPPI table */}
      <SectionTitle>Industrial Product Price Index (IPPI) — 2012=100</SectionTitle>
      <div className="overflow-x-auto mb-5">
        <table className="w-full text-xs border-collapse zebra-table">
          <thead>
            <tr className="border-b border-border">
              {['Product', 'Latest (2025-01)', 'YoY', '3-month trend'].map(h => (
                <th key={h} className="py-2 px-3 text-[10px] font-medium text-ink-faint uppercase tracking-wider text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ippi.map((p: any, i: number) => {
              const latest = p.latest?.[0]?.index;
              const prev3  = p.latest?.[3]?.index;
              const trend3 = latest && prev3 ? ((Number(latest) - Number(prev3)) / Number(prev3) * 100).toFixed(1) : null;
              return (
                <tr key={i} className="border-b border-border hover:bg-surface-2 transition-colors">
                  <td className="py-2 px-3 font-medium">{p.product}</td>
                  <td className="py-2 px-3 font-mono">{Number(latest).toFixed(1)}</td>
                  <td className={clsx('py-2 px-3 font-mono font-medium', yoyColor(p.yoy))}>{fmtPct(p.yoy)}</td>
                  <td className={clsx('py-2 px-3 font-mono text-[11px]', trend3 ? yoyColor(trend3) : 'text-ink-faint')}>
                    {trend3 ? fmtPct(trend3) : '—'} (3mo)
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* RMPI cards */}
      <SectionTitle>Raw Materials Price Index (RMPI) — 2012=100</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {rmpi.map((c: any, i: number) => {
          const latest = c.latest?.[0]?.index;
          return (
            <div key={i} className="p-3 bg-surface-2 rounded-lg border border-border">
              <div className="text-[10px] text-ink-faint mb-1 truncate">{c.commodity}</div>
              <div className="font-mono text-lg font-bold">{Number(latest).toFixed(1)}</div>
              <div className={clsx('text-xs font-mono font-medium mt-0.5', yoyColor(c.yoy))}>
                {fmtPct(c.yoy)} YoY
              </div>
              <div className="mt-2 text-[10px] text-ink-faint">{c.latest?.[0]?.period}</div>
            </div>
          );
        })}
      </div>

      <DataBanner source={data.source} generated={data.generated} />
    </div>
  );
}

// ─── Module 4: Export Intel ───────────────────────────────────────────────────
function ExportIntelModule() {
  const [data, setData]           = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [hsInput, setHsInput]     = useState('');
  const [submitted, setSubmitted] = useState('');
  const [chapterData, setChapterData] = useState<any>(null);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/statcan/exports');
      setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  const handleSearch = async () => {
    setSubmitted(hsInput);
    try {
      const digits = hsInput.replace(/\./g, '');
      const res = await fetch(`/api/statcan/exports?hs=${digits}`);
      setChapterData(await res.json());
    } catch { /* ignore */ }
  };

  if (loading) return <div className="py-12 text-center text-xs text-ink-faint">Loading…</div>;
  if (!data) return null;

  const tops: any[]    = (chapterData?.topDestinations || data.topDestinations || []);
  const rates: any     = chapterData?.partnerRates || data.partnerRates || {};
  const chapterNote: any = chapterData?.chapterNote;
  const chapterPrefix  = submitted ? submitted.replace(/\./g, '').slice(0, 2) : '';

  const PARTNERS = [
    { code: 'US', name: 'United States',   fta: 'CUSMA' },
    { code: 'EU', name: 'European Union',  fta: 'CETA' },
    { code: 'UK', name: 'United Kingdom',  fta: 'CUKTCA' },
    { code: 'JP', name: 'Japan',           fta: 'CPTPP' },
    { code: 'MX', name: 'Mexico',          fta: 'CUSMA' },
    { code: 'KR', name: 'South Korea',     fta: 'CKFTA' },
    { code: 'CN', name: 'China',           fta: null },
    { code: 'IN', name: 'India',           fta: null },
    { code: 'AU', name: 'Australia',       fta: 'CPTPP' },
    { code: 'SG', name: 'Singapore',       fta: 'CPTPP' },
  ];

  // Total exports for share bars
  const totalExports = data.topDestinations?.[0]?.value || 1;

  return (
    <div>
      {/* Search bar */}
      <div className="flex gap-2 mb-5">
        <input
          value={hsInput}
          onChange={e => setHsInput(e.target.value)}
          placeholder="Enter HS chapter (e.g. 73, 84, 87) or HS code prefix…"
          className="flex-1 bg-surface-2 border border-border rounded px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/40"
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
        />
        <button onClick={handleSearch}
          className="text-xs bg-accent/10 border border-accent/20 text-accent px-4 py-1.5 rounded hover:bg-accent/20">
          Analyze
        </button>
      </div>

      {/* Chapter note */}
      {chapterNote && (
        <div className="mb-4 p-3 bg-warn/5 border border-warn/20 rounded-lg text-xs">
          <span className="font-semibold text-warn">⚠ Chapter {chapterPrefix} note: </span>
          <span className="text-ink">{chapterNote.note}</span>
        </div>
      )}

      {/* Partner tariff matrix — shown when HS entered */}
      {chapterPrefix && (
        <>
          <SectionTitle>Tariff Rates for Chapter {chapterPrefix} by Partner</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-5">
            {PARTNERS.map(p => {
              const rateMap = rates[p.code];
              const rate = rateMap?.[chapterPrefix] ?? rateMap?.['default'] ?? null;
              return (
                <div key={p.code} className="p-2.5 bg-surface-2 rounded-lg border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold">{p.code}</span>
                    {p.fta
                      ? <Badge label={p.fta} color="green" />
                      : <Badge label="No FTA" color="red" />
                    }
                  </div>
                  <div className="text-[10px] text-ink-faint mb-2">{p.name}</div>
                  <div className={clsx('font-mono text-xl font-bold',
                    rate === 0 ? 'text-positive' : rate != null && rate >= 25 ? 'text-negative' : 'text-warn')}>
                    {rate == null ? '—' : rate === 0 ? 'Free' : `${rate}%`}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Top export destinations */}
      <SectionTitle>
        Top Export Destinations {submitted ? `— Chapter ${chapterPrefix}` : '(All goods, 2024)'}
      </SectionTitle>
      <div className="overflow-x-auto mb-5">
        <table className="w-full text-xs border-collapse zebra-table">
          <thead>
            <tr className="border-b border-border">
              {['Country', 'Share', 'Value (2024)', 'FTA', chapterPrefix ? `Rate (ch ${chapterPrefix})` : 'FTA rate'].map(h => (
                <th key={h} className="py-2 px-3 text-[10px] font-medium text-ink-faint uppercase tracking-wider text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tops.slice(0, 12).map((d: any, i: number) => {
              const pct = tops[0]?.share ?? (d.value / totalExports * 100);
              return (
                <tr key={i} className="border-b border-border hover:bg-surface-2 transition-colors">
                  <td className="py-2 px-3 font-medium">{d.name || d.country}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-surface-1 rounded-full overflow-hidden">
                        <div className="h-full bg-accent/50 rounded-full"
                          style={{ width: `${Math.min((d.share ?? pct), 100)}%` }} />
                      </div>
                      <span className="font-mono text-ink-faint">{(d.share ?? pct).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 font-mono">{fmtB(d.value)}</td>
                  <td className="py-2 px-3">
                    {d.hasFTA
                      ? <Badge label={d.ftaName || 'FTA'} color="green" />
                      : <Badge label="MFN only" color="red" />
                    }
                  </td>
                  <td className="py-2 px-3 font-mono">
                    {d.tariffRate == null
                      ? <span className="text-ink-faint">—</span>
                      : d.tariffRate === 0
                        ? <span className="text-positive font-semibold">Free</span>
                        : <span className={d.tariffRate >= 25 ? 'text-negative font-semibold' : 'text-warn'}>
                            {d.tariffRate}%
                          </span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DataBanner source={data.source} generated={data.generated} />
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
const MODULES = [
  { id: 'mfg',    label: 'Mfg Health',    icon: Factory, sub: 'Sales · Capacity utilization' },
  { id: 'labour', label: 'Labour',         icon: Users, sub: 'Vacancies · Employment' },
  { id: 'costs',  label: 'Input Costs',   icon: Package, sub: 'IPPI · RMPI · Alerts' },
  { id: 'export', label: 'Export Intel',  icon: Globe2, sub: 'Partners · Tariff rates' },
] as const;

export default function IntelDashboard() {
  const [active, setActive] = useState<string>('mfg');
  const current = MODULES.find(m => m.id === active)!;
  const CurrentIcon = current.icon;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1.5">Intel Modules</h1>
        <p className="text-sm text-ink-muted">
          Statistics Canada data · CBSA T2026 tariff overlay · Updated periodically
        </p>
      </div>

      {/* Module tabs */}
      <div className="bg-surface-1 border border-border rounded-t-lg overflow-hidden">
        <div className="flex gap-0 overflow-x-auto scrollbar-hide">
          {MODULES.map(m => {
            const Icon = m.icon;
            const isActive = active === m.id;
            return (
              <button key={m.id} onClick={() => setActive(m.id)}
                className={clsx(
                  'px-4 py-3 text-sm whitespace-nowrap transition-all shrink-0 flex items-center gap-2 border-b-2',
                  isActive 
                    ? 'text-ink font-medium border-ngen bg-surface-2' 
                    : 'text-ink-muted hover:text-ink border-transparent hover:bg-surface-2'
                )}>
                <Icon className="w-4 h-4" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Module card */}
      <div className="p-6 bg-surface-1 border border-border border-t-0 rounded-b-lg animate-fade-in">
        <div className="mb-6 pb-4 border-b border-border flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center">
                <CurrentIcon className="w-5 h-5 text-ngen" />
              </div>
              <h2 className="text-lg font-semibold">{current.label}</h2>
            </div>
            <p className="text-sm text-ink-muted">{current.sub}</p>
          </div>
        </div>

        {active === 'mfg'    && <MfgHealthModule />}
        {active === 'labour' && <LabourModule />}
        {active === 'costs'  && <InputCostModule />}
        {active === 'export' && <ExportIntelModule />}
      </div>

      {/* Footer */}
      <div className="mt-6 text-xs text-ink-faint text-center">
        <p className="leading-relaxed">StatsCan tables: 16-10-0117-01 · 16-10-0014-01 · 14-10-0325-01 · 18-10-0034-01 · 18-10-0267-01 · 12-10-0011-01</p>
      </div>
    </div>
  );
}
