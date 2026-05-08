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
    <div className={`relative overflow-hidden p-5 rounded-xl transition-all duration-200 border ${
      accent 
        ? "bg-gradient-to-br from-ngen-orange/10 to-ngen-orange/5 border-ngen-orange/30 hover:border-ngen-orange/60 hover:shadow-md" 
        : "bg-surface-1 border-border hover:border-border-hover hover:shadow-md"
    }`}>
      <div className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-ngen-orange" : "text-ink"} tracking-tight`}>{value}</div>
      {sub && <div className="text-xs text-ink-faint mt-2.5">{sub}</div>}
    </div>
  );
}

function SectionCard({ sec }: { sec: HSSection }) {
  const hasImports = sec.totalImports > 0;
  return (
    <Link
      href={`/trade/industries/${sec.slug}`}
      className="group block p-5 bg-white border border-gray-200 rounded-lg hover:border-ngen-orange/50 hover:shadow-md hover:bg-gradient-to-br hover:from-white hover:to-ngen-orange/5 transition-all duration-200"
    >
      <div className="font-semibold text-sm mb-2 text-gray-900 group-hover:text-ngen-orange transition-colors line-clamp-2">{sec.name}</div>
      <div className="text-xs text-gray-500 mb-4 leading-relaxed line-clamp-2">{sec.description}</div>
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Imports</div>
          <div className="font-bold text-base text-gray-900">{hasImports ? fmtVal(sec.totalImports) : '—'}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">{sec.codeCount.toLocaleString()} codes</div>
          {sec.surtaxAffected > 0 && (
            <div className="text-xs font-semibold text-ngen-orange">{sec.surtaxAffected} surtaxed</div>
          )}
        </div>
      </div>
      {sec.topSources.length > 0 && (
        <div className="pt-3 border-t border-gray-100 text-xs text-gray-500 truncate">
          Top: <span className="text-gray-700 font-medium">{sec.topSources.slice(0, 3).map(s => s.n).join(' · ')}</span>
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
    <div className="trade-theme min-h-screen bg-gray-50">
      {/* Sub-nav */}
      <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-8 h-14 text-sm">
          <Link href="/trade" className="font-semibold text-ngen-orange hover:text-orange-600 transition-colors">Trade Intelligence</Link>
          <Link href="/trade" className="text-gray-600 hover:text-gray-900 transition-colors font-medium">Industries</Link>
          <Link href="/trade/browse" className="text-gray-600 hover:text-gray-900 transition-colors font-medium">Imports</Link>
          <Link href="/trade/exports" className="text-gray-600 hover:text-gray-900 transition-colors font-medium">Exports</Link>
          <Link href="/trade/events" className="text-gray-600 hover:text-gray-900 transition-colors font-medium">Events</Link>
          <Link href="/trade/intel" className="text-gray-600 hover:text-gray-900 transition-colors font-medium">Intel</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        {/* Hero */}
        <div className="mb-14">
          <div className="flex items-center gap-2.5 mb-5">
            <span className="live-dot" />
            <span className="text-xs text-gray-600 font-semibold tracking-wide uppercase">Canadian Tariff Intelligence</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 text-balance">Trade Intelligence</h1>
          <p className="text-base text-gray-600 max-w-2xl leading-relaxed mb-8">
            Live CBSA tariff data, StatsCan import analytics, and surtax monitoring for Canadian manufacturers. Browse by industry or open the toolkit for BOM analysis, FTA optimization, and supply chain risk scoring.
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

        {/* Full Toolkit — hidden for now */}
      </main>
    </div>
  );
}
