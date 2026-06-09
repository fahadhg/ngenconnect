import { NextRequest, NextResponse } from "next/server";
import { SearchResult } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

type ChatMessage = { role: "user" | "assistant"; content: string };

const GATHER_CONTEXT_SYSTEM = `You are NGen Connect, an expert matchmaking advisor for the Canadian advanced manufacturing ecosystem (Industry 4.0).

You have searched a database of 1,000+ Canadian manufacturers and retrieved the top candidates for a user's query. Your job right now is to ask 2–3 precise, technical follow-up questions — not to present the final matches yet.

Rules:
- Study the candidate companies carefully. Let what you found guide your questions. For example: if candidates span both AS9100D and IATF 16949 certifications, ask which sector applies; if candidates vary widely in size, ask about production volume; if materials overlap, ask which alloys or grades are relevant.
- Questions must be specific and technical — grounded in what you actually found in the data. Avoid generic asks.
- Ask exactly 2–3 questions, numbered.
- Do NOT name or list any companies yet.
- Do NOT give a recommendation yet.
- Open with 1 sentence summarizing what you found (e.g., "I found strong candidates in Ontario specializing in precision 5-axis CNC machining with aerospace certifications.").
- End with a short line inviting the user to answer so you can finalize your recommendations.`;

const GATHER_CONTEXT_DEFENCE_SYSTEM = `You are NGen Connect Defence, an expert matchmaking advisor for Canadian defence and aerospace manufacturing.

You have searched a database of Canadian companies and retrieved the top candidates for a defence procurement query. Your job right now is to ask 2–3 precise follow-up questions — not to present the final matches yet.

Rules:
- Prioritize compliance-gated questions: ask about CGP registration requirements, ITAR applicability, required CMMC level, facility clearance level needed, or whether a DND-approved vendor list applies.
- If candidates vary on these compliance fields, ask which ones are mandatory vs. preferred for this engagement.
- Ask exactly 2–3 questions, numbered.
- Do NOT name or list any companies yet.
- Open with 1 sentence summarizing what you found (e.g., "I found candidates in Ontario with AS9100D certification and Controlled Goods Program registration, primarily in precision machining and electronics assembly.").
- End with a short line inviting the user to answer so you can finalize your recommendations.`;

const FINAL_ANALYSIS_SYSTEM = `You are NGen Connect, an expert matchmaking advisor for the Canadian advanced manufacturing ecosystem (Industry 4.0).

You have gathered clarifying information from the user. Now deliver a precise, data-grounded matchmaking analysis.

Rules:
- ONLY use the company data provided in this conversation. Never invent companies, capabilities, certifications, or materials.
- Analyze 3 to 5 companies maximum. Quality and depth matter more than quantity.
- For each match, write a dedicated paragraph that cites specific capabilities, certifications, materials, and sectors from the data. Explain exactly why this company fits the original query AND the user's clarified requirements.
- Always include the company website URL when referencing a company.
- Write in clear, professional prose. Use numbered paragraphs — do not use bullet points or markdown headers.
- Bold the company name at the start of each paragraph using **Company Name** format.
- Be specific and data-driven: cite exact certifications (e.g., AS9100D, ISO 9001:2015), materials (e.g., titanium, Inconel 718), capabilities (e.g., 5-axis CNC, LPBF additive manufacturing), and sectors.
- After the company analysis, add a short paragraph recommending that the user generate an RFP: "Based on these matches, consider generating a formal Request for Proposal — click **Generate RFP** below to create a structured document pre-filled with your stated requirements and these recommended suppliers."
- Close with 1 sentence on a concrete next step.`;

const FINAL_ANALYSIS_DEFENCE_SYSTEM = `You are NGen Connect Defence, an expert matchmaking advisor for Canadian defence and aerospace manufacturing.

You have gathered clarifying information. Now deliver a compliance-focused matchmaking analysis.

Rules:
- ONLY use the company data provided. Never invent companies, certifications, or compliance statuses.
- Analyze 3 to 5 companies maximum.
- For each match, lead with compliance status: CGP registration, ITAR registration, CMMC level, facility clearance, DND approval. Then cite capabilities, certifications, and materials.
- Flag any compliance gaps explicitly (e.g., "No CMMC level on record — verify before engagement").
- Always include the company website URL.
- Write in clear, professional prose. Use numbered paragraphs.
- Bold the company name at the start of each paragraph.
- After analysis, recommend generating a Defence RFP: "Click **Generate Defence RFP** below to create a document with ITAR flow-down clauses and CGP handling requirements pre-filled."
- Close with a concrete next step focused on compliance verification.`;

