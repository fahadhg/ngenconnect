import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SearchResult } from "@/lib/types";

const COHERE_API_KEY        = process.env.COHERE_API_KEY || "";
const COHERE_EMBED_MODEL    = "embed-v4.0";
const EMBEDDING_PRICE_PER_M = 0.10; // $0.10/M tokens

const HYDE_SYSTEM = `You generate hypothetical Canadian supplier capability profiles for vector search retrieval.

Given a buyer query, write 3–5 sentences describing the ideal Canadian supplier that would fulfill the request. Write it as if describing the supplier — not the buyer's need. Use supplier-side vocabulary.

Cover as many of these as the query implies:
- Core capabilities and processes (e.g. 5-axis CNC machining, injection molding, SaaS platform, biotech R&D)
- Industries/sectors served (e.g. aerospace, automotive, defence, medical devices, cleantech, oil & gas)
- Relevant certifications (e.g. ISO 9001, AS9100D, IATF 16949, ISO 13485, NADCAP, ITAR)
- Materials or technology (e.g. titanium, composites, PEEK, AI/ML, embedded systems)
- Canadian province if mentioned
- Company scale if implied (startup, SME, large OEM supplier)

Output only the profile text. No preamble, no labels, no markdown.`;

function reciprocalRankFusion(
  semanticResults: SearchResult[],
  keywordResults:  SearchResult[],
  k = 60
): SearchResult[] {
  const rrfScore  = new Map<string, number>();
  const resultMap = new Map<string, SearchResult>();

  semanticResults.forEach((r, i) => {
    const key = r.company_name.toLowerCase();
    rrfScore.set(key, (rrfScore.get(key) || 0) + 1 / (k + i + 1));
    if (!resultMap.has(key)) resultMap.set(key, r);
  });

  keywordResults.forEach((r, i) => {
    const key = r.company_name.toLowerCase();
    rrfScore.set(key, (rrfScore.get(key) || 0) + 1 / (k + i + 1));
    if (!resultMap.has(key)) resultMap.set(key, r);
  });

  return Array.from(rrfScore.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([key]) => resultMap.get(key)!)
    .filter(Boolean);
}

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

async function embedText(text: string): Promise<{ embedding: number[]; tokens: number }> {
  const response = await fetch("https://api.cohere.com/v2/embed", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${COHERE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      texts: [text],
      model: COHERE_EMBED_MODEL,
      input_type: "search_query",
      embedding_types: ["float"],
    }),
  });

  if (!response.ok) throw new Error(`Cohere embedding failed: ${response.statusText}`);

  const data = await response.json();
  const tokens = data.meta?.billed_units?.input_tokens || 0;
  return {
    embedding: data.embeddings.float[0],
    tokens,
  };
}

