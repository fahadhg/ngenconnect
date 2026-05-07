import Link from 'next/link';
import IntelDashboard from '@/components/trade/IntelDashboard';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Intel — Trade Intelligence · NGen Connect',
  description: 'Manufacturing health, labour market signals, input cost tracker, and export market intelligence.',
};

export default function IntelPage() {
  return (
    <div className="trade-theme min-h-screen bg-surface-0 text-ink font-sans">
      <nav className="sticky top-0 z-40 border-b border-border bg-surface-0/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-6 h-12 text-sm">
          <Link href="/trade" className="font-semibold text-ngen">Trade Intelligence</Link>
          <Link href="/trade" className="text-ink-muted hover:text-ink transition-colors">Industries</Link>
          <Link href="/trade/browse" className="text-ink-muted hover:text-ink transition-colors">Imports</Link>
          <Link href="/trade/exports" className="text-ink-muted hover:text-ink transition-colors">Exports</Link>
          <Link href="/trade/intel" className="text-ink font-medium">Intel</Link>
        </div>
      </nav>
      <main className="min-h-screen">
        <IntelDashboard />
      </main>
    </div>
  );
}
