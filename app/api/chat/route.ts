import { NextRequest, NextResponse } from "next/server";
import { SearchResult } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

type ChatMessage = { role: "user" | "assistant"; content: string };

const GATHER_CONTEXT_SYSTEM = `You are NGen Connect, an expert matchmaking advisor for the Canadian advanced manufacturing ecosystem (Industry 4.0).

You have searched a database of 1,000+ Canadian manufacturers and retrieved the top candidates. Ask 2–3 precise, technical follow-up questions grounded in what you actually found in the data.

OUTPUT FORMAT — output your response in EXACTLY this structure, with no deviations:

---INTRO---
A quick note on positioning: NGen Connect is a capabilities discovery platform, not a supplier identification, qualification, or procurement service. [1 sentence: what you found — e.g., "I found strong candidates in Ontario specializing in precision 5-axis CNC machining with AS9100D certification."] NGen Connect is a discovery platform. Results are based on vendor-provided information and have not been verified by NGen.
---QUESTIONS---
Q: [First question — specific and technical, grounded in what you found in the data. If candidates span different certification types, ask which applies. If materials vary, ask which grades are needed. If sizes differ, ask about production volume.]
OPTS: [Option A] | [Option B] | [Option C] | Any
Q: [Second question — different dimension from the first]
OPTS: [Option A] | [Option B] | [Option C] | Any
Q: [Third question — only include if genuinely useful; otherwise stop at 2]
OPTS: [Option A] | [Option B] | [Option C] | Any
---END---

Rules for OPTIONS:
- Provide exactly 3 domain-specific options drawn from what you found in the data, plus "Any" as the final option
- Options must be short (1–5 words) and specific — not generic
- The last option must always be "Any"
- Do NOT number, bullet, or add extra formatting to options`;

const GATHER_CONTEXT_DEFENCE_SYSTEM = `You are NGen Connect Defence, an expert matchmaking advisor for Canadian defence and aerospace manufacturing.

You have searched a database of Canadian companies and retrieved the top candidates for a defence procurement query. Ask 2–3 precise follow-up questions focused on compliance-gating and capability fit.

OUTPUT FORMAT — output your response in EXACTLY this structure, with no deviations:

---INTRO---
A quick note on positioning: NGen Connect Defence is a capabilities discovery platform, not a supplier qualification or procurement service. Compliance statuses (CGP, ITAR, CMMC) are based on vendor-provided information and must be independently verified before engagement. [1 sentence: what you found.] NGen Connect is a discovery platform. Results are based on vendor-provided information and have not been verified by NGen.
---QUESTIONS---
Q: [First question — prioritize compliance-gating: CGP registration, ITAR applicability, CMMC level, facility clearance, or DND-approved vendor list requirement]
OPTS: [Option A] | [Option B] | [Option C] | Any
Q: [Second question — capability or programme dimension]
OPTS: [Option A] | [Option B] | [Option C] | Any
Q: [Third question — only if genuinely needed]
OPTS: [Option A] | [Option B] | [Option C] | Any
---END---

Rules for OPTIONS:
- Provide exactly 3 domain-specific options drawn from what you found in the data, plus "Any" as the final option
- Options must be short (1–5 words)
- The last option must always be "Any"`;

const CONVERSATION_SYSTEM = `You are NGen Connect, an expert matchmaking advisor for the Canadian advanced manufacturing ecosystem (Industry 4.0).

The user has already received a matchmaking analysis. They are now asking a follow-up question about the results, a specific company, certifications, capabilities, or a refinement of the analysis.

Rules:
- Answer the question DIRECTLY. Do NOT ask any follow-up or clarifying questions under any circumstances.
- Ground your answer exclusively in the company data provided. If the data doesn't contain the answer, say so honestly.
- Keep answers concise and specific. If asked about a single company, focus only on that company.
- You may reference the conversation history to understand what was already discussed.
- Close with: "NGen Connect is a discovery platform. Results are based on vendor-provided information and have not been verified by NGen."`;

