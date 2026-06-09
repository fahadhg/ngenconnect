"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getFilteredOptions } from "@/lib/filterMap";
import { getHsSlugsForCompany, getPrimaryHsSlug } from "@/lib/trade/granularHsMap";
import type { SlugSummary } from "@/app/api/trade/sector-summary/route";

interface SearchResult {
  company_name: string;
  site: string;
  homepage: string;
  description: string;
  sectors: string[];
  capabilities: string[];
  certifications: string[];
  materials: string[];
  province: string;
  company_size: string;
  score: number;
}

interface FilterOptions {
  sectors: string[];
  capabilities: string[];
  certifications: string[];
  materials: string[];
  provinces: string[];
  company_sizes: string[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  companies?: SearchResult[];
  model?: string;
  phase?: "questions" | "analysis" | "rfp";
}

interface UsageStat {
  id: number;
  query: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
  llmCostUsd: number;
  embeddingCostUsd: number;
}

const PRICING_TABLE = [
  { model: "Claude Sonnet 4.6", input: "$3.00", output: "$15.00" },
  { model: "GPT-4.1",           input: "$2.00", output: "$8.00"  },
  { model: "GPT-4.1 Mini",      input: "$0.40", output: "$1.60"  },
  { model: "DeepSeek V3",       input: "$0.27", output: "$1.10"  },
  { model: "Gemini 2.5 Flash",  input: "$0.075",output: "$0.30"  },
  { model: "Gemini Embedding",  input: "$0.025",output: "—"      },
];

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}

