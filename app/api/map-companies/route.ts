import { NextResponse } from "next/server";
import { getMapCompanies } from "@/lib/search";

export const dynamic = "force-static";

export async function GET() {
  try {
    const companies = getMapCompanies();
    return NextResponse.json({ companies, total: companies.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
