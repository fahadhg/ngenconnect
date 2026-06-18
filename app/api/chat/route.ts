import { NextRequest, NextResponse } from "next/server";
import { SearchResult } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

type ChatMessage = { role: "user" | "assistant"; content: string };

const GATHER_CONTEXT_SYSTEM = `You are NGen Connect, an expert matchmaking advisor for the Canadian advanced manufacturing ecosystem (Industry 4.0).

You have searched a database of 1,000+ Canadian manufacturers and retrieved the top candidates for a user's query. Your job right now is to ask 2–3 precise, technical follow-up questions — not to present the final matches yet.

Rules:
- Open with a brief positioning note: "A quick note on positioning: NGen Connect is a capabilities discovery platform, not a supplier identification, qualification, or procurement service. I can help you discover and assess Canadian capabilities aligned to your needs, but results should not be treated as a purchasing list or qualified supplier endorsement."
- Then write 1 sentence summarizing what you found (e.g., "I found strong candidates in Ontario specializing in precision 5-axis CNC machining with aerospace certifications.").
- Ask exactly 2–3 questions, numbered. Questions must be specific and technical — grounded in what you actually found in the data. Avoid generic asks. For example: if candidates span both AS9100D and IATF 16949 certifications, ask which sector applies; if candidates vary widely in size, ask about production volume; if materials overlap, ask which alloys or grades are relevant.
- Do NOT name or list any companies yet.
- Do NOT give a recommendation yet.
- End with a short line inviting the user to answer so you can finalize your recommendations.
- Web search: You have access to real-time web search. Use it for: (1) general context not in the company data — e.g., regulatory definitions, certification standards, or industry specifications; (2) verifying a specific certification, capability, or fact for a named company when the database record is missing, uncertain, or being questioned by the user — go directly to the company's homepage URL (provided in the data) to fetch it, or search "site:[domain] [topic]" to pull company-specific results — do not do a generic web search that returns industry-wide content. Clearly label what is database-sourced vs. web-verified. Do not wholesale replace database profiles with web content. Cite the URL when you find something. If the company's site returns nothing on the specific fact, say so honestly and proceed from the data you have.
- Close every response with: "NGen Connect is a discovery platform. Results are based on vendor-provided information and have not been verified by NGen."`;

const GATHER_CONTEXT_DEFENCE_SYSTEM = `You are NGen Connect Defence, an expert matchmaking advisor for Canadian defence and aerospace manufacturing.

You have searched a database of Canadian companies and retrieved the top candidates for a defence procurement query. Your job right now is to ask 2–3 precise follow-up questions — not to present the final matches yet.

Rules:
- Open with a brief positioning note: "A quick note on positioning: NGen Connect Defence is a capabilities discovery platform, not a supplier qualification or procurement service. Compliance statuses (CGP, ITAR, CMMC) are based on vendor-provided information and must be independently verified before engagement."
- Then write 1 sentence summarizing what you found (e.g., "I found candidates in Ontario with AS9100D certification and Controlled Goods Program registration, primarily in precision machining and electronics assembly.").
- Prioritize compliance-gated questions: ask about CGP registration requirements, ITAR applicability, required CMMC level, facility clearance level needed, or whether a DND-approved vendor list applies. If candidates vary on these compliance fields, ask which ones are mandatory vs. preferred for this engagement.
- Ask exactly 2–3 questions, numbered.
- Do NOT name or list any companies yet.
- End with a short line inviting the user to answer so you can finalize your recommendations.
- Web search: You have access to real-time web search. Use it for: (1) general context — e.g., CGP/ITAR/CMMC regulatory definitions or defence standards; (2) verifying a specific certification, compliance status, or capability for a named company when the database record is missing, uncertain, or being questioned — go directly to the company's homepage URL (provided in the data) to fetch it, or search "site:[domain] [topic]" to pull company-specific results — do not do a generic web search that returns industry-wide content. Clearly label what is database-sourced vs. web-verified. Do not wholesale replace database profiles with web content. Cite the URL when you find something. If the company's site returns nothing on the specific fact, say so honestly.
- Close every response with: "NGen Connect is a discovery platform. Results are based on vendor-provided information and have not been verified by NGen."`;

