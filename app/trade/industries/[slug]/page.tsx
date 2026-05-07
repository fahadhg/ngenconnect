import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import IndustryDetail from '@/components/trade/IndustryDetail';
import { loadAllData } from '@/lib/trade/loadData';

export async function generateStaticParams() {
  const { sections } = await loadAllData();
  return sections.map(s => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { sections } = await loadAllData();
  const section = sections.find(s => s.slug === slug);
  if (!section) return { title: 'Not Found' };
  return {
    title: `${section.name} — Trade Intelligence · NGen Connect`,
    description: `${section.description}. CBSA T2026 tariff data, StatsCan 2025 imports, surtax monitoring.`,
  };
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tariffData, importData, usRates, surtaxData, sections } = await loadAllData();

  const section = sections.find(s => s.slug === slug);
  if (!section) notFound();

  const chapSet = new Set(section.chapters);
  const sectionCodes = tariffData.filter(t => chapSet.has(t.c));

  const filteredImports: typeof importData = {};
  for (const [key, val] of Object.entries(importData)) {
    const ch = parseInt(key.replace(/\./g, '').slice(0, 2), 10);
    if (chapSet.has(ch)) filteredImports[key] = val;
  }

  const filteredSurtax = {
    ...surtaxData,
    surtaxes: surtaxData.surtaxes.filter(s => {
      const ch = parseInt(s.hs.replace(/\./g, '').slice(0, 2), 10);
      return chapSet.has(ch);
    }),
  };

  return (
    <div className="trade-theme min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-6 h-12 text-sm">
          <Link href="/trade" className="font-semibold text-ngen-red">Trade Intelligence</Link>
          <Link href="/trade" className="text-gray-500 hover:text-gray-900 transition-colors">Industries</Link>
          <Link href="/trade/browse" className="text-gray-500 hover:text-gray-900 transition-colors">Imports</Link>
          <Link href="/trade/exports" className="text-gray-500 hover:text-gray-900 transition-colors">Exports</Link>
          <Link href="/trade/intel" className="text-gray-500 hover:text-gray-900 transition-colors">Intel</Link>
        </div>
      </nav>
      <main className="min-h-screen">
        <IndustryDetail
          section={section}
          codes={sectionCodes}
          importData={filteredImports}
          usRates={usRates}
          surtaxData={filteredSurtax}
        />
      </main>
    </div>
  );
}