const FINAL_ANALYSIS_SYSTEM = `You are NGen Connect, an expert matchmaking advisor for the Canadian advanced manufacturing ecosystem (Industry 4.0).

You have gathered clarifying information from the user. Now deliver a precise, data-grounded matchmaking analysis in the structured format below.

Rules:
- ONLY use the company data provided. Never invent companies, capabilities, certifications, or materials.
- Select 4–6 companies that best match requirements. Match score is a starting signal — exclude poor fits, include strong ones regardless of rank.
- If "LOW CONFIDENCE" appears in the data: be honest, explain the gap, suggest refinements. Do not force-fit poor matches.
- Integrity: if a certification or capability is not confirmed in the data, flag it explicitly. Never assume it exists.
- Bullets must be specific: echo the user's exact specs, standards, tolerances, volumes. Generic bullets are not acceptable.

OUTPUT FORMAT — use exactly this structure:

[1–2 sentence intro: acknowledge requirements, summarize search run. Then: "Note: NGen Connect supports capability discovery, not supplier qualification or procurement."]

[For each company — EXACTLY this format:]

XX% · [Company Name](URL) — one-line tagline

XX% match — [1–2 sentences connecting score to user's specific requirements]

▶ [4–7 integrated bullets. Each bullet is a complete sentence that weaves together whatever data exists for this company — capabilities, certifications, industries, materials, customers, equipment, products, location, size, founded year. CRITICAL RULES: (1) Do NOT create separate label:value lines — never write "Certifications: N/A" or "Materials: N/A" or any similar label:value output. (2) When a structured array is empty but the Summary text mentions certifications, customers, materials, or compliance, EXTRACT those facts from the Summary and include them in the bullets as if they were confirmed data. (3) Include ALL certifications verbatim in one bullet — pull from Summary text if the certifications array is empty. (4) Mix data naturally. Examples: "Certified to ISO 9001:2015, AS9100D, and 15 API standards; has served oil & gas, mining, and heavy equipment manufacturers from their Red Deer, AB facility since 1995." or "Key customers include Medtronic, 3M, and Raytheon, indicating proven integration into tier-1 supply chains." or "Works with graphene and graphene oxide membranes for filtration applications (confirmed in database)." If materials are absent from both arrays and Summary, flag as "(inferred from capabilities — verify directly)".]

Gaps/risks:
▶ [specific gap with actionable guidance]
▶ [1–2 bullets max]

---

[Repeat for each company]

---

## Comparative Assessment

[Cross-company thematic analysis organized by decision criteria relevant to the query. For each theme, assess how the shortlisted companies compare — strengths, weaknesses, differentiation. 3–5 themes. Be specific and data-grounded.]

## Comparison Table (key points only)

| Company | [Criterion 1] | [Criterion 2] | [Criterion 3] | [Criterion 4] | [Criterion 5] |
|---------|--------------|--------------|--------------|--------------|--------------|
| [Co 1]  | [value]      | [value]      | [value]      | [value]      | [value]      |

Choose column headers relevant to the query (e.g. certifications, materials, capacity, location, key process). Keep cell values concise (1–4 words).

The information in this table is based on information provided by the vendor and has not been verified by NGen.

## Actionable Next Steps

- [Category 1 — e.g., "Immediate supplier engagement"]:
  - [Specific action for a named company]
  - [Specific action]
- [Category 2]:
  - [Action]

To formalize your shortlist into a structured brief, click **Generate RFP** below.

NGen Connect is a discovery platform. Results are based on vendor-provided information and have not been verified by NGen.`;

