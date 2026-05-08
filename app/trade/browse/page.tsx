import Link from 'next/link';
import ImportsBasket from '@/components/trade/ImportsBasket';
import Dashboard from '@/components/trade/Dashboard';
import TradeOverTime from '@/components/trade/TradeOverTime';
import TradeMap from '@/components/trade/TradeMap';
import { loadAllData } from '@/lib/trade/loadData';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Imports — Trade Intelligence · NGen Connect',
  description: "Canada's import basket, CBSA HS code browser, surtax monitoring, and BOM analysis tools.",
};

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export default async function ImportsPage() {
  const { tariffData, importData, usRates, surtaxData } = await loadAllData();
  return (
    <div className="trade-theme min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-6 h-12 text-sm">
          <Link href="/trade" className="font-semibold text-ngen-red">Trade Intelligence</Link>
          <Link href="/trade" className="text-gray-500 hover:text-gray-900 transition-colors">Industries</Link>
          <Link href="/trade/browse" className="text-gray-900 font-semibold">Imports</Link>
          <Link href="/trade/exports" className="text-gray-500 hover:text-gray-900 transition-colors">Exports</Link>
          <Link href="/trade/intel" className="text-gray-500 hover:text-gray-900 transition-colors">Intel</Link>
        </div>
      </nav>
      <main className="min-h-screen">
        {/* Import Basket treemap — full-width header section */}
        <ImportsBasket />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 space-y-6">

          {/* Trade Over Time — default to import mode */}
          <SectionCard
            title="Trade Over Time"
            subtitle="Total gross imports and exports by source region, 1995–2022 (Harvard Atlas bilateral data)"
          >
            <TradeOverTime defaultMode="import" />
          </SectionCard>

          {/* Trade Map — default to import mode */}
          <SectionCard
            title="Trade Map"
            subtitle="Geographic distribution of Canadian import flows, 2022 (Harvard Atlas bilateral data)"
          >
            <TradeMap defaultMode="import" />
          </SectionCard>

          {/* HS Code browser */}
          <div className="border-t border-border pt-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="live-dot" />
              <h2 className="text-lg font-semibold tracking-tight">All HS Codes</h2>
              <span className="text-sm text-ink-faint">CBSA T2026 · StatsCan 2025 imports · {tariffData.length.toLocaleString()} codes</span>
            </div>
            <Dashboard tariffData={tariffData} importData={importData} usRates={usRates} surtaxData={surtaxData} />
          </div>

        </div>
      </main>
    </div>
  );
}