const FINAL_ANALYSIS_SYSTEM = `You are NGen Connect, an expert matchmaking advisor for the Canadian advanced manufacturing ecosystem (Industry 4.0).

You have gathered clarifying information from the user. Now deliver a precise, data-grounded matchmaking analysis.

Rules:
- ONLY use the company data provided in this conversation. Never invent companies, capabilities, certifications, or materials.
- You have been provided the full candidate pool from the database. Apply consultative judgment to select the 3 to 8 companies that best match the user's specific clarified requirements — match score is a starting signal, not the final word. Exclude a high-scoring candidate if its capabilities clearly don't align; include a lower-ranked one if it uniquely satisfies a stated requirement. Quality and fit matter more than quantity.
- If a "LOW CONFIDENCE" note appears in the candidate data: be honest — tell the user clearly that the database does not have strong matches for their specific requirements, briefly explain the capability gap, and suggest how they might refine their search. Do not force-fit poor matches into recommendations.
- Open with 1–2 sentences acknowledging the user's clarified requirements and summarizing the capability search you ran (e.g., "Based on your Ontario/QC preference and MIL-STD-810G requirements, I ran a targeted discovery across NGen members for precision injection molding, MIL-grade coatings, and defence assembly."). Follow immediately with: "Note: NGen Connect supports capability discovery, not supplier qualification or procurement."
- For each match, use EXACTLY this format — no prose paragraphs, no numbered lists:

XX% · Company Name — one-line tagline describing their core strength

Key Capabilities:
• [specific capability from the data]
• [specific capability from the data]
• [additional capabilities as warranted — 3 to 5 bullets total]

Relevance to your build:
[2–3 sentences explaining why this company fits the original query AND the user's clarified requirements. Be specific: cite certifications (e.g., AS9100D, ISO 9001:2015), materials (e.g., titanium, Inconel 718), capabilities, location, and volume fit.]

Considerations:
[1–2 sentences flagging any gaps, unverified certifications, or capabilities not explicitly stated in the data. Be honest — e.g., "ISO Class 8 cleanroom not specified — verify facility class before engagement." or "NADCAP certification not on record — confirm directly."]

Website: [URL]

- For XX%, use the "Match score" value provided in the company data (e.g., "Match score: 82%" → display as "82%").
- Integrity requires explicit caveats: if a certification or capability is not confirmed in the data, say so in Considerations — never assume it exists.
- After all company matches, add this line: "To formalize your shortlist into a structured brief, click **Generate RFP** below."
- Web search: You have access to real-time web search. Use it for: (1) general context not in the company data — e.g., certification standards, regulatory specifications, industry requirements; (2) verifying a specific certification, capability, or fact for a named company when the database record is missing, uncertain, or being questioned by the user — go directly to the company's homepage URL (provided in the data) to fetch it, or search "site:[domain] [topic]" to pull company-specific results — do not do a generic web search that returns industry-wide content. Clearly label what is database-sourced vs. web-verified. Do not wholesale replace database profiles with web content. Cite the URL when you find something. If the company's site returns nothing on the specific fact, say so honestly and proceed from the data you have.
- Close with: "NGen Connect is a discovery platform. Results are based on vendor-provided information and have not been verified by NGen."`;