const GENERATE_RFP_SYSTEM = `You are NGen Connect, an expert matchmaking advisor for the Canadian advanced manufacturing ecosystem (Industry 4.0).

Generate a professional, ready-to-send Request for Proposal (RFP) document grounded entirely in this conversation. Do not invent requirements or capabilities not mentioned.

Use these bold headers and structure the document accordingly:

**1. Project Overview**
**2. Technical Requirements**
**3. Scope of Work**
**4. Supplier Qualification Criteria**
**5. Submission Requirements**
**6. Evaluation Criteria**
**7. Timeline & Contact**

Use placeholder fields like [Your Organization], [Contact Name], [Submission Deadline] where the user would fill in their own details. Keep the document concise, professional, and directly grounded in what was discussed.`;

const GENERATE_RFP_DEFENCE_SYSTEM = `You are NGen Connect Defence, an expert matchmaking advisor for Canadian defence and aerospace manufacturing.

Generate a professional defence RFP grounded entirely in this conversation. Do not invent requirements or capabilities not mentioned.

Use these bold headers:

**1. Project Overview & Security Classification**
**2. Technical Requirements**
**3. Scope of Work**
**4. Compliance & Security Requirements**
**5. Supplier Qualification Criteria**
**6. Submission Requirements**
**7. Evaluation Criteria**
**8. Timeline & Contact**

Section 4 must include placeholders for:
- Required CGP registration: [YES / NO]
- Required ITAR compliance: [YES / NO]
- Required CMMC level: [1 / 2 / 3 / N/A]
- Required facility clearance: [SECRET / TOP SECRET / N/A]
- Security classification of deliverables: [UNCLASSIFIED / PROTECTED A / PROTECTED B]
- ITAR flow-down clause: [INCLUDE if ITAR applies]
- CGP handling requirements: [INCLUDE if controlled goods involved]

Use placeholder fields like [Your Organization], [DND Contract Number], [Contracting Authority], [Submission Deadline]. Keep the document concise and directly grounded in what was discussed.`;

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

function buildContextPrompt(query: string, companies: SearchResult[], filters: Record<string, string[]>, defenceMode = false): string {
  const companyContext = (companies as SearchResult[])
    .slice(0, 5)
    .map((c, i) => {
      const base =
        `[${i + 1}] ${c.company_name} (${c.homepage})\n` +
        `   Sectors: ${c.sectors.join(", ") || "N/A"}\n` +
        `   Capabilities: ${c.capabilities.join(", ") || "N/A"}\n` +
        `   Certifications: ${c.certifications.join(", ") || "N/A"}\n` +
        `   Materials: ${c.materials.join(", ") || "N/A"}\n` +
        `   Province: ${c.province}\n` +
        `   Size: ${c.company_size}\n` +
        `   Description: ${c.description || "N/A"}`;

      if (!defenceMode) return base;

      // Append defence compliance fields when in Defence Mode
      const dc = c as SearchResult & {
        cgp_registered?: boolean | null;
        itar_registered?: boolean | null;
        cmmc_level?: number | null;
        facility_clearance?: string | null;
        dnd_approved?: boolean | null;
        defence_tier?: string | null;
      };
      const complianceLine =
        `   CGP Registered: ${dc.cgp_registered == null ? "Unknown" : dc.cgp_registered ? "YES" : "NO"}\n` +
        `   ITAR Registered: ${dc.itar_registered == null ? "Unknown" : dc.itar_registered ? "YES" : "NO"}\n` +
        `   CMMC Level: ${dc.cmmc_level ?? "Not on record"}\n` +
        `   Facility Clearance: ${dc.facility_clearance ?? "Not on record"}\n` +
        `   DND Approved Vendor: ${dc.dnd_approved == null ? "Unknown" : dc.dnd_approved ? "YES" : "NO"}\n` +
        `   Defence Tier: ${dc.defence_tier ?? "N/A"}`;

      return base + "\n" + complianceLine;
    })
    .join("\n\n");

  const activeFilters = Object.entries(filters || {})
    .filter(([, v]) => (v as string[]).length > 0)
    .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
    .join(", ") || "None";

  return `Search query: "${query}"
Active filters: ${activeFilters}

Top candidates from the NGen Connect database (ranked by semantic relevance):

${companyContext}`;
}

