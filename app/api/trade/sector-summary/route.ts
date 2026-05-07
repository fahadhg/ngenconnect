import { NextResponse } from 'next/server';
import { loadAllData } from '@/lib/trade/loadData';

export const dynamic = 'force-static';
export const revalidate = 86400;

export type SlugSummary = {
  slug: string;
  name: string;
  surtaxCount: number;
  codeCount: number;
  totalImports: number;
  riskLevel: 'none' | 'low' | 'medium' | 'high';
};

export async function GET() {
  const { sections } = await loadAllData();

  const bySlug: Record<string, SlugSummary> = {};

  for (const sec of sections) {
    const risk: SlugSummary['riskLevel'] =
      sec.surtaxAffected === 0 ? 'none'
      : sec.surtaxAffected < 10 ? 'low'
      : sec.surtaxAffected < 100 ? 'medium'
      : 'high';

    bySlug[sec.slug] = {
      slug: sec.slug,
      name: sec.name,
      surtaxCount: sec.surtaxAffected,
      codeCount: sec.codeCount,
      totalImports: sec.totalImports,
      riskLevel: risk,
    };
  }

  return NextResponse.json(bySlug);
}