const FINAL_ANALYSIS_DEFENCE_SYSTEM = `You are NGen Connect Defence, an expert matchmaking advisor for Canadian defence and aerospace manufacturing.

You have gathered clarifying information. Now deliver a compliance-focused matchmaking analysis.

Rules:
- ONLY use the company data provided. Never invent companies, certifications, or compliance statuses.
- You have been provided the full candidate pool. Apply consultative judgment to select the 3 to 8 companies that best satisfy the user's compliance and capability requirements. Match score is a starting signal — exclude poor fits even if ranked high; surface a lower-ranked candidate if it uniquely meets a stated compliance requirement. If a "LOW CONFIDENCE" note appears, be honest: the database has no strong matches — say so clearly, explain the gap, and suggest search refinements rather than presenting poor fits.
- Open with 1–2 sentences acknowledging the user's requirements and summarizing the compliance-focused search you ran. Follow immediately with: "Note: NGen Connect supports capability discovery, not supplier qualification or procurement. All compliance statuses must be independently verified before engagement."
- For each match, use EXACTLY this format:

XX% · Company Name — one-line tagline describing their core defence capability

Compliance Status:
• CGP Registered: [YES / NO / Unknown — verify]
• ITAR Registered: [YES / NO / Unknown — verify]
• CMMC Level: [level or "Not on record — confirm before engagement"]
• Facility Clearance: [level or "Not on record"]
• DND Approved Vendor: [YES / NO / Unknown]

Key Capabilities:
• [specific capability from the data]
• [specific capability from the data]
• [additional capabilities as warranted — 3 to 5 bullets total]

Relevance to your requirement:
[2–3 sentences explaining why this company fits the original query AND the user's clarified requirements. Cite specific certifications, materials, capabilities, and compliance signals from the data.]

Considerations:
[1–2 sentences flagging compliance gaps, unverified certifications, or capabilities not confirmed in the data. E.g., "CMMC Level 2 not on record — must be confirmed before any CUI-handling engagement." Be honest about every unknown.]

Website: [URL]

- For XX%, use the "Match score" value provided in the company data.
- Integrity is paramount: explicitly flag every compliance status that is Unknown or not on record.
- After all matches, add: "Click **Generate Defence RFP** below to create a document with ITAR flow-down clauses and CGP handling requirements pre-filled."
- Web search: You have access to real-time web search. Use it for: (1) general context — e.g., CGP/ITAR/CMMC regulatory details, DND procurement rules, or defence standards; (2) verifying a specific certification, compliance status, or capability for a named company when the database record is missing, uncertain, or being questioned — go directly to the company's homepage URL (provided in the data) to fetch it, or search "site:[domain] [topic]" to pull company-specific results — do not do a generic web search that returns industry-wide content. Clearly label what is database-sourced vs. web-verified. Do not wholesale replace database profiles with web content. Cite the URL when you find something. If the company's site returns nothing on the specific fact, say so honestly.
- Close with: "NGen Connect is a discovery platform. Results are based on vendor-provided information and have not been verified by NGen."`;

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
  "claude-opus-4-8":   { input: 5.0,   output: 25.0  },
  "gpt-4.1":           { input: 2.0,   output: 8.0   },
  "gpt-4.1-mini":      { input: 0.4,   output: 1.6   },
  "deepseek-chat":     { input: 0.27,  output: 1.1   },
  "gemini-2.5-flash":  { input: 0.075, output: 0.30  },
};

const LLM_PRIORITY: LLMConfig[] = [
  {
    name: "Claude Opus 4.8",
    envKey: "ANTHROPIC_API_KEY",
    baseUrl: "https://api.anthropic.com/v1/",
    model: "claude-opus-4-8",
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
  const allCompanies = companies as SearchResult[];

  // Detect low confidence: best semantic score (excluding name/site matches at score=0) is below 50%
  const semanticScores = allCompanies.filter(c => c.score > 0).map(c => c.score);
  const topSemanticScore = semanticScores.length > 0 ? Math.max(...semanticScores) : 0;
  const lowConfidence = semanticScores.length > 0 && topSemanticScore < 0.50;

  const companyContext = allCompanies
    .map((c, i) => {
      const scoreLabel = c.score === 0
        ? "Direct name/site match"
        : `Match score: ${Math.round(c.score * 100)}%`;

      const base =
        `[${i + 1}] ${c.company_name} (${c.homepage})\n` +
        `   ${scoreLabel}\n` +
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

  const confidenceNote = lowConfidence
    ? `\nLOW CONFIDENCE: Best semantic similarity is only ${Math.round(topSemanticScore * 100)}%. The database likely has no strong matches for this specific query.\n`
    : "";

  return `Search query: "${query}"
Active filters: ${activeFilters}
${confidenceNote}
Candidate pool from the NGen Connect database (${allCompanies.length} candidates, ranked by relevance):

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
        generationConfig: { temperature: 0.3, maxOutputTokens: 3000 },
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
    max_tokens: 3000,
  });
  return {
    text: response.choices[0]?.message?.content || "No response generated.",
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
  };
}

async function callAnthropic(messages: ChatMessage[], system: string, apiKey: string, model: string): Promise<LLMResult> {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  const tools = [{ type: "web_search_20260209", name: "web_search" }];
  const workingMessages: Array<{ role: "user" | "assistant"; content: unknown }> = [...messages];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalContent: Array<{ type: string; text?: string }> = [];

  for (let i = 0; i < 5; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({ model, system, messages: workingMessages, max_tokens: 3000, tools }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Anthropic error ${res.status}`);
    }
    const data = await res.json();
    totalInputTokens += data.usage?.input_tokens || 0;
    totalOutputTokens += data.usage?.output_tokens || 0;
    finalContent = data.content || [];
    if (data.stop_reason !== "pause_turn") break;
    workingMessages.push({ role: "assistant", content: data.content });
  }

  const text =
    finalContent
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("\n")
      .trim() || "No response generated.";

  return { text, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
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
