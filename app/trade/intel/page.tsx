import Link from 'next/link';
import IntelDashboard from '@/components/trade/IntelDashboard';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Intel — Trade Intelligence · NGen Connect',
  description: 'Manufacturing health, labour market signals, input cost tracker, and export market intelligence.',
};

export default function IntelPage() {
  return (
    <div className="trade-theme min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-6 h-12 text-sm">
          <Link href="/trade" className="font-semibold text-ngen-red">Trade Intelligence</Link>
          <Link href="/trade" className="text-gray-500 hover:text-gray-900 transition-colors">Industries</Link>
          <Link href="/trade/browse" className="text-gray-500 hover:text-gray-900 transition-colors">Imports</Link>
          <Link href="/trade/exports" className="text-gray-500 hover:text-gray-900 transition-colors">Exports</Link>
          <Link href="/trade/events" className="text-gray-500 hover:text-gray-900 transition-colors">Events</Link>
          <Link href="/trade/intel" className="text-gray-900 font-semibold">Intel</Link>
        </div>
      </nav>
      <main className="min-h-screen">
        <IntelDashboard />
      </main>
    </div>
  );
}
