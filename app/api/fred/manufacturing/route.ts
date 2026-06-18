import { NextResponse } from 'next/server';
import { fetchFredData } from '@/lib/fred/client';

export async function GET() {
  const data = await fetchFredData();
  return NextResponse.json(data);
}
