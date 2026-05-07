import Link from 'next/link';
import ExportsComplexity from '@/components/trade/ExportsComplexity';
import AtlasExportBasket from '@/components/trade/AtlasExportBasket';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Exports — Trade Intelligence · NGen Connect',
  description: 'Canadian export basket, product complexity (PCI), revealed comparative advantage, and Economic Complexity Index.',
};

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
        <AtlasExportBasket />
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="border-t border-border pt-10 pb-4">
            <ExportsComplexity />
          </div>
        </div>
      </main>
    </div>
  );
}
