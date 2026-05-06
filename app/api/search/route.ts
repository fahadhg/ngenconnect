import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SearchResult } from "@/lib/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMS = 768;
const EMBEDDING_PRICE_PER_M = 0.025;

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

  if (!response.ok) {
    throw new Error(`Gemini embedding failed: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    embedding: data.embedding.values,
    tokens: data.usageMetadata?.promptTokenCount || 0,
  };
}

function splitField(field: string): string[] {
  if (!field) return [];
  return field.split(",").map((s) => s.trim()).filter(Boolean);
}

export async function POST(request: NextRequest) {
  try {
    const { query, filters } = await request.json();
    if (!query) return NextResponse.json({ error: "Query is required" }, { status: 400 });

    const { embedding, tokens: embeddingTokens } = await embedQuery(query);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("search_companies", {
      query_embedding: embedding,
      filter_sectors:       filters.sectors?.length       ? filters.sectors       : null,
      filter_capabilities:  filters.capabilities?.length  ? filters.capabilities  : null,
      filter_certifications:filters.certifications?.length? filters.certifications: null,
      filter_materials:     filters.materials?.length     ? filters.materials     : null,
      filter_province:      filters.province?.[0]         || null,
      filter_company_size:  filters.company_size?.[0]     || null,
      match_count: 5,
    });

    if (error) throw new Error(error.message);

    const results: SearchResult[] = (data || []).map((r: Record<string, string | number>) => ({
      company_name:   r.company_name as string,
      site:           r.site as string,
      homepage:       (r.homepage as string) || `https://${r.site}`,
      description:    (r.description as string) || "",
      sectors:        splitField(r.sectors as string),
      capabilities:   splitField(r.capabilities as string),
      certifications: splitField(r.certifications as string),
      materials:      splitField(r.materials as string),
      province:       r.province as string,
      company_size:   r.company_size as string,
      score:          Math.round((r.score as number) * 100) / 100,
    }));

    const embeddingCostUsd = (embeddingTokens * EMBEDDING_PRICE_PER_M) / 1_000_000;

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
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "filter_options")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ filter_options: data.value });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load filters";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
