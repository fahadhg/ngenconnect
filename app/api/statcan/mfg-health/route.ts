import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'public', 'data', 'intel', 'mfg-health.json');
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return NextResponse.json({ status: 'ok', ...data });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
