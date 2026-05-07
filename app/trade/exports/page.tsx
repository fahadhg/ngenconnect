import Link from 'next/link';
import ExportsComplexity from '@/components/trade/ExportsComplexity';
import AtlasExportBasket from '@/components/trade/AtlasExportBasket';
import GlobalMarketShare from '@/components/trade/GlobalMarketShare';
import TradeOverTime from '@/components/trade/TradeOverTime';
import TradeMap from '@/components/trade/TradeMap';
import GrowthOpportunity from '@/components/trade/GrowthOpportunity';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Exports — Trade Intelligence · NGen Connect',
  description: 'Canadian export basket, product complexity (PCI), revealed comparative advantage, and Economic Complexity Index.',
};

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export default function ExportsPage() {
  return (
    <div className="trade-theme min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-6 h-12 text-sm">
          <Link href="/trade" className="font-semibold text-ngen-red">Trade Intelligence</Link>
          <Link href="/trade" className="text-gray-500 hover:text-gray-900 transition-colors">Industries</Link>
          <Link href="/trade/browse" className="text-gray-500 hover:text-gray-900 transition-colors">Imports</Link>
          <Link href="/trade/exports" className="text-gray-900 font-semibold">Exports</Link>
          <Link href="/trade/intel" className="text-gray-500 hover:text-gray-900 transition-colors">Intel</Link>
        </div>
      </nav>
      <main className="min-h-screen">
        {/* existing Atlas export basket */}
        <AtlasExportBasket />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12">

          {/* Global Market Share by Sector */}
          <SectionCard
            title="Global Market Share by Sector"
            subtitle="Canada's share of world exports by product sector, 1995–2024 (Harvard Atlas of Economic Complexity)"
          >
            <GlobalMarketShare />
          </SectionCard>

          {/* Trade Over Time */}
          <SectionCard
            title="Trade Over Time"
            subtitle="Total gross exports and imports by destination region, 1995–2022 (Harvard Atlas bilateral data)"
          >
            <TradeOverTime />
          </SectionCard>

          {/* Trade Map */}
          <SectionCard
            title="Trade Map"
            subtitle="Geographic distribution of Canadian trade flows, 2022 (Harvard Atlas bilateral data)"
          >
            <TradeMap />
          </SectionCard>

          {/* Growth Opportunity */}
          <SectionCard
            title="Growth Opportunities"
            subtitle="Products Canada doesn't yet export competitively (RCA < 1) ranked by opportunity gain, product complexity, and global market size"
          >
            <GrowthOpportunity />
          </SectionCard>

          {/* existing exports complexity */}
          <div className="border-t border-border pt-6">
            <ExportsComplexity />
          </div>

        </div>
      </main>
    </div>
  );
}