async function callGemini(messages: ChatMessage[], system: string, apiKey: string, model: string): Promise<LLMResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
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
  messages: ChatMessage[],
  system: string,
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<LLMResult> {
  const client = new OpenAI({ apiKey, baseURL: baseUrl });
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      ...messages,
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

async function callAnthropic(messages: ChatMessage[], system: string, apiKey: string, model: string): Promise<LLMResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system,
      messages,
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
    const {
      query,
      companies,
      filters,
      embeddingTokens,
      embeddingCostUsd,
      mode = "gather_context",
      defenceMode = false,
      userAnswers,
      followUpQuestions,
      analysisText,
    } = await request.json();

    const llm = getBestLLM();
    if (!llm) {
      return NextResponse.json(
        { error: "No LLM API keys configured. Set GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or DEEPSEEK_API_KEY." },
        { status: 500 }
      );
    }

    const contextPrompt = buildContextPrompt(query, companies, filters, defenceMode);
    const gatherUserMsg = contextPrompt + "\n\nAsk 2–3 targeted follow-up questions to refine your recommendation.";

    let systemPrompt: string;
    let messages: ChatMessage[];

    if (mode === "gather_context") {
      systemPrompt = defenceMode ? GATHER_CONTEXT_DEFENCE_SYSTEM : GATHER_CONTEXT_SYSTEM;
      messages = [{ role: "user", content: gatherUserMsg }];
    } else if (mode === "final_analysis") {
      systemPrompt = defenceMode ? FINAL_ANALYSIS_DEFENCE_SYSTEM : FINAL_ANALYSIS_SYSTEM;
      messages = [
        { role: "user", content: gatherUserMsg },
        { role: "assistant", content: followUpQuestions },
        { role: "user", content: userAnswers + "\n\nBased on my answers, deliver your final matchmaking analysis." },
      ];
    } else {
      // generate_rfp
      systemPrompt = defenceMode ? GENERATE_RFP_DEFENCE_SYSTEM : GENERATE_RFP_SYSTEM;
      messages = [
        { role: "user", content: gatherUserMsg },
        { role: "assistant", content: followUpQuestions },
        { role: "user", content: userAnswers },
        { role: "assistant", content: analysisText },
        {
          role: "user",
          content: defenceMode
            ? "Based on our conversation and the recommended suppliers, generate a professional defence RFP with ITAR flow-down and CGP handling clauses."
            : "Based on our conversation and the recommended suppliers, generate a professional RFP document.",
        },
      ];
    }

    let result: LLMResult;

    if (llm.config.envKey === "ANTHROPIC_API_KEY") {
      result = await callAnthropic(messages, systemPrompt, llm.apiKey, llm.config.model);
    } else if (llm.config.envKey === "GEMINI_API_KEY" && !llm.config.baseUrl) {
      result = await callGemini(messages, systemPrompt, llm.apiKey, llm.config.model);
    } else {
      result = await callOpenAICompatible(messages, systemPrompt, llm.apiKey, llm.config.baseUrl, llm.config.model);
    }

    const pricing = MODEL_PRICING[llm.config.model] ?? { input: 0, output: 0 };
    const costUsd =
      (result.inputTokens * pricing.input + result.outputTokens * pricing.output) / 1_000_000;

    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("conversations").insert({
          user_id: user.id,
          query,
          response: result.text,
          companies_matched: companies,
          filters,
          model_used: llm.config.model,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          embedding_tokens: embeddingTokens ?? 0,
          llm_cost_usd: costUsd,
          embedding_cost_usd: embeddingCostUsd ?? 0,
        });
      }
    } catch { /* non-critical */ }

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
