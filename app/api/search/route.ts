import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SearchResult } from "@/lib/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMS = 768;
const EMBEDDING_PRICE_PER_M = 0.025;

function supabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function embedQuery(query: string): Promise<{ embedding: number[]; tokens: number }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text: query }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: EMBEDDING_DIMS,
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini embedding failed: ${response.statusText}`);

  const data = await response.json();
  return {
    embedding: data.embedding.values,
    tokens: data.usageMetadata?.promptTokenCount || 0,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { query, filters = {}, defenceMode = false } = await request.json();
    if (!query) return NextResponse.json({ error: "Query is required" }, { status: 400 });

    const { embedding, tokens: embeddingTokens } = await embedQuery(query);
    const embeddingCostUsd = (embeddingTokens * EMBEDDING_PRICE_PER_M) / 1_000_000;

    const supabase = supabaseClient();
    const { data, error } = await supabase.rpc("match_companies", {
      query_embedding:       embedding,
      match_count:           5,
      filter_sectors:        filters.sectors?.length        ? filters.sectors        : null,
      filter_capabilities:   filters.capabilities?.length   ? filters.capabilities   : null,
      filter_certifications: filters.certifications?.length ? filters.certifications : null,
      filter_materials:      filters.materials?.length      ? filters.materials      : null,
      filter_province:       filters.provinces?.[0]         || null,
      filter_company_size:   filters.company_sizes?.[0]     || null,
      filter_defence_only:   defenceMode,
    });

    if (error) throw new Error(error.message);

    const results: SearchResult[] = (data || []).map((row: Record<string, unknown>) => ({
      company_name:       row.company_name        as string,
      site:               row.site                as string,
      homepage:           (row.homepage as string) || `https://${row.site}`,
      description:        (row.description as string) || "",
      sectors:            (row.sectors       as string[]) || [],
      capabilities:       (row.capabilities  as string[]) || [],
      certifications:     (row.certifications as string[]) || [],
      materials:          (row.materials     as string[]) || [],
      hs_slugs:           (row.hs_slugs      as string[]) || [],
      province:           row.province        as string,
      company_size:       row.company_size    as string,
      score:              row.score           as number,
      defence_score:      (row.defence_score      as number)  ?? 0,
      defence_tier:       (row.defence_tier       as string)  ?? null,
      cgp_registered:     (row.cgp_registered     as boolean) ?? null,
      itar_registered:    (row.itar_registered     as boolean) ?? null,
      cmmc_level:         (row.cmmc_level          as number)  ?? null,
      facility_clearance: (row.facility_clearance  as string)  ?? null,
      dnd_approved:       (row.dnd_approved        as boolean) ?? null,
    }));

    return NextResponse.json({
      results,
      total: results.length,
      embeddingTokens,
      embeddingCostUsd,
      embeddingModel: GEMINI_EMBEDDING_MODEL,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = supabaseClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "filter_options")
      .single();

    if (error || !data) throw new Error("Filter options not found");

    return NextResponse.json({ filter_options: data.value });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load filters";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