const FINAL_ANALYSIS_DEFENCE_SYSTEM = `You are NGen Connect Defence, an expert matchmaking advisor for Canadian defence and aerospace manufacturing.

You have gathered clarifying information. Now deliver a compliance-focused matchmaking analysis.

Rules:
- ONLY use the company data provided. Never invent companies, certifications, or compliance statuses.
- You have been provided the full candidate pool. Apply consultative judgment to select the 3 to 8 companies that best satisfy the user's compliance and capability requirements. Match score is a starting signal — exclude poor fits even if ranked high; surface a lower-ranked candidate if it uniquely meets a stated compliance requirement. If a "LOW CONFIDENCE" note appears, be honest: the database has no strong matches — say so clearly, explain the gap, and suggest search refinements rather than presenting poor fits.
- Open with 1–2 sentences acknowledging the user's requirements and summarizing the compliance-focused search you ran. Follow immediately with: "Note: NGen Connect supports capability discovery, not supplier qualification or procurement. All compliance statuses must be independently verified before engagement."
- For each match, use EXACTLY this format:

XX% · [Company Name](URL) — one-line tagline describing their core defence capability

XX% match — [1–2 sentences directly connecting the score to the user's specific requirements: echo their stated compliance needs (CGP, ITAR, CMMC level), certifications, materials, and programme context. Be specific.]

Compliance Status:
• CGP Registered: [YES / NO / Unknown — verify]
• ITAR Registered: [YES / NO / Unknown — verify]
• CMMC Level: [level or "Not on record — confirm before engagement"]
• Facility Clearance: [level or "Not on record"]
• DND Approved Vendor: [YES / NO / Unknown]

Key Capabilities and Fit:
• [capability that directly addresses a stated requirement — echo the user's spec, standard, or material where relevant; 1–2 sentences per bullet]
• [next capability tied to the user's stated needs]
• [3–5 bullets total; each bullet must connect data to requirement]

Gaps/risks versus your brief:
• [specific compliance or capability gap with actionable guidance — e.g., "CMMC Level 2 not on record — must be confirmed before any CUI-handling engagement"]
• [1–2 bullets max; flag every unknown explicitly]

Website: [URL]

- For XX%, use the "Match score" value provided in the company data.
- Integrity is paramount: explicitly flag every compliance status that is Unknown or not on record.
- Bullets must be dense and specific: quote or paraphrase the user's exact specs, standards, and programme details. Generic bullets are not acceptable.
OUTPUT FORMAT — use exactly this structure:

[1–2 sentence intro: acknowledge requirements, summarize compliance-focused search. Then: "Note: NGen Connect supports capability discovery, not supplier qualification or procurement. All compliance statuses must be independently verified before engagement."]

[For each company — EXACTLY this format:]

XX% · [Company Name](URL) — one-line tagline

XX% match — [1–2 sentences connecting score to user's compliance and capability requirements]

Compliance Status:
▶ CGP Registered: [YES / NO / Unknown — verify]
▶ ITAR Registered: [YES / NO / Unknown — verify]
▶ CMMC Level: [level or "Not on record — confirm before engagement"]
▶ Facility Clearance: [level or "Not on record"]
▶ DND Approved Vendor: [YES / NO / Unknown]

▶ [4–7 integrated bullets. Each bullet is a complete sentence weaving together whatever data exists — capabilities, certifications, industries, materials, key customers, equipment, products, export compliance, location, size, founded year. CRITICAL RULES: (1) Never write label:value lines like "Certifications: N/A". (2) When structured arrays are empty, EXTRACT certifications, customers, materials, and compliance from the Summary text. (3) Include ALL certifications verbatim in one bullet. If materials are absent from both arrays and Summary, flag as "(inferred from capabilities — verify directly)". Reference export compliance and customer data where present.]

Gaps/risks:
▶ [specific compliance or capability gap with actionable guidance]
▶ [1–2 bullets max]

---

[Repeat for each company]

---

## Comparative Assessment

[Cross-company thematic analysis: compliance posture, capability depth, programme experience, capacity. 3–5 themes. Be specific and data-grounded.]

## Comparison Table (key points only)

| Company | CGP | ITAR | Key Capability | DND Experience | Province |
|---------|-----|------|---------------|----------------|----------|
| [Co 1]  | [value] | [value] | [value] | [value] | [value] |

The information in this table is based on information provided by the vendor and has not been verified by NGen.

## Actionable Next Steps

- [Category — e.g., "Compliance verification"]:
  - [Specific action for a named company]
- [Category — e.g., "Capability engagement"]:
  - [Action]

Click **Generate Defence RFP** below to create a document with ITAR flow-down clauses and CGP handling requirements pre-filled.

NGen Connect is a discovery platform. Results are based on vendor-provided information and have not been verified by NGen.`;

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
  "command-r-plus-08-2024":    { input: 2.5,   output: 10.0  },
  "claude-sonnet-4-6":         { input: 3.0,   output: 15.0  },
  "claude-haiku-4-5-20251001": { input: 0.80,  output: 4.0   },
  "claude-opus-4-8":           { input: 15.0,  output: 75.0  },
  "gpt-4.1":                   { input: 2.0,   output: 8.0   },
  "gpt-4.1-mini":              { input: 0.4,   output: 1.6   },
  "deepseek-chat":             { input: 0.27,  output: 1.1   },
  "gemini-2.5-flash":          { input: 0.075, output: 0.30  },
  "gemini-2.0-flash":          { input: 0.10,  output: 0.40  },
};

