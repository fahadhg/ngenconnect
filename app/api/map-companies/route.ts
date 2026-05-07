import { NextResponse } from "next/server";
import { loadCompaniesForMap } from "@/lib/search";

export async function GET() {
  try {
    const companies = loadCompaniesForMap();
    return NextResponse.json({ companies, total: companies.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
