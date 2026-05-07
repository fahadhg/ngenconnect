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
    <div className="trade-theme min-h-screen bg-surface-0 text-ink font-sans">
      <nav className="sticky top-0 z-40 border-b border-border bg-surface-0/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-6 h-12 text-sm">
          <Link href="/trade" className="font-semibold text-ngen">Trade Intelligence</Link>
          <Link href="/trade" className="text-ink-muted hover:text-ink transition-colors">Industries</Link>
          <Link href="/trade/browse" className="text-ink-muted hover:text-ink transition-colors">Imports</Link>
          <Link href="/trade/exports" className="text-ink font-medium">Exports</Link>
          <Link href="/trade/intel" className="text-ink-muted hover:text-ink transition-colors">Intel</Link>
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
