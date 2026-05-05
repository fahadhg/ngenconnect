import { NextRequest, NextResponse } from "next/server";
import { searchCompanies, getFilterOptions } from "@/lib/search";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMS = 768;

async function embedQuery(query: string): Promise<number[]> {
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
  return data.embedding.values;
}

export async function POST(request: NextRequest) {
  try {
    const { query, filters } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const queryEmbedding = await embedQuery(query);
    const results = searchCompanies(queryEmbedding, filters || {}, 20);

    return NextResponse.json({ results, total: results.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const filterOptions = getFilterOptions();
    return NextResponse.json({ filter_options: filterOptions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load filters";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
