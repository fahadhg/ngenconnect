import Link from 'next/link';
import TradeEventsPage from '@/components/trade/TradeEventsPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trade Events — Trade Intelligence · NGen Connect',
  description: 'Canadian trade missions, trade shows, and bilateral summits with country-level trade data and FTA details.',
};

export default function EventsPage() {
  return (
    <div className="trade-theme min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-6 h-12 text-sm">
          <Link href="/trade" className="font-semibold text-ngen-red">Trade Intelligence</Link>
          <Link href="/trade" className="text-gray-500 hover:text-gray-900 transition-colors">Industries</Link>
          <Link href="/trade/browse" className="text-gray-500 hover:text-gray-900 transition-colors">Imports</Link>
          <Link href="/trade/exports" className="text-gray-500 hover:text-gray-900 transition-colors">Exports</Link>
          <Link href="/trade/events" className="text-gray-900 font-semibold">Events</Link>
          <Link href="/trade/intel" className="text-gray-500 hover:text-gray-900 transition-colors">Intel</Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Canadian Trade Events</h1>
          <p className="text-sm text-gray-500 mt-1">
            Trade missions, shows, and summits — last 3 months · with bilateral trade data and FTA status per country
          </p>
        </div>
        <TradeEventsPage />
      </main>
    </div>
  );
}