// Routing strategy:
//   gather_context / conversation → Cohere Command R+ (fast, no tool-calling conflicts)
//   final_analysis / generate_rfp → Claude Sonnet 4.6 (best synthesis quality, supports streaming)
// Haiku is intentionally excluded — it lacks programmatic tool-calling support.

function getLLMForMode(mode: string): { config: LLMConfig; apiKey: string } | null {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const cohereKey    = process.env.COHERE_API_KEY;

  if ((mode === "final_analysis" || mode === "generate_rfp") && anthropicKey) {
    return {
      config: { name: "Claude Sonnet 4.6", envKey: "ANTHROPIC_API_KEY", baseUrl: "https://api.anthropic.com/v1/", model: "claude-sonnet-4-6" },
      apiKey: anthropicKey,
    };
  }
  // gather_context, conversation, and any fallback → Cohere
  if (cohereKey) {
    return {
      config: { name: "Cohere Command R+", envKey: "COHERE_API_KEY", baseUrl: "https://api.cohere.com/v2", model: "command-r-plus-08-2024" },
      apiKey: cohereKey,
    };
  }
  return getBestLLM();
}

const LLM_PRIORITY: LLMConfig[] = [
  {
    name: "Cohere Command R+",
    envKey: "COHERE_API_KEY",
    baseUrl: "https://api.cohere.com/v2",
    model: "command-r-plus-08-2024",
  },
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

function buildContextPrompt(query: string, companies: SearchResult[], filters: Record<string, string[]>, defenceMode = false, limit = 10, research?: Map<string, string>): string {
  const allCompanies = (companies as SearchResult[]).slice(0, limit);

  // Detect low confidence: best semantic score (excluding name/site matches at score=0) is below 50%
  const semanticScores = allCompanies.filter(c => c.score > 0).map(c => c.score);
  const topSemanticScore = semanticScores.length > 0 ? Math.max(...semanticScores) : 0;
  const lowConfidence = semanticScores.length > 0 && topSemanticScore < 0.50;

  const companyContext = allCompanies
    .map((c, i) => {
      const scoreLabel = c.score === 0
        ? "Direct name/site match"
        : `Match score: ${Math.round(c.score * 100)}%`;

      // Only emit a field line when it has real data — omitting empty fields prevents the LLM
      // from regurgitating "N/A" labels into its output instead of synthesizing prose.
      const f = (label: string, value: string | string[]): string => {
        const v = Array.isArray(value) ? value.filter(Boolean).join(", ") : (value || "").trim();
        return v ? `   ${label}: ${v}\n` : "";
      };

      const caps = c.capabilities_enhanced.length ? c.capabilities_enhanced : c.capabilities;
      const summary = (c.summary || c.tagline || "").trim();

      // When structured arrays are sparse but the summary is rich (>100 chars), instruct
      // the LLM to mine the summary for any certifications, customers, or materials it mentions.
      const summaryIsRich = summary.length > 100;
      const hasStructuredCerts = c.certifications.length > 0;
      const sparseNote = (summaryIsRich && !hasStructuredCerts)
        ? `   [NOTE: structured arrays are sparse — extract certifications, customers, materials, and export compliance from the Summary text below]\n`
        : "";

      const liveResearch = research?.get(c.company_name.toLowerCase());
      const researchBlock = liveResearch
        ? `   [LIVE WEB RESEARCH — supplement DB gaps with this; prioritize for certs/customers/materials not in DB]:\n${liveResearch.split("\n").map(l => `   ${l}`).join("\n")}\n`
        : "";

      const base =
        `[${i + 1}] ${c.company_name} (${c.homepage})\n` +
        `   ${scoreLabel}\n` +
        `   Location: ${c.city ? c.city + ", " : ""}${c.province}\n` +
        f("Type", c.company_type) +
        f("Business model", c.business_model) +
        f("Size", c.headcount_range) +
        f("Industries", c.industries_served) +
        f("Capabilities", caps) +
        f("Products", c.products) +
        f("Technology", c.technology) +
        f("Materials", c.materials) +
        f("Equipment", c.equipment) +
        f("Certifications", c.certifications) +
        f("Key Customers", c.key_customers) +
        f("Export Compliance", c.export_compliance) +
        f("Capacity", c.capacity) +
        sparseNote +
        researchBlock +
        (summary ? `   Summary: ${summary}` : "");

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

async function callCohere(messages: ChatMessage[], system: string, apiKey: string, model: string): Promise<LLMResult> {
  const response = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        ...messages,
      ],
      max_tokens: 4096,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Cohere chat error ${response.status}`);
  }

  const data = await response.json();

  // Cohere v2 returns content as array of blocks OR plain string depending on model version
  const rawContent = data.message?.content;
  let text = "No response generated.";
  if (typeof rawContent === "string" && rawContent.trim()) {
    text = rawContent.trim();
  } else if (Array.isArray(rawContent)) {
    const joined = rawContent
      .filter((b: { type: string; text?: string }) => b.type === "text")
      .map((b: { type: string; text?: string }) => b.text || "")
      .join("\n")
      .trim();
    if (joined) text = joined;
  } else if (typeof data.text === "string" && data.text.trim()) {
    text = data.text.trim();
  }

  return {
    text,
    inputTokens:  data.usage?.billed_units?.input_tokens  || 0,
    outputTokens: data.usage?.billed_units?.output_tokens || 0,
  };
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

interface QuestionCard { q: string; opts: string[] }

// Strip lines/segments where the LLM wrote "N/A" despite being told to omit them.
function stripNALines(text: string): string {
  const naValue = /^n\/a$/i;
  return text
    .split("\n")
    .map(line => {
      const trimmed = line.trim();
      // Pipe-separated metadata line (Location | Size | Founded) — NOT markdown table rows
      if (trimmed.includes("|") && !trimmed.startsWith("|")) {
        const parts = trimmed.split("|").map(p => p.trim());
        const kept = parts.filter(p => {
          const val = p.replace(/^[\w\s\/]+:\s*/i, "").trim();
          return !naValue.test(val) && val !== "";
        });
        // If every segment was N/A, drop the whole line
        return kept.length === 0 ? "" : kept.join(" | ");
      }
      // Simple "Label: N/A" line
      const val = trimmed.replace(/^[\w\s\/()]+:\s*/i, "").trim();
      if (naValue.test(val)) return "";
      return line;
    })
    .filter((line, i, arr) => {
      // Collapse consecutive blank lines into one
      if (line.trim() === "") return i === 0 || arr[i - 1].trim() !== "";
      return true;
    })
    .join("\n");
}

function parseQuestionCards(text: string): { intro: string; questionCards: QuestionCard[] } {
  const INTRO_TAG = "---INTRO---";
  const Q_TAG     = "---QUESTIONS---";
  const END_TAG   = "---END---";

  const introIdx = text.indexOf(INTRO_TAG);
  const qIdx     = text.indexOf(Q_TAG);

  if (introIdx === -1 || qIdx === -1) return { intro: text, questionCards: [] };

  const intro = text.slice(introIdx + INTRO_TAG.length, qIdx).trim();

  const endIdx = text.indexOf(END_TAG, qIdx);
  const qBlock = (endIdx !== -1
    ? text.slice(qIdx + Q_TAG.length, endIdx)
    : text.slice(qIdx + Q_TAG.length)
  ).trim();

  const questionCards: QuestionCard[] = [];
  // Split on lines that start a new Q: block
  const blocks = qBlock.split(/(?=Q:)/i).map(b => b.trim()).filter(Boolean);

  for (const block of blocks) {
    const qMatch    = block.match(/^Q:\s*(.+)/i);
    const optsMatch = block.match(/OPTS:\s*(.+)/i);
    if (qMatch && optsMatch) {
      const q    = qMatch[1].trim();
      const opts = optsMatch[1].split("|").map(o => o.trim()).filter(Boolean);
      if (q && opts.length >= 2) questionCards.push({ q, opts });
    }
  }

  return { intro, questionCards };
}

async function callAnthropicStream(
  messages: ChatMessage[], system: string, apiKey: string, model: string
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 8096, temperature: 0.3, system, messages, stream: true }),
  });
  if (!response.ok || !response.body) throw new Error(`Anthropic stream error ${response.status}`);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = response.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === "message_start") {
                inputTokens = ev.message?.usage?.input_tokens || 0;
              } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: ev.delta.text })}\n\n`));
              } else if (ev.type === "message_delta") {
                const outTokens = ev.usage?.output_tokens || 0;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, in: inputTokens, out: outTokens })}\n\n`));
              }
            } catch { /* skip malformed event */ }
          }
        }
      } catch (err) { controller.error(err); }
      finally { controller.close(); }
    },
  });
}

// Gemini grounded research: live Google Search per company, cached in Supabase for 7 days.
// Returns null silently if GEMINI_API_KEY is not set or the request fails.
async function researchWithGemini(
  companies: SearchResult[],
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Map<string, string>> {
  const key = process.env.GEMINI_API_KEY;
  const results = new Map<string, string>();
  if (!key) { console.log("[Gemini research] GEMINI_API_KEY not set — skipping web enrichment"); return results; }
  if (companies.length === 0) return results;
  console.log(`[Gemini research] Starting web lookup for: ${companies.map(c => c.company_name).join(", ")}`);

  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  await Promise.all(companies.map(async c => {
    const nameKey = c.company_name.toLowerCase();

    // Supabase cache check
    try {
      const { data } = await supabase
        .from("company_research_cache")
        .select("research_text, cached_at")
        .eq("company_name", c.company_name)
        .single();
      if (data && Date.now() - new Date(data.cached_at).getTime() < SEVEN_DAYS) {
        console.log(`[Gemini research] ${c.company_name}: cache hit`);
        results.set(nameKey, data.research_text);
        return;
      }
    } catch { /* table may not exist yet, continue to live fetch */ }

    const prompt = `Research the Canadian manufacturer/supplier "${c.company_name}" at ${c.homepage}.
