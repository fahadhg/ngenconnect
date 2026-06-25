import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SearchResult } from "@/lib/types";

const COHERE_API_KEY        = process.env.COHERE_API_KEY || "";
const COHERE_EMBED_MODEL    = "embed-v4.0";
const COHERE_RERANK_MODEL   = "rerank-v4.0-pro";
const EMBEDDING_PRICE_PER_M = 0.10; // $0.10/M tokens

const HYDE_SYSTEM = `You generate hypothetical Canadian supplier capability profiles for vector search retrieval.

Given a buyer query, write a profile describing the ideal Canadian supplier. Use supplier-side vocabulary, 3–5 sentences.

SUPPLY CHAIN / MULTI-TIER QUERIES: If the query asks to "map", "span steps", "build a supply chain", "cover the value chain", or explicitly mentions multiple stages of production (e.g. materials → components → assembly), output TWO profiles separated by the exact string "---TIER2---":

  Profile 1 (upstream): specialty materials, chemicals, advanced materials, polymers, membranes, coatings, catalysts, powders, films, or functional components unique to the domain. Mention the domain-specific product names (e.g. for hydrogen electrolyzers: "ion-exchange membranes, AEM/PEM ionomers, PFAS-free polymer, catalyst-coated membranes, MEA").
  Profile 2 (downstream): fabrication, machining, stamping, welding, precision manufacturing, systems integration, and assembly relevant to the domain. Mention processes and certifications.

For all other queries (single capability, named company, single-step process), output ONE profile only.

Cover as many of these as the query implies:
- Core capabilities and processes (e.g. 5-axis CNC, injection molding, ion-exchange membrane synthesis)
- Industries/sectors served (e.g. aerospace, automotive, defence, cleantech, medical devices)
- Certifications (ISO 9001, AS9100D, IATF 16949, ISO 13485, NADCAP, ISO 14001, ITAR)
- Materials or technology (e.g. titanium, composites, PEEK, polymers, embedded systems)
- Canadian province if mentioned
- Company scale if implied

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

// Returns 1 HyDE doc for point queries, 2 docs for supply-chain/multi-tier queries.
async function generateHyDE(query: string): Promise<string[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return [query];
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
        max_tokens: 500,
        system: HYDE_SYSTEM,
        messages: [{ role: "user", content: query }],
      }),
    });
    if (!res.ok) return [query];
    const data = await res.json();
    const raw = ((data.content?.[0]?.text as string | undefined) || "").trim();
    if (!raw) return [query];
    const parts = raw.split("---TIER2---").map((s: string) => s.trim()).filter(Boolean);
    return parts.length >= 2 ? parts : [parts[0] || query];
  } catch {
    return [query];
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

async function rerankWithCohere(query: string, candidates: SearchResult[]): Promise<SearchResult[]> {
  if (candidates.length === 0) return candidates;

  // Compact doc per candidate — enough signal for the cross-encoder without exceeding token limits
  const docs = candidates.map(r => {
    const parts = [r.company_name];
    if (r.tagline)  parts.push(r.tagline);
    if (r.summary)  parts.push(r.summary.slice(0, 200));
    const caps = r.capabilities_enhanced.length ? r.capabilities_enhanced : r.capabilities;
    if (caps.length)                parts.push(`Capabilities: ${caps.slice(0, 6).join(", ")}`);
    if (r.industries_served.length) parts.push(`Industries: ${r.industries_served.slice(0, 4).join(", ")}`);
    if (r.certifications.length)    parts.push(`Certifications: ${r.certifications.slice(0, 5).join(", ")}`);
    if (r.key_customers.length)     parts.push(`Customers: ${r.key_customers.slice(0, 3).join(", ")}`);
    if (r.export_compliance.length) parts.push(`Compliance: ${r.export_compliance.join(", ")}`);
    if (r.materials.length)         parts.push(`Materials: ${r.materials.slice(0, 4).join(", ")}`);
    if (r.province)                 parts.push(`${r.province}, Canada`);
    return parts.join(" | ");
  });

  const response = await fetch("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${COHERE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: COHERE_RERANK_MODEL,
      query,           // original user query — not HyDE (cross-encoder handles NL directly)
      documents: docs,
      top_n: Math.min(20, candidates.length),
    }),
  });

  if (!response.ok) {
    console.warn(`Rerank failed (${response.status}) — falling back to RRF order`);
    return candidates.slice(0, 20);
  }

  const data = await response.json();
  return data.results.map((r: { index: number; relevance_score: number }) => ({
    ...candidates[r.index],
    score: r.relevance_score,
  }));
}

const SELECT_FIELDS = "company_name,site,homepage,city,province,tagline,summary,company_type,business_model,headcount_range,founded_year,capabilities,capabilities_enhanced,specializations,products,technology,equipment,materials,certifications,certifications_not_found,industries_served,key_customers,export_compliance,capacity";

const normalizeStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Split a query like "MayaHtt" or "maya-htt" into ["maya", "htt"]
function queryTokens(query: string): string[] {
  return query
    .replace(/([a-z])([A-Z])/g, "$1 $2")   // camelCase split
    .split(/[\s\-_]+/)
    .map(t => t.toLowerCase())
    .filter(t => t.length >= 3);
}

async function directNameLookup(
  supabase: ReturnType<typeof supabaseClient>,
  query: string
): Promise<SearchResult[]> {
  const tokens = queryTokens(query);
  if (!tokens.length) return [];

  const normQuery = normalizeStr(query);
  const seen = new Set<string>();
  const matches: SearchResult[] = [];

  // Run one ilike per token, collect candidates, then filter by normalized name match
  for (const token of tokens) {
    const { data } = await supabase
      .from("companies")
      .select(SELECT_FIELDS)
      .ilike("company_name", `%${token}%`)
      .limit(20);

    for (const row of data || []) {
      const normName = normalizeStr(row.company_name || "");
      const key = normName;
      if (seen.has(key)) continue;
      // Accept if the normalized names overlap meaningfully
      if (normName.includes(normQuery) || normQuery.includes(normName) ||
          normName.startsWith(normQuery.slice(0, 4))) {
        seen.add(key);
        matches.push(mapRow({ ...row, score: 1 }));
      }
    }
  }
  return matches;
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

    const supabase = supabaseClient();

    // Direct name lookup: catches queries like "MayaHtt" → "Maya HTT" before vector search
    if (query.trim().split(/\s+/).length <= 6) {
      const nameHits = await directNameLookup(supabase, query);
      if (nameHits.length > 0) {
        return NextResponse.json({
          results: nameHits,
          total: nameHits.length,
          isDirectNameMatch: true,
          embeddingTokens: 0,
          embeddingCostUsd: 0,
          embeddingModel: COHERE_EMBED_MODEL,
          rerankModel: null,
          hydeDocument: null,
          hydeTiers: 1,
        });
      }
    }

    // HyDE: generate 1 or 2 synthetic supplier profiles (2 for supply-chain queries)
    // and embed each as a document so it sits in the same vector space as stored embed_texts.
    const hydeDocs = await generateHyDE(query);

    // Embed all HyDE docs in parallel, then run a pgvector search per doc.
    const searchParams = {
      match_count:           50,
      filter_province:       null,
      filter_company_type:   filters.company_types?.length === 1 ? filters.company_types[0] : null,
      filter_business_model: null,
      filter_certifications: filters.certifications?.length ? filters.certifications : null,
      filter_industries:     filters.industries?.length     ? filters.industries     : null,
      filter_materials:      filters.materials?.length      ? filters.materials      : null,
    };

    const embeddingResults = await Promise.all(
      hydeDocs.map(doc => embedText(doc))
    );

    const embeddingTokens  = embeddingResults.reduce((s, r) => s + r.tokens, 0);
    const embeddingCostUsd = (embeddingTokens * EMBEDDING_PRICE_PER_M) / 1_000_000;

    const vectorSearches = await Promise.all(
      embeddingResults.map(({ embedding }) =>
        supabase.rpc("search_companies", { query_embedding: embedding, ...searchParams })
      )
    );

    // Union results from all tier searches (dedup by company name)
    const seen = new Set<string>();
    const semanticResults: SearchResult[] = [];
    for (const { data, error } of vectorSearches) {
      if (error) throw new Error(error.message);
      for (const row of (data || []).map(mapRow)) {
        const key = row.company_name.toLowerCase();
        if (!seen.has(key)) { seen.add(key); semanticResults.push(row); }
      }
    }

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
    const selectedProvinces  = filters.provinces?.length        ? new Set<string>(filters.provinces)        : null;
    const selectedHeadcounts = filters.headcount_ranges?.length ? new Set<string>(filters.headcount_ranges) : null;

    const filtered = fused.filter((r) => {
      if (selectedProvinces  && !selectedProvinces.has(r.province))        return false;
      if (selectedHeadcounts && !selectedHeadcounts.has(r.headcount_range)) return false;
      return true;
    });

    // Rerank: cross-encoder re-scores candidates against the original query.
    // Uses the raw user query (not HyDE) — the reranker reads query+doc together.
    const reranked = await rerankWithCohere(query, filtered);

    // Named-company fast path: if the query is short (≤5 words) and one or more
    // company names closely match, return ONLY those companies so the UI doesn't
    // dilute the result with semantically similar but unrelated companies.
    const normalizedQuery = normalizeStr(query);
    if (query.trim().split(/\s+/).length <= 5) {
      const nameMatches = reranked.filter(r => {
        const n = normalizeStr(r.company_name);
        return n.includes(normalizedQuery) || normalizedQuery.includes(n);
      });
      if (nameMatches.length > 0) {
        return NextResponse.json({
          results: nameMatches,
          total: nameMatches.length,
          isDirectNameMatch: true,
          embeddingTokens,
          embeddingCostUsd,
          embeddingModel: COHERE_EMBED_MODEL,
          rerankModel:    COHERE_RERANK_MODEL,
          hydeDocument:   hydeDocs[0],
          hydeTiers:      hydeDocs.length,
        });
      }
    }

    return NextResponse.json({
      results: reranked,
      total:   reranked.length,
      embeddingTokens,
      embeddingCostUsd,
      embeddingModel:  COHERE_EMBED_MODEL,
      rerankModel:     COHERE_RERANK_MODEL,
      hydeDocument:    hydeDocs[0],
      hydeTiers:       hydeDocs.length,
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