function Home() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [defenceMode, setDefenceMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);
  const [usageStats, setUsageStats] = useState<UsageStat[]>([]);
  const [statsHydrated, setStatsHydrated] = useState(false);
  const [slugStats, setSlugStats] = useState<Record<string, SlugSummary>>({});
  const [awaitingFollowUp, setAwaitingFollowUp] = useState(false);
  const [pendingCompanies, setPendingCompanies] = useState<SearchResult[]>([]);
  const [pendingQuery, setPendingQuery] = useState("");
  const [storedFollowUpQuestions, setStoredFollowUpQuestions] = useState("");
  const [storedUserAnswers, setStoredUserAnswers] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("ngen_usage_stats");
      if (stored) setUsageStats(JSON.parse(stored));
    } catch {}
    setStatsHydrated(true);
  }, []);

  useEffect(() => {
    const sector = searchParams.get("sector");
    if (sector) setFilters(prev => ({ ...prev, sectors: [sector] }));
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/trade/sector-summary")
      .then(r => r.json())
      .then(setSlugStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!statsHydrated) return;
    try {
      localStorage.setItem("ngen_usage_stats", JSON.stringify(usageStats));
    } catch {}
  }, [usageStats, statsHydrated]);

  const availableOptions = useMemo(() => {
    if (!filterOptions) return filterOptions;
    const { capabilities, certifications, materials } = getFilteredOptions(
      {
        capabilities: filterOptions.capabilities,
        certifications: filterOptions.certifications,
        materials: filterOptions.materials,
      },
      filters.sectors || [],
      filters.capabilities || []
    );
    return { ...filterOptions, capabilities, certifications, materials };
  }, [filterOptions, filters.sectors, filters.capabilities]);

  function handleSectorChange(newSectors: string[]) {
    if (!filterOptions) return;
    const derived = getFilteredOptions(
      { capabilities: filterOptions.capabilities, certifications: filterOptions.certifications, materials: filterOptions.materials },
      newSectors, []
    );
    const capSet = new Set(derived.capabilities);
    const certSet = new Set(derived.certifications);
    const matSet = new Set(derived.materials);
    setFilters((prev) => ({
      ...prev,
      sectors: newSectors,
      capabilities: (prev.capabilities || []).filter((c) => capSet.has(c)),
      certifications: (prev.certifications || []).filter((c) => certSet.has(c)),
      materials: (prev.materials || []).filter((m) => matSet.has(m)),
    }));
  }

  function handleCapabilityChange(newCapabilities: string[]) {
    if (!filterOptions) return;
    const derived = getFilteredOptions(
      { capabilities: filterOptions.capabilities, certifications: filterOptions.certifications, materials: filterOptions.materials },
      filters.sectors || [], newCapabilities
    );
    const certSet = new Set(derived.certifications);
    const matSet = new Set(derived.materials);
    setFilters((prev) => ({
      ...prev,
      capabilities: newCapabilities,
      certifications: (prev.certifications || []).filter((c) => certSet.has(c)),
      materials: (prev.materials || []).filter((m) => matSet.has(m)),
    }));
  }

  useEffect(() => {
    fetch("/api/search")
      .then((r) => r.json())
      .then((d) => setFilterOptions(d.filter_options))
      .catch(console.error);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSearch(searchQuery: string) {
    if (!searchQuery.trim() || loading) return;

    // If we're mid-conversation waiting for answers, route to final analysis
    if (awaitingFollowUp) {
      return handleFinalAnalysis(searchQuery);
    }

    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: searchQuery }]);
    setQuery("");

    try {
      // Step 1: search the database
      const searchRes = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, filters, defenceMode }),
      });
      const searchData = await searchRes.json();
      if (searchData.error) throw new Error(searchData.error);

      const foundCompanies: SearchResult[] = searchData.results ?? [];

      // Step 2: LLM reviews candidates and asks targeted follow-up questions
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          companies: foundCompanies,
          filters,
          embeddingTokens: searchData.embeddingTokens,
          embeddingCostUsd: searchData.embeddingCostUsd,
          mode: "gather_context",
          defenceMode,
        }),
      });
      const chatData = await chatRes.json();

      const questionsText = chatData.summary || chatData.error || "No questions generated.";

      // Save state for the follow-up turn
      setPendingCompanies(foundCompanies);
      setPendingQuery(searchQuery);
      setStoredFollowUpQuestions(questionsText);
      setAwaitingFollowUp(true);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: questionsText,
          model: chatData.model,
          phase: "questions",
        },
      ]);

      setUsageStats((prev) => [
        {
          id: Date.now(),
          query: searchQuery,
          model: chatData.model || "Unknown",
          inputTokens: chatData.inputTokens || 0,
          outputTokens: chatData.outputTokens || 0,
          embeddingTokens: searchData.embeddingTokens || 0,
          llmCostUsd: chatData.costUsd || 0,
          embeddingCostUsd: searchData.embeddingCostUsd || 0,
        },
        ...prev,
      ]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${errorMsg}` }]);
      setAwaitingFollowUp(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleFinalAnalysis(answers: string) {
    if (!answers.trim() || loading) return;
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: answers }]);
    setQuery("");
    setStoredUserAnswers(answers);

    try {
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: pendingQuery,
          companies: pendingCompanies,
          filters,
          mode: "final_analysis",
          defenceMode,
          userAnswers: answers,
          followUpQuestions: storedFollowUpQuestions,
        }),
      });
      const chatData = await chatRes.json();

      setAwaitingFollowUp(false);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: chatData.summary || chatData.error || "No analysis generated.",
          companies: pendingCompanies,
          model: chatData.model,
          phase: "analysis",
        },
      ]);

      setUsageStats((prev) => [
        {
          id: Date.now(),
          query: `[Refined] ${pendingQuery}`,
          model: chatData.model || "Unknown",
          inputTokens: chatData.inputTokens || 0,
          outputTokens: chatData.outputTokens || 0,
          embeddingTokens: 0,
          llmCostUsd: chatData.costUsd || 0,
          embeddingCostUsd: 0,
        },
        ...prev,
      ]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${errorMsg}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateRFP(analysisText: string) {
    if (loading) return;
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: "Generate an RFP based on these matches." }]);

    try {
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: pendingQuery,
          companies: pendingCompanies,
          filters,
          mode: "generate_rfp",
          defenceMode,
          userAnswers: storedUserAnswers,
          followUpQuestions: storedFollowUpQuestions,
          analysisText,
        }),
      });
      const chatData = await chatRes.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: chatData.summary || chatData.error || "No RFP generated.",
          model: chatData.model,
          phase: "rfp",
        },
      ]);

      setUsageStats((prev) => [
        {
          id: Date.now(),
          query: "[RFP Generation]",
          model: chatData.model || "Unknown",
          inputTokens: chatData.inputTokens || 0,
          outputTokens: chatData.outputTokens || 0,
          embeddingTokens: 0,
          llmCostUsd: chatData.costUsd || 0,
          embeddingCostUsd: 0,
        },
        ...prev,
      ]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${errorMsg}` }]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "3D printing companies in Ontario",
    "AS9100 certified aerospace machining",
    "AI for manufacturing quality inspection",
    "CNC machining with titanium",
    "Cybersecurity for manufacturing OT",
    "Composite manufacturing for automotive",
  ];

  const defenceSuggestions = [
    "ITAR-registered precision machining Ontario",
    "CGP-certified electronics assembly suppliers",
    "AS9100 aerospace composites manufacturers",
    "DND-approved defence contractors Quebec",
    "CMMC certified cybersecurity OT systems",
    "Controlled Goods naval systems suppliers",
  ];

  const activeFilterCount = Object.values(filters).reduce((sum, arr) => sum + arr.length, 0);
  const sessionTotals = usageStats.reduce(
    (acc, s) => ({
      inputTokens: acc.inputTokens + s.inputTokens,
      outputTokens: acc.outputTokens + s.outputTokens,
      embeddingTokens: acc.embeddingTokens + s.embeddingTokens,
      costUsd: acc.costUsd + s.llmCostUsd + s.embeddingCostUsd,
    }),
    { inputTokens: 0, outputTokens: 0, embeddingTokens: 0, costUsd: 0 }
  );

  return (
    <div className="flex flex-1 overflow-hidden min-h-0">
      {/* Left: Filter Sidebar */}
      <aside className={`${sidebarOpen ? "w-72" : "w-0"} transition-all duration-300 bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden shadow-sm`}>
        <div className="w-72 h-full flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Refine Results</p>
            {activeFilterCount > 0 && (
              <button onClick={() => setFilters({})} className="text-xs text-ngen-orange font-semibold hover:text-orange-600 transition-colors">
                Clear ({activeFilterCount})
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            <FilterSection label="Sector / Industry" options={filterOptions?.sectors || []} selected={filters.sectors || []} onChange={handleSectorChange} />
            <FilterSection label="Capabilities" options={availableOptions?.capabilities || filterOptions?.capabilities || []} selected={filters.capabilities || []} onChange={handleCapabilityChange} dimmed={(filters.sectors || []).length > 0 && (availableOptions?.capabilities.length ?? 0) < (filterOptions?.capabilities.length ?? 0)} />
            <FilterSection label="Certifications" options={availableOptions?.certifications || filterOptions?.certifications || []} selected={filters.certifications || []} onChange={(v) => setFilters((prev) => ({ ...prev, certifications: v }))} dimmed={(filters.sectors || []).length > 0 && (availableOptions?.certifications.length ?? 0) < (filterOptions?.certifications.length ?? 0)} />
            <FilterSection label="Materials" options={availableOptions?.materials || filterOptions?.materials || []} selected={filters.materials || []} onChange={(v) => setFilters((prev) => ({ ...prev, materials: v }))} dimmed={(filters.sectors || []).length > 0 && (availableOptions?.materials.length ?? 0) < (filterOptions?.materials.length ?? 0)} />
            <FilterSection label="Province" options={filterOptions?.provinces || []} selected={filters.province || []} onChange={(v) => setFilters((prev) => ({ ...prev, province: v }))} single />
            <FilterSection label="Company Size" options={filterOptions?.company_sizes || []} selected={filters.company_size || []} onChange={(v) => setFilters((prev) => ({ ...prev, company_size: v }))} single />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-5 py-3.5 flex items-center gap-4 shadow-sm">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-gray-100 rounded-lg transition duration-200 flex-shrink-0 text-gray-500 hover:text-gray-900" title="Toggle filters">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 12h10M10 20h4" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-700">Search</span>
          {activeFilterCount > 0 && (
            <span className="text-xs font-semibold text-ngen-orange bg-ngen-orange/10 border border-ngen-orange/20 px-3 py-1 rounded-full">
              {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
            </span>
          )}
          <button
            onClick={() => setDefenceMode(!defenceMode)}
            title="Toggle Defence Mode — filters to defence-relevant companies and uses compliance-aware prompts"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border ${
              defenceMode
                ? "bg-ngen-navy text-white border-ngen-navy shadow-md"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700"
            }`}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 013 10c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286z" />
            </svg>
            Defence
            {defenceMode && <span className="text-[10px] font-black bg-white/20 px-1.5 py-0.5 rounded tracking-wider">ON</span>}
          </button>
          <button
            onClick={() => setStatsOpen(!statsOpen)}
            className={`ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition duration-200 border ${statsOpen ? "bg-gray-900 text-white border-gray-900 shadow-md" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Usage
            {usageStats.length > 0 && (
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${statsOpen ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                ${sessionTotals.costUsd.toFixed(4)}
              </span>
            )}
          </button>
        </header>

        {/* Body row */}
        <div className="flex-1 flex min-h-0">
          {/* Chat area */}
          <div className="flex-1 overflow-y-auto px-5 py-6 min-w-0">
            {messages.length === 0 ? (
              <div className="max-w-2xl mx-auto pt-16">
                <div className="mb-12 text-center">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-ngen-orange/10 border border-ngen-orange/20 rounded-full mb-6">
                    <div className="w-2 h-2 bg-ngen-orange rounded-full animate-pulse" />
                    <span className="text-xs font-semibold text-ngen-orange uppercase tracking-wider">AI-Powered Matchmaking</span>
                  </div>
                  <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight mb-4 text-balance">
                    {defenceMode ? "Find your defence supply chain partner" : "Find your next manufacturing partner"}
                  </h2>
                  <p className="text-gray-500 text-base leading-relaxed max-w-2xl mx-auto">
                    {defenceMode
                      ? "Searching 374 defence-relevant Canadian companies — filtered by ITAR registration, CGP status, AS9100 certification, and DND contractor history."
                      : "Search 1,000+ Canadian manufacturers, suppliers, and technology providers. Use natural language to discover the perfect match for your needs."}
                  </p>
                </div>
                <div className="mb-12 flex flex-col gap-3">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch(query)}
                    placeholder="Describe what you're looking for..."
                    className="w-full px-5 py-4 bg-white border-2 border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-ngen-orange focus:ring-2 focus:ring-ngen-orange/20 transition-all"
                  />
                  <button onClick={() => handleSearch(query)} disabled={loading || !query.trim()} className="px-6 py-3 bg-ngen-orange text-white font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg">
                    {loading ? "Searching..." : "Search"}
                  </button>
                </div>
                <div className="mb-12">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Try these searches</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(defenceMode ? defenceSuggestions : suggestions).map((s, i) => (
                      <button key={s} onClick={() => handleSearch(s)} disabled={loading}
                        className={`text-left px-4 py-3.5 bg-white border rounded-lg text-sm text-gray-700 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md ${defenceMode ? "border-gray-200 hover:border-ngen-navy hover:bg-ngen-navy/5" : "border-gray-200 hover:border-ngen-orange hover:bg-ngen-orange/5"}`}>
                        <span className={`text-xs font-semibold block mb-1 opacity-60 group-hover:opacity-100 transition-opacity ${defenceMode ? "text-ngen-navy" : "text-ngen-orange"}`}>
                          {defenceMode ? `Defence ${i + 1}` : `Example ${i + 1}`}
                        </span>
                        <span className={`text-sm transition-colors ${defenceMode ? "group-hover:text-ngen-navy" : "group-hover:text-ngen-orange"} text-gray-900`}>{s}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-6 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">How it works</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {[
                      { num: "01", title: "Semantic Search", desc: "Your query is embedded and matched against 1,000+ companies using advanced AI." },
                      { num: "02", title: "Top Matches Only", desc: "Only the strongest matches are returned — no noise, no long lists to scroll." },
                      { num: "03", title: "AI Analysis", desc: "A detailed breakdown explains exactly why each company fits your requirements." },
                    ].map(({ num, title, desc }) => (
                      <div key={title} className="space-y-2">
                        <div className="text-xs font-bold text-ngen-orange">{num}</div>
                        <p className="text-sm font-semibold text-gray-900">{title}</p>
                        <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto space-y-5">
                {messages.map((msg, i) => (
                  <div key={i} className="animate-fade-up">
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="bg-ngen-orange text-white px-5 py-3 rounded-2xl rounded-br-sm max-w-sm text-sm font-medium shadow-md">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Assistant message card */}
                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                          <div className="px-5 py-3.5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center gap-3">
                            <div className="w-5 h-5 bg-gradient-to-br from-ngen-orange to-orange-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
                              </svg>
                            </div>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex-1">
                              {msg.phase === "questions" ? "Follow-up Questions" : msg.phase === "rfp" ? "Generated RFP" : "Matchmaking Analysis"}
                            </span>
                            {msg.model && <span className="text-xs text-gray-400 font-medium">{msg.model}</span>}
                          </div>
                          <div className="px-5 py-4">
                            <MarkdownText text={msg.content} companies={msg.companies} />
                          </div>
                        </div>

                        {/* Post-analysis actions */}
                        {msg.phase === "analysis" && (
                          <div className="flex flex-wrap gap-2 px-1">
                            <button
                              onClick={() => handleGenerateRFP(msg.content)}
                              disabled={loading}
                              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 bg-ngen-navy text-white rounded-full hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shadow-sm"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Generate RFP
                            </button>
                            <button
                              onClick={() => handleSearch("Show me similar companies in a different province")}
                              disabled={loading}
                              className="text-xs font-medium px-3 py-2 bg-white border border-gray-200 rounded-full text-gray-600 hover:border-ngen-orange hover:text-ngen-orange hover:bg-ngen-orange/5 transition-all duration-150 disabled:opacity-40"
                            >
                              Similar companies, different province
                            </button>
                            <button
                              onClick={() => { setAwaitingFollowUp(false); setQuery(""); }}
                              disabled={loading}
                              className="text-xs font-medium px-3 py-2 bg-white border border-gray-200 rounded-full text-gray-500 hover:border-gray-400 hover:text-gray-800 transition-all duration-150 disabled:opacity-40"
                            >
                              New search
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="animate-fade-up">
                    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-3 shadow-sm">
                      <LoadingDots />
                      <span className="text-sm text-gray-500">{awaitingFollowUp ? "Analyzing your answers…" : "Searching database…"}</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Right: Stats panel */}
          <aside className={`${statsOpen ? "w-80" : "w-0"} transition-all duration-300 bg-white border-l border-gray-200 flex-shrink-0 overflow-hidden shadow-sm`}>
            <div className="w-80 h-full flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-l from-gray-50 to-white">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">API Usage</p>
                {usageStats.length > 0 && (
                  <button onClick={() => setUsageStats([])} className="text-xs text-gray-400 hover:text-ngen-orange font-semibold transition-colors">Clear</button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="p-4 border-b border-gray-100">
                  <div className="bg-gradient-to-br from-ngen-navy to-gray-900 rounded-xl p-5 text-white shadow-md">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Session Total</p>
                    <p className="text-4xl font-bold tracking-tight">${sessionTotals.costUsd.toFixed(4)}</p>
                    <p className="text-xs text-gray-400 mt-1">{usageStats.length} search{usageStats.length !== 1 ? "es" : ""}</p>
                    <div className="mt-4 pt-4 border-t border-gray-800/30 grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-[11px] text-gray-400 mb-1">Input</p><p className="text-sm font-bold text-white">{fmtTokens(sessionTotals.inputTokens)}</p></div>
                      <div><p className="text-[11px] text-gray-400 mb-1">Output</p><p className="text-sm font-bold text-white">{fmtTokens(sessionTotals.outputTokens)}</p></div>
                      <div><p className="text-[11px] text-gray-400 mb-1">Embed</p><p className="text-sm font-bold text-white">{fmtTokens(sessionTotals.embeddingTokens)}</p></div>
                    </div>
                  </div>
                </div>
                {usageStats.length === 0 ? (
                  <div className="px-5 py-8 text-center"><p className="text-xs text-gray-400 leading-relaxed">No searches yet. Usage will appear here after your first query.</p></div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {usageStats.map((stat, i) => (
                      <div key={stat.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-xs font-medium text-gray-700 leading-tight line-clamp-1 flex-1">{stat.query}</p>
                          <span className="text-[11px] font-bold text-gray-400 flex-shrink-0 bg-gray-100 px-1.5 py-0.5 rounded">#{usageStats.length - i}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 mb-2 font-medium">{stat.model}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                          <StatRow label="Input" value={fmtTokens(stat.inputTokens) + " tok"} />
                          <StatRow label="Output" value={fmtTokens(stat.outputTokens) + " tok"} />
                          <StatRow label="Embed" value={fmtTokens(stat.embeddingTokens) + " tok"} />
                          <StatRow label="Cost" value={"$" + (stat.llmCostUsd + stat.embeddingCostUsd).toFixed(5)} highlight />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t border-gray-100 p-4 bg-gray-50">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">Pricing / 1M tokens</p>
                  <table className="w-full text-[10px]">
                    <thead><tr className="text-gray-500 text-left"><th className="font-semibold pb-1.5">Model</th><th className="text-right font-semibold pb-1.5">In</th><th className="text-right font-semibold pb-1.5">Out</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {PRICING_TABLE.map((row) => (
                        <tr key={row.model} className="hover:bg-white/60 transition-colors">
                          <td className="py-1.5 text-gray-600 pr-2 font-medium">{row.model}</td>
                          <td className="py-1.5 text-right text-gray-500 font-mono">{row.input}</td>
                          <td className="py-1.5 text-right text-gray-500 font-mono">{row.output}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-gray-500 mt-2.5 leading-relaxed">Approximate list prices. Actual costs may vary.</p>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Input bar */}
        <div className="border-t border-gray-200 bg-white px-5 py-4">
          <div className="max-w-2xl mx-auto space-y-2">
            {awaitingFollowUp && (
              <div className="flex items-center gap-2 text-xs text-ngen-orange font-medium px-1">
                <div className="w-1.5 h-1.5 rounded-full bg-ngen-orange animate-pulse flex-shrink-0" />
                Answer the questions above to receive your matched companies
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); handleSearch(query); }} className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={awaitingFollowUp ? "Type your answers here..." : "Describe what you're looking for..."}
                className={`flex-1 px-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 transition placeholder:text-gray-400 ${awaitingFollowUp ? "border-ngen-orange/40 focus:ring-ngen-orange/20 focus:border-ngen-orange" : "border-gray-200 focus:ring-ngen-red/20 focus:border-ngen-red/40"}`}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-5 py-2.5 bg-ngen-red text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2"
              >
                {loading ? "…" : (
                  <>
                    {awaitingFollowUp ? "Refine" : "Send"}
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function fmtTokens(n: number): string {
  if (n === 0) return "0";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}

function StatRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-gray-400">{label}</span>
      <span className={`text-[10px] font-semibold ${highlight ? "text-gray-800" : "text-gray-500"}`}>{value}</span>
    </div>
  );
}

/* ── Loading Dots ──────────────────────────────────────────────────────────── */
function LoadingDots() {
  return (
    <div className="flex gap-1 items-center">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: `${i * 0.12}s`, animationDuration: "0.8s" }} />
      ))}
    </div>
  );
}

/* ── Inline text: **bold** → strong, company names → links ─────────────────── */
function InlineText({ text, companies }: { text: string; companies?: SearchResult[] }) {
  const segments = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.startsWith("**") && seg.endsWith("**")) {
          const inner = seg.slice(2, -2);
          const co = companies?.find(c => c.company_name === inner);
          return co ? (
            <a key={i} href={co.homepage} target="_blank" rel="noopener noreferrer" className="font-semibold text-ngen-orange hover:underline underline-offset-2">{inner}</a>
          ) : (
            <strong key={i} className="font-semibold text-gray-900">{inner}</strong>
          );
        }
        return <span key={i}>{seg}</span>;
      })}
    </>
  );
}

/* ── Markdown Text renderer ─────────────────────────────────────────────────── */
function MarkdownText({ text, companies }: { text: string; companies?: SearchResult[] }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let bulletBuffer: { depth: number; text: string }[] = [];
  let keyIdx = 0;

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    elements.push(
      <ul key={`ul-${keyIdx++}`} className="my-2 space-y-1.5">
        {bulletBuffer.map((b, j) => (
          <li key={j} style={{ paddingLeft: `${b.depth * 16}px` }} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
            <span className="text-ngen-orange mt-[3px] flex-shrink-0 text-[9px]">▶</span>
            <span><InlineText text={b.text} companies={companies} /></span>
          </li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushBullets();
      elements.push(<div key={keyIdx++} className="h-1" />);
      continue;
    }

    // Headings
    if (/^#{1,3}\s/.test(trimmed)) {
      flushBullets();
      const content = trimmed.replace(/^#{1,3}\s+/, "");
      elements.push(
        <h4 key={keyIdx++} className="font-bold text-gray-900 text-sm mt-4 mb-1.5 border-b border-gray-100 pb-1">
          <InlineText text={content} companies={companies} />
        </h4>
      );
      continue;
    }

    // Bullet items: -, *, •, ►, ▶ at start (with optional indent)
    const bulletMatch = line.match(/^(\s*)([-*•►▶]|\d+\.)\s+(.*)/);
    if (bulletMatch) {
      const depth = Math.floor(bulletMatch[1].length / 2);
      bulletBuffer.push({ depth, text: bulletMatch[3] });
      continue;
    }

    // Plain paragraph
    flushBullets();
    elements.push(
      <p key={keyIdx++} className="text-sm text-gray-700 leading-relaxed">
        <InlineText text={trimmed} companies={companies} />
      </p>
    );
  }

  flushBullets();
  return <div className="space-y-1">{elements}</div>;
}


/* ── Side company card (right panel) ────────────────────────────────────────── */
function logTradeNav(event: string, data: Record<string, string>) {
  try {
    const key = "ngen_trade_nav";
    const prev = JSON.parse(localStorage.getItem(key) ?? "[]");
    prev.push({ event, ...data, ts: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(prev.slice(-200)));
  } catch {}
}

function SideCompanyCard({
  company,
  slugStats,
  onTellMore,
  onAddToChat,
  onUseCases,
}: {
  company: SearchResult;
  slugStats: Record<string, SlugSummary>;
  onTellMore: (c: SearchResult) => void;
  onAddToChat: (c: SearchResult) => void;
  onUseCases: (c: SearchResult) => void;
}) {
  const scorePct = Math.round(company.score * 100);
  const scoreTextColor = scorePct >= 80 ? "text-emerald-600" : scorePct >= 65 ? "text-amber-600" : "text-gray-500";

  const allSlugs = getHsSlugsForCompany(company.sectors, company.capabilities, company.materials);
  const primarySlug = allSlugs[0] ?? null;
  const riskRank = { none: 0, low: 1, medium: 2, high: 3 };
  const topExposure = allSlugs
    .map(s => slugStats[s])
    .filter((s): s is SlugSummary => !!s && s.surtaxCount > 0)
    .sort((a, b) => riskRank[b.riskLevel] - riskRank[a.riskLevel])[0];

  const riskBadgeCls: Record<string, string> = {
    low: "text-amber-700 bg-amber-50 border-amber-200",
    medium: "text-orange-700 bg-orange-50 border-orange-200",
    high: "text-red-700 bg-red-50 border-red-200",
  };

  return (
    <div className="p-4 hover:bg-gray-50/70 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm text-gray-900 leading-tight">{company.company_name}</h4>
            <span className="text-[9px] font-black text-ngen-orange bg-ngen-orange/10 border border-ngen-orange/20 px-1.5 py-0.5 rounded tracking-wider">NGen</span>
          </div>
          {(company.province && company.province !== "Unknown") && (
            <p className="text-[11px] text-gray-400 mt-0.5">{company.province}{company.company_size && company.company_size !== "Unknown" ? ` · ${company.company_size}` : ""}</p>
          )}
        </div>
        <span className={`text-base font-black flex-shrink-0 ${scoreTextColor}`}>
          {scorePct}<span className="text-[10px] font-semibold text-gray-400">%</span>
        </span>
      </div>

      {/* Description */}
      {company.description && (
        <p className="text-xs text-gray-600 leading-relaxed line-clamp-3 mb-3">{company.description}</p>
      )}

      {/* Tariff exposure badge */}
      {topExposure && primarySlug && (
        <a
          href={`/trade/industries/${primarySlug}`}
          onClick={() => logTradeNav("connect_to_trade", { company: company.company_name, slug: primarySlug, trigger: "side_card" })}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium mb-3 hover:opacity-80 transition-opacity ${riskBadgeCls[topExposure.riskLevel]}`}
        >
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="flex-1 truncate">{topExposure.name} — {topExposure.surtaxCount} codes under surtax</span>
        </a>
      )}

      {/* Action buttons */}
      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => onTellMore(company)} className="text-[11px] font-medium px-2.5 py-1 bg-white border border-gray-200 rounded-lg hover:border-ngen-orange hover:text-ngen-orange transition-colors">
          Tell me more
        </button>
        <button onClick={() => onAddToChat(company)} className="text-[11px] font-medium px-2.5 py-1 bg-white border border-gray-200 rounded-lg hover:border-ngen-orange hover:text-ngen-orange transition-colors">
          Add to Chat
        </button>
        <button onClick={() => onUseCases(company)} className="text-[11px] font-medium px-2.5 py-1 bg-white border border-gray-200 rounded-lg hover:border-ngen-orange hover:text-ngen-orange transition-colors">
          Use Cases
        </button>
      </div>
    </div>
  );
}

/* ── Filter Section ──────────────────────────────────────────────────────────── */
function FilterSection({
  label, options, selected, onChange, single = false, dimmed = false,
}: {
  label: string; options: string[]; selected: string[]; onChange: (val: string[]) => void; single?: boolean; dimmed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));

  function toggle(val: string) {
    if (single) {
      onChange(selected.includes(val) ? [] : [val]);
    } else {
      onChange(selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val]);
    }
  }

  return (
    <div className="px-5 py-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between group">
        <span className="text-xs font-semibold text-gray-700 group-hover:text-gray-900 transition flex items-center gap-2">
          {label}
          {selected.length > 0 && <span className="text-[10px] bg-ngen-red/10 text-ngen-red px-1.5 py-0.5 rounded font-bold">{selected.length}</span>}
          {dimmed && selected.length === 0 && <span className="text-[10px] text-gray-400 font-normal">{options.length} relevant</span>}
        </span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="mt-2.5">
          {options.length > 8 && (
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-ngen-red/30 mb-2" />
          )}
          <div className="max-h-44 overflow-y-auto space-y-px">
            {filtered.map((opt) => (
              <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type={single ? "radio" : "checkbox"} checked={selected.includes(opt)} onChange={() => toggle(opt)} className="accent-ngen-red flex-shrink-0" />
                <span className="text-xs text-gray-600 truncate leading-tight">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TagGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  const styles: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded border font-medium leading-tight ${styles[color] || styles.blue}`}>{text}</span>
  );
}