function mapRow(row: Record<string, unknown>): SearchResult {
  return {
    company_name:             (row.company_name          as string) || "",
    site:                     (row.site                  as string) || "",
    homepage:                 (row.homepage              as string) || `https://${row.site}`,
    city:                     (row.city                  as string) || "",
    province:                 (row.province              as string) || "",
    tagline:                  (row.tagline               as string) || "",
    summary:                  (row.summary               as string) || "",
    company_type:             (row.company_type          as string) || "",
    business_model:           (row.business_model        as string) || "",
    headcount_range:          (row.headcount_range       as string) || "",
    founded_year:             (row.founded_year          as number) || null,
    capabilities:             (row.capabilities          as string[]) || [],
    capabilities_enhanced:    (row.capabilities_enhanced as string[]) || [],
    specializations:          (row.specializations       as string[]) || [],
    products:                 (row.products              as string[]) || [],
    technology:               (row.technology            as string[]) || [],
    equipment:                (row.equipment             as string[]) || [],
    materials:                (row.materials             as string[]) || [],
    certifications:           (row.certifications        as string[]) || [],
    certifications_not_found: (row.certifications_not_found as string[]) || [],
    industries_served:        (row.industries_served     as string[]) || [],
    key_customers:            (row.key_customers         as string[]) || [],
    export_compliance:        (row.export_compliance     as string[]) || [],
    capacity:                 (row.capacity              as string) || "",
    score:                    (row.score                 as number) || 0,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { query, filters = {} } = await request.json();
    if (!query) return NextResponse.json({ error: "Query is required" }, { status: 400 });

    // HyDE: generate a synthetic supplier profile, embed it as a document so it
    // sits in the same vector space as the stored company embed_texts.
    const hydeDocument  = await generateHyDE(query);
    const textToEmbed   = hydeDocument ?? query;

    const { embedding, tokens: embeddingTokens } = await embedText(textToEmbed);
    const embeddingCostUsd = (embeddingTokens * EMBEDDING_PRICE_PER_M) / 1_000_000;

    const supabase = supabaseClient();

    // Semantic search via pgvector
    const { data, error } = await supabase.rpc("search_companies", {
      query_embedding:        embedding,
      match_count:            50,
      filter_province:        null,
      filter_company_type:    filters.company_types?.length === 1 ? filters.company_types[0] : null,
      filter_business_model:  null,
      filter_certifications:  filters.certifications?.length ? filters.certifications : null,
      filter_industries:      filters.industries?.length     ? filters.industries     : null,
      filter_materials:       filters.materials?.length      ? filters.materials      : null,
    });

    if (error) throw new Error(error.message);

    const semanticResults: SearchResult[] = (data || []).map(mapRow);

    // Keyword fallback — simple name/capability match in Supabase
    let keywordResults: SearchResult[] = [];
    if (query.length > 2) {
      const term = query.toLowerCase().trim().split(/\s+/).slice(0, 3).join(" & ");
      const { data: kd } = await supabase
        .from("companies")
        .select("company_name,site,homepage,city,province,tagline,summary,company_type,business_model,headcount_range,founded_year,capabilities,capabilities_enhanced,specializations,products,technology,equipment,materials,certifications,certifications_not_found,industries_served,key_customers,export_compliance,capacity")
        .ilike("embed_text", `%${query}%`)
        .limit(20);
      keywordResults = (kd || []).map((r) => mapRow({ ...r, score: 0 }));
    }

    const fused = reciprocalRankFusion(semanticResults, keywordResults);

    // Post-filter: province and headcount (multi-select)
    const selectedProvinces  = filters.provinces?.length       ? new Set<string>(filters.provinces)       : null;
    const selectedHeadcounts = filters.headcount_ranges?.length ? new Set<string>(filters.headcount_ranges) : null;

    const filtered = fused.filter((r) => {
      if (selectedProvinces  && !selectedProvinces.has(r.province))        return false;
      if (selectedHeadcounts && !selectedHeadcounts.has(r.headcount_range)) return false;
      return true;
    });

    const merged = filtered.slice(0, 50);

    return NextResponse.json({
      results: merged,
      total:   merged.length,
      embeddingTokens,
      embeddingCostUsd,
      embeddingModel: COHERE_EMBED_MODEL,
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

    // Generate filter options dynamically from the companies table
    const [provinces, company_types, certs, industries, materials, headcounts] = await Promise.all([
      supabase.from("companies").select("province").not("province", "is", null),
      supabase.from("companies").select("company_type").not("company_type", "is", null),
      supabase.from("companies").select("certifications"),
      supabase.from("companies").select("industries_served"),
      supabase.from("companies").select("materials"),
      supabase.from("companies").select("headcount_range").not("headcount_range", "is", null),
    ]);

    const unique = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort();
    const flatUnique = (rows: Record<string, string[]>[], key: string) =>
      unique(rows.flatMap((r) => r[key] || []));

    const filter_options = {
      provinces:       unique((provinces.data || []).map((r) => r.province)),
      company_types:   unique((company_types.data || []).map((r) => r.company_type)),
      certifications:  flatUnique(certs.data || [], "certifications"),
      industries:      flatUnique(industries.data || [], "industries_served"),
      materials:       flatUnique(materials.data || [], "materials"),
      headcount_ranges: unique((headcounts.data || []).map((r) => r.headcount_range)),
    };

    return NextResponse.json({ filter_options });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load filters";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
