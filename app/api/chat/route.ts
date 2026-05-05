import { NextRequest, NextResponse } from "next/server";
import { SearchResult } from "@/lib/types";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are NGen Connect, a matchmaking assistant for the Canadian advanced manufacturing ecosystem (Industry 4.0).

You help users find manufacturers, technology providers, and suppliers from a curated database of 1,000+ Canadian companies.

Rules:
- ONLY answer based on the company data provided. Never invent companies or capabilities.
- When listing companies, always include their website URL.
- If no companies match, say so clearly.
- Be specific — reference actual capabilities, certifications, and sectors from the data.
- Keep it concise and actionable.
- Start with a 1-2 sentence overview, then highlight the top 3-5 matches with WHY they match.`;

interface LLMConfig {
  name: string;
  envKey: string;
  baseUrl: string;
  model: string;
}

const LLM_PRIORITY: LLMConfig[] = [
  {
    name: "Claude Sonnet 4.6",
    envKey: "ANTHROPIC_API_KEY",
    baseUrl: "https://api.anthropic.com/v1/",
    model: "claude-sonnet-4-6",
  },
  {
    name: "GPT-4.1",
    envKey: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1",
  },
  {
    name: "GPT-4.1 Mini",
    envKey: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
  },
  {
    name: "DeepSeek V3",
    envKey: "DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  {
    name: "Gemini 2.5 Flash",
    envKey: "GEMINI_API_KEY",
    baseUrl: "",
    model: "gemini-2.5-flash",
  },
];

function getBestLLM(): { config: LLMConfig; apiKey: string } | null {
  for (const config of LLM_PRIORITY) {
    const key = process.env[config.envKey];
    if (key) return { config, apiKey: key };
  }
  return null;
}

async function callGemini(prompt: string, apiKey: string, model: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
      }),
    }
  );
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
}

async function callOpenAICompatible(
  prompt: string,
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<string> {
  const client = new OpenAI({ apiKey, baseURL: baseUrl });
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });
  return response.choices[0]?.message?.content || "No response generated.";
}

async function callAnthropic(prompt: string, apiKey: string, model: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });
  const data = await response.json();
  return data.content?.[0]?.text || "No response generated.";
}

export async function POST(request: NextRequest) {
  try {
    const { query, companies, filters } = await request.json();

    const llm = getBestLLM();
    if (!llm) {
      return NextResponse.json(
        { error: "No LLM API keys configured. Set GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or DEEPSEEK_API_KEY." },
        { status: 500 }
      );
    }

    // Build context from search results
    const companyContext = (companies as SearchResult[])
      .slice(0, 10)
      .map(
        (c, i) =>
          `[${i + 1}] ${c.company_name} (${c.homepage})\n` +
          `   Sectors: ${c.sectors.join(", ") || "N/A"}\n` +
          `   Capabilities: ${c.capabilities.join(", ") || "N/A"}\n` +
          `   Certifications: ${c.certifications.join(", ") || "N/A"}\n` +
          `   Materials: ${c.materials.join(", ") || "N/A"}\n` +
          `   Province: ${c.province}\n` +
          `   Size: ${c.company_size}\n` +
          `   Description: ${c.description || "N/A"}`
      )
      .join("\n\n");

    const activeFilters = Object.entries(filters || {})
      .filter(([, v]) => (v as string[]).length > 0)
      .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
      .join(", ") || "None";

    const prompt = `A user is searching for manufacturing partners, suppliers, or technology providers.

Query: ${query}
Active filters: ${activeFilters}

Here are the top matching companies from our database:

${companyContext}

Provide a concise matchmaking summary:
1. Start with a 1-2 sentence overview of what you found
2. Highlight the top 3-5 most relevant matches and explain WHY they match the query
3. For each match, mention their key strengths and website URL
4. If filters are active, note how results were narrowed
5. Be specific — reference actual capabilities, certifications, and sectors from the data

Keep it concise and actionable. Do not invent information not in the data above.`;

    let summary: string;

    if (llm.config.envKey === "ANTHROPIC_API_KEY") {
      summary = await callAnthropic(prompt, llm.apiKey, llm.config.model);
    } else if (llm.config.envKey === "GEMINI_API_KEY" && !llm.config.baseUrl) {
      summary = await callGemini(prompt, llm.apiKey, llm.config.model);
    } else {
      summary = await callOpenAICompatible(prompt, llm.apiKey, llm.config.baseUrl, llm.config.model);
    }

    return NextResponse.json({ summary, model: llm.config.name });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Chat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
