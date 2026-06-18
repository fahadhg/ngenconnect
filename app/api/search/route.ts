import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SearchResult } from "@/lib/types";
import { findCompaniesByName } from "@/lib/search";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMS = 768;
const EMBEDDING_PRICE_PER_M = 0.025;

const HYDE_SYSTEM = `You generate hypothetical Canadian manufacturer capability profiles for vector search retrieval.

Given a buyer query, write 3–5 sentences describing the ideal Canadian manufacturer that would fulfill the request. Write it as if describing the supplier — not the buyer's need. Use supplier-side manufacturing vocabulary.

Cover as many of these as the query implies:
- Core manufacturing processes and capabilities (e.g. 5-axis CNC machining, injection molding, sheet metal fabrication, electronics assembly)
- Industries/sectors served (e.g. aerospace, automotive, defence, medical devices, oil & gas)
- Relevant certifications (e.g. ISO 9001:2015, AS9100D, IATF 16949, ISO 13485, NADCAP, CGP, ITAR, CMMC Level 2)
- Materials worked with (e.g. titanium, Inconel 718, aluminum 6061, PEEK, polycarbonate, stainless steel)
- Canadian province if mentioned
- Company scale if implied (small job shop, mid-size contract manufacturer, large OEM supplier)

Output only the profile text. No preamble, no labels, no markdown.`;

async function generateHyDE(query: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: HYDE_SYSTEM,
        messages: [{ role: "user", content: query }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.content?.[0]?.text as string | undefined)?.trim() || null;
  } catch {
    return null;
  }
}

function supabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function embedQuery(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" = "RETRIEVAL_QUERY"
): Promise<{ embedding: number[]; tokens: number }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType,
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

    // HyDE: generate a synthetic company profile from the query, then embed it as a
    // RETRIEVAL_DOCUMENT so it sits in the same vector space as stored company profiles.
    // Falls back to embedding the raw query if Anthropic key is absent or call fails.
    const hydeDocument = await generateHyDE(query);
    const textToEmbed = hydeDocument ?? query;
    const taskType = hydeDocument ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY";

    const { embedding, tokens: embeddingTokens } = await embedQuery(textToEmbed, taskType);
    const embeddingCostUsd = (embeddingTokens * EMBEDDING_PRICE_PER_M) / 1_000_000;

    const supabase = supabaseClient();
    // Province and company_size are applied as post-filters in JS (not in Supabase)
    // because the RPC accepts only single values, which breaks multi-select.
    // We pull a larger pool and filter/slice here instead.
    const { data, error } = await supabase.rpc("match_companies", {
      query_embedding:       embedding,
      match_count:           50,
      filter_sectors:        filters.sectors?.length        ? filters.sectors        : null,
      filter_capabilities:   filters.capabilities?.length   ? filters.capabilities   : null,
      filter_certifications: filters.certifications?.length ? filters.certifications : null,
      filter_materials:      filters.materials?.length      ? filters.materials      : null,
      filter_province:       null,
      filter_company_size:   null,
      filter_defence_only:   defenceMode,
    });

    if (error) throw new Error(error.message);

    // Name-match fallback: if the query mentions a specific company by name or domain,
    // force-include it even if the semantic search missed it.
    const nameMatches = findCompaniesByName(query, defenceMode);

    const results: SearchResult[] = (data || []).map((row: Record<string, unknown>) => ({
      company_name:       row.company_name        as string,
      site:               row.site                as string,
      homepage:           `https://${row.site}`,
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

    // Post-filter: province and company_size (supports multi-select)
    const selectedProvinces  = filters.provinces?.length    ? new Set<string>(filters.provinces)    : null;
    const selectedSizes      = filters.company_sizes?.length ? new Set<string>(filters.company_sizes) : null;

    const filtered = results.filter((r) => {
      if (selectedProvinces && !selectedProvinces.has(r.province)) return false;
      if (selectedSizes     && !selectedSizes.has(r.company_size))  return false;
      return true;
    });

    // Inject name matches that aren't already in semantic results
    const existingNames = new Set(filtered.map((r) => r.company_name.toLowerCase()));
    const newNameMatches = nameMatches.filter(
      (m) => !existingNames.has(m.company_name.toLowerCase())
    );
    const merged = [...newNameMatches, ...filtered].slice(0, 50);

    return NextResponse.json({
      results: merged,
      total: merged.length,
      embeddingTokens,
      embeddingCostUsd,
      embeddingModel: GEMINI_EMBEDDING_MODEL,
      hydeDocument,
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