Report concisely (max 250 words):
1. Certifications held (ISO, AS9100, NADCAP, ITAR, CGP, IATF 16949, Health Canada GMP, etc.)
2. Key OEM customers or named partnerships
3. Materials, technologies, and processes they specialize in
4. Industries and markets served
5. Company size, headcount, locations, year founded
6. Notable awards, programs, or recent news
Be factual. Skip generic marketing language.`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(20000), // 20s per company max
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],  // snake_case required by v1beta
            generationConfig: { temperature: 0.1, maxOutputTokens: 600 },
          }),
        }
      );
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error(`[Gemini research] ${c.company_name}: API ${res.status} — ${errBody.slice(0, 200)}`);
        return;
      }
      const data = await res.json();
      const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) { console.log(`[Gemini research] ${c.company_name}: empty response from Gemini`); return; }
      console.log(`[Gemini research] ${c.company_name}: ${text.length} chars fetched from web`);
      results.set(nameKey, text);
      // Await the upsert so it completes before streaming starts (prevents serverless cutoff)
      const { error: upsertErr } = await supabase.from("company_research_cache").upsert({
        company_name: c.company_name,
        research_text: text,
        cached_at: new Date().toISOString(),
      });
      if (upsertErr) console.error(`[Gemini research] cache write failed for ${c.company_name}:`, upsertErr.message);
      else console.log(`[Gemini research] ${c.company_name}: cached in Supabase`);
    } catch (err) { console.error(`[Gemini research] ${c.company_name} fetch failed:`, err); }
  }));

  return results;
}

async function callCohereStream(
  messages: ChatMessage[], system: string, apiKey: string, model: string
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      max_tokens: 4096,
      temperature: 0.3,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) throw new Error(`Cohere stream error ${response.status}`);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = response.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === "content-delta" && ev.delta?.text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: ev.delta.text })}\n\n`));
              } else if (ev.type === "message-end") {
                const u = ev.delta?.usage?.billed_units;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, in: u?.input_tokens || 0, out: u?.output_tokens || 0 })}\n\n`));
              }
            } catch { /* skip malformed event */ }
          }
        }
      } catch (err) { controller.error(err); }
      finally { controller.close(); }
    },
  });
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
      userMessage,
      history = [],
    } = await request.json();

    const llm = getLLMForMode(mode) ?? getBestLLM();
    if (!llm) {
      return NextResponse.json(
        { error: "No LLM API keys configured. Set ANTHROPIC_API_KEY or COHERE_API_KEY." },
        { status: 500 }
      );
    }

    // For final_analysis: run Gemini grounded research in parallel with prompt assembly.
    // Research enriches the context with live web data (certs, customers, materials)
    // that may be absent from the scraped DB. Cached in Supabase for 7 days.
    let research: Map<string, string> | undefined;
    if (mode === "final_analysis" || mode === "conversation") {
      const supabase = await createClient();
      const researchCos = (companies as SearchResult[]).slice(0, 8);
      research = await researchWithGemini(researchCos, supabase).catch(() => undefined);
    }

    // Use tighter candidate limits per mode to stay within output token budget
    const gatherContext   = buildContextPrompt(query, companies, filters, defenceMode, 12);
    const analysisContext = buildContextPrompt(query, companies, filters, defenceMode, 8, research);
    const gatherUserMsg   = gatherContext + "\n\nAsk 2–3 targeted follow-up questions to refine your recommendation.";

    let systemPrompt: string;
    let messages: ChatMessage[];

    if (mode === "gather_context") {
      systemPrompt = defenceMode ? GATHER_CONTEXT_DEFENCE_SYSTEM : GATHER_CONTEXT_SYSTEM;
      messages = [{ role: "user", content: gatherUserMsg }];
    } else if (mode === "final_analysis") {
      systemPrompt = defenceMode ? FINAL_ANALYSIS_DEFENCE_SYSTEM : FINAL_ANALYSIS_SYSTEM;
      messages = [
        { role: "user", content: analysisContext },
        { role: "assistant", content: followUpQuestions },
        { role: "user", content: userAnswers + "\n\nBased on my answers above, deliver your final matchmaking analysis now. Do NOT ask any further clarifying questions — proceed directly to the ranked company analysis using the candidate data provided, even if my answers are broad or general." },
      ];
    } else if (mode === "conversation") {
      systemPrompt = CONVERSATION_SYSTEM;
      const contextBlock = buildContextPrompt(query, companies, filters, defenceMode, 8, research);
      // Last 20 messages from the client, converted to LLM-compatible roles
      const historyMsgs: ChatMessage[] = (history as { role: string; content: string }[])
        .slice(-20)
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      messages = [
        { role: "user", content: contextBlock },
        ...historyMsgs,
        { role: "user", content: (userMessage as string) + "\n\nAnswer directly. Do NOT ask any clarifying questions." },
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

    // Stream final_analysis and conversation via Anthropic or Cohere
    if (mode === "final_analysis" || mode === "conversation") {
      let stream: ReadableStream<Uint8Array>;
      if (llm.config.envKey === "ANTHROPIC_API_KEY") {
        stream = await callAnthropicStream(messages, systemPrompt, llm.apiKey, llm.config.model);
      } else if (llm.config.envKey === "COHERE_API_KEY") {
        stream = await callCohereStream(messages, systemPrompt, llm.apiKey, llm.config.model);
      } else {
        // Non-streaming fallback for other providers — fall through to non-streaming path below
        stream = null as unknown as ReadableStream<Uint8Array>;
      }
      if (stream) {
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Model": llm.config.name,
            "X-Model-Id": llm.config.model,
            "X-Web-Research": research && research.size > 0 ? String(research.size) : "0",
          },
        });
      }
    }

    let rawResult: LLMResult;
    if (llm.config.envKey === "COHERE_API_KEY") {
      rawResult = await callCohere(messages, systemPrompt, llm.apiKey, llm.config.model);
    } else if (llm.config.envKey === "ANTHROPIC_API_KEY") {
      rawResult = await callAnthropic(messages, systemPrompt, llm.apiKey, llm.config.model);
    } else if (llm.config.envKey === "GEMINI_API_KEY" && !llm.config.baseUrl) {
      rawResult = await callGemini(messages, systemPrompt, llm.apiKey, llm.config.model);
    } else {
      rawResult = await callOpenAICompatible(messages, systemPrompt, llm.apiKey, llm.config.baseUrl, llm.config.model);
    }

    const result: LLMResult = {
      ...rawResult,
      text: stripNALines(rawResult.text),
    };

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

    if (mode === "gather_context") {
      const { intro, questionCards } = parseQuestionCards(result.text);
      // rawQuestions preserves the full Q/OPTS context for the final_analysis turn
      const rawQuestions = intro + (questionCards.length
        ? "\n\n" + questionCards.map((c, i) => `${i + 1}. ${c.q}\n   Options: ${c.opts.join(" | ")}`).join("\n\n")
        : "");
      return NextResponse.json({
        summary: intro,
        rawQuestions,
        questionCards,
        model: llm.config.name,
        modelId: llm.config.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd,
      });
    }

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
