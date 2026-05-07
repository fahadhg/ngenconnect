import Link from 'next/link';
import { loadAllData } from '@/lib/trade/loadData';
import { fmtVal } from '@/lib/trade/data';
import type { HSSection } from '@/lib/trade/data';
import type { Metadata } from 'next';
import {
  BarChart3, Bot, SlidersHorizontal, Banknote,
  Globe2, AlertTriangle, Link2, Newspaper,
} from 'lucide-react';
import TradeGlobeWrapper from '@/components/trade/TradeGlobeWrapper';

export const metadata: Metadata = {
  title: 'Trade Intelligence — NGen Connect',
  description: 'Live CBSA tariff data, StatsCan import analytics, and surtax monitoring for Canadian manufacturers.',
};

function StatTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-surface-1 border border-border rounded-lg p-4 hover:border-border-hover transition-colors">
      <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-1.5">{label}</div>
      <div className={`font-mono text-xl font-semibold ${accent ? 'text-ngen' : 'text-ink'}`}>{value}</div>
      {sub && <div className="text-[10px] text-ink-faint mt-1.5">{sub}</div>}
    </div>
  );
}

function SectionCard({ sec }: { sec: HSSection }) {
  const hasImports = sec.totalImports > 0;
  return (
    <Link
      href={`/trade/industries/${sec.slug}`}
      className="block p-4 bg-surface-1 border border-border rounded-lg hover:border-ngen/50 hover:bg-surface-2/80 transition-all group"
    >
      <div className="font-medium text-sm mb-1.5 group-hover:text-ngen transition-colors leading-snug">{sec.name}</div>
      <div className="text-xs text-ink-faint mb-3 leading-relaxed line-clamp-2">{sec.description}</div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] text-ink-faint uppercase tracking-wider mb-0.5">Imports</div>
          <div className="font-mono text-sm font-medium">{hasImports ? fmtVal(sec.totalImports) : '—'}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-ink-muted">{sec.codeCount.toLocaleString()} codes</div>
          {sec.surtaxAffected > 0 && (
            <div className="text-[10px] font-medium text-negative">{sec.surtaxAffected} surtaxed</div>
          )}
        </div>
      </div>
      {sec.topSources.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-border/50 text-[10px] text-ink-faint truncate">
          Top: {sec.topSources.slice(0, 3).map(s => s.n).join(' · ')}
        </div>
      )}
    </Link>
  );
}

const TOOLS = [
  { icon: BarChart3,       label: 'BOM Analyzer',   desc: 'Upload CSV, calculate duties & FTA savings' },
  { icon: Bot,             label: 'AI Classifier',  desc: 'Claude-powered HS code suggestions' },
  { icon: SlidersHorizontal, label: 'What-If Modeler', desc: 'Scenario surtax impact analysis' },
  { icon: Banknote,        label: 'Drawback Calc',  desc: '3-method duty refund estimates' },
  { icon: Globe2,          label: 'FTA Gap',        desc: 'Origin-switching opportunities' },
  { icon: AlertTriangle,   label: 'Risk Map',       desc: 'HHI concentration & risk scoring' },
  { icon: Link2,           label: 'Supply Chain',   desc: 'Multi-tier surtax exposure model' },
  { icon: Newspaper,       label: 'Gazette Alerts', desc: 'Live Canada Gazette SOR tracking' },
];

export default async function TradePage() {
  const { tariffData, surtaxData, sections } = await loadAllData();

  const totalImports = sections.reduce((s, sec) => s + sec.totalImports, 0);
  const totalCodes = tariffData.length;
  const dutiableCodes = tariffData.filter(t => t.m > 0).length;
  const surtaxCodes = sections.reduce((s, sec) => s + sec.surtaxAffected, 0);

  return (
    <div className="trade-theme min-h-screen bg-surface-0 text-ink font-sans">
      {/* Sub-nav */}
      <nav className="sticky top-0 z-40 border-b border-border bg-surface-0/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-6 h-12 text-sm">
          <Link href="/trade" className="font-semibold text-ngen">Trade Intelligence</Link>
          <Link href="/trade" className="text-ink-muted hover:text-ink transition-colors">Industries</Link>
          <Link href="/trade/browse" className="text-ink-muted hover:text-ink transition-colors">Imports</Link>
          <Link href="/trade/exports" className="text-ink-muted hover:text-ink transition-colors">Exports</Link>
          <Link href="/trade/intel" className="text-ink-muted hover:text-ink transition-colors">Intel</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Hero */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="live-dot" />
            <span className="text-xs text-ink-muted font-medium tracking-wide uppercase">Canadian Tariff Intelligence</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">Trade Intelligence</h1>
          <p className="text-sm text-ink-muted max-w-2xl leading-relaxed mb-6">
            Live CBSA tariff data, StatsCan import analytics, and surtax monitoring for Canadian manufacturers.
            Browse by industry or open the toolkit for BOM analysis, FTA optimization, and supply chain risk scoring.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatTile label="Total Imports"   value={fmtVal(totalImports)}             sub="StatsCan CIMT 2025" accent />
            <StatTile label="HS Codes"        value={totalCodes.toLocaleString()}       sub="CBSA T2026" />
            <StatTile label="Dutiable Codes"  value={dutiableCodes.toLocaleString()}    sub="MFN rate > 0%" />
            <StatTile label="Under Surtax"    value={surtaxCodes.toLocaleString()}      sub={`${surtaxData.surtaxes.length} active entries`} />
          </div>
        </div>

        {/* Globe */}
        <section className="mb-12">
          <TradeGlobeWrapper />
        </section>

        {/* Industry grid */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Browse by Industry Section</h2>
            <span className="text-[11px] text-ink-faint">20 HS sections · click to explore</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {sections.map(sec => <SectionCard key={sec.slug} sec={sec} />)}
          </div>
        </section>

        {/* Toolkit */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Full Toolkit</h2>
              <p className="text-[11px] text-ink-faint mt-0.5">Advanced analysis tools for trade professionals</p>
            </div>
            <Link href="/trade/browse" className="text-xs border border-border text-ink-muted hover:text-ink hover:border-ngen/40 px-4 py-2 rounded transition-colors">
              Open toolkit →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TOOLS.map(t => {
              const Icon = t.icon;
              return (
                <Link key={t.label} href="/trade/browse" className="p-4 bg-surface-1 border border-border rounded-lg hover:border-ngen/40 hover:bg-surface-2 transition-all group">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center group-hover:bg-ngen/10 transition-colors">
                      <Icon className="w-4 h-4 text-ink-muted group-hover:text-ngen transition-colors" />
                    </div>
                    <div className="text-sm font-medium group-hover:text-ngen transition-colors">{t.label}</div>
                  </div>
                  <div className="text-xs text-ink-muted leading-relaxed">{t.desc}</div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
