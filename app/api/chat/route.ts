import { NextRequest, NextResponse } from "next/server";
import { SearchResult } from "@/lib/types";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are NGen Connect, an expert matchmaking advisor for the Canadian advanced manufacturing ecosystem (Industry 4.0).

You analyze structured company data and produce precise, data-grounded matchmaking recommendations for procurement professionals and business development teams.

Rules:
- ONLY use the company data provided. Never invent companies, capabilities, certifications, or materials.
- Analyze 3 to 5 companies maximum. Quality and depth matter more than quantity.
- For each match, write a dedicated paragraph that cites specific capabilities, certifications, materials, and sectors directly from the company record. Explain exactly why this company fits the query.
- Always include the company website URL when referencing a company.
- Write in clear, professional prose. Use numbered paragraphs for individual companies — do not use bullet points or markdown headers.
- Bold the company name at the start of each paragraph using **Company Name** format.
- Be specific and data-driven: cite exact certifications (e.g., AS9100D, ISO 9001:2015), materials (e.g., titanium, Inconel), capabilities (e.g., 5-axis CNC, LPBF additive), and sectors from the records.
- If no strong matches exist, state that clearly and explain what was found instead.
- Close with 1 sentence on suggested next steps.`;

interface LLMConfig {
  name: string;
  envKey: string;
  baseUrl: string;
  model: string;
}

interface LLMResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

// Pricing per 1M tokens (USD) — approximate list prices
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3.0,   output: 15.0  },
  "gpt-4.1":           { input: 2.0,   output: 8.0   },
  "gpt-4.1-mini":      { input: 0.4,   output: 1.6   },
  "deepseek-chat":     { input: 0.27,  output: 1.1   },
  "gemini-2.5-flash":  { input: 0.075, output: 0.30  },
};

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

async function callGemini(prompt: string, apiKey: string, model: string): Promise<LLMResult> {
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
  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.",
    inputTokens: data.usageMetadata?.promptTokenCount || 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
  };
}

async function callOpenAICompatible(
  prompt: string,
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<LLMResult> {
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
  return {
    text: response.choices[0]?.message?.content || "No response generated.",
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
  };
}

async function callAnthropic(prompt: string, apiKey: string, model: string): Promise<LLMResult> {
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
  return {
    text: data.content?.[0]?.text || "No response generated.",
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
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
      .slice(0, 5)
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

    const prompt = `A procurement specialist or business development manager is searching for Canadian manufacturing partners, suppliers, or technology providers.

Search query: "${query}"
Active filters: ${activeFilters}

Top matching companies from the NGen Connect database, ranked by semantic relevance:

${companyContext}

Provide a detailed matchmaking analysis following this structure:

Open with 1–2 sentences summarizing the quality and nature of the matches found.

Then, for each of the top 3–5 companies, write a numbered paragraph that:
- Leads with **Company Name** (bolded) and their website URL
- Explains precisely why this company matches the query — cite specific capabilities, certifications, materials, and sectors from the data above
- Notes any standout differentiators relevant to this particular search (e.g., rare certifications, specialized materials, relevant province)
- Mentions company size where it is relevant to the query context

If active filters shaped the results, briefly note how in one sentence after the company paragraphs.

Close with a single sentence recommending a concrete next step (e.g., direct outreach, requesting a capability statement, visiting their site).

Do not invent any company names, capabilities, certifications, or other details not present in the data above.`;

    let result: LLMResult;

    if (llm.config.envKey === "ANTHROPIC_API_KEY") {
      result = await callAnthropic(prompt, llm.apiKey, llm.config.model);
    } else if (llm.config.envKey === "GEMINI_API_KEY" && !llm.config.baseUrl) {
      result = await callGemini(prompt, llm.apiKey, llm.config.model);
    } else {
      result = await callOpenAICompatible(prompt, llm.apiKey, llm.config.baseUrl, llm.config.model);
    }

    const pricing = MODEL_PRICING[llm.config.model] ?? { input: 0, output: 0 };
    const costUsd =
      (result.inputTokens * pricing.input + result.outputTokens * pricing.output) / 1_000_000;

    return NextResponse.json({
      summary: result.text,
      model: llm.config.name,
      modelId: llm.config.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Chat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
