"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { getFilteredOptions } from "@/lib/filterMap";

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
}

export default function Home() {
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Derived filter options based on current sector + capability selections
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
      newSectors,
      []
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
      filters.sectors || [],
      newCapabilities
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
    if (!searchQuery.trim()) return;
    setLoading(true);

    const userMsg: Message = { role: "user", content: searchQuery };
    setMessages((prev) => [...prev, userMsg]);
    setQuery("");

    try {
      const searchRes = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, filters }),
      });
      const searchData = await searchRes.json();

      if (searchData.error) throw new Error(searchData.error);

      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          companies: searchData.results,
          filters,
        }),
      });
      const chatData = await chatRes.json();

      const assistantMsg: Message = {
        role: "assistant",
        content: chatData.summary || chatData.error || "No analysis generated.",
        companies: searchData.results,
        model: chatData.model,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${errorMsg}` },
      ]);
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

  const activeFilterCount = Object.values(filters).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-72" : "w-0"
        } transition-all duration-300 bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden`}
      >
        <div className="w-72 h-full flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
              Refine Results
            </p>
            {activeFilterCount > 0 && (
              <button
                onClick={() => setFilters({})}
                className="text-[11px] text-ngen-red font-semibold hover:underline"
              >
                Clear all ({activeFilterCount})
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            <FilterSection
              label="Sector / Industry"
              options={filterOptions?.sectors || []}
              selected={filters.sectors || []}
              onChange={handleSectorChange}
            />
            <FilterSection
              label="Capabilities"
              options={availableOptions?.capabilities || filterOptions?.capabilities || []}
              selected={filters.capabilities || []}
              onChange={handleCapabilityChange}
              dimmed={(filters.sectors || []).length > 0 && (availableOptions?.capabilities.length ?? 0) < (filterOptions?.capabilities.length ?? 0)}
            />
            <FilterSection
              label="Certifications"
              options={availableOptions?.certifications || filterOptions?.certifications || []}
              selected={filters.certifications || []}
              onChange={(v) => setFilters((prev) => ({ ...prev, certifications: v }))}
              dimmed={(filters.sectors || []).length > 0 && (availableOptions?.certifications.length ?? 0) < (filterOptions?.certifications.length ?? 0)}
            />
            <FilterSection
              label="Materials"
              options={availableOptions?.materials || filterOptions?.materials || []}
              selected={filters.materials || []}
              onChange={(v) => setFilters((prev) => ({ ...prev, materials: v }))}
              dimmed={(filters.sectors || []).length > 0 && (availableOptions?.materials.length ?? 0) < (filterOptions?.materials.length ?? 0)}
            />
            <FilterSection
              label="Province"
              options={filterOptions?.provinces || []}
              selected={filters.province || []}
              onChange={(v) => setFilters((prev) => ({ ...prev, province: v }))}
              single
            />
            <FilterSection
              label="Company Size"
              options={filterOptions?.company_sizes || []}
              selected={filters.company_size || []}
              onChange={(v) => setFilters((prev) => ({ ...prev, company_size: v }))}
              single
            />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition flex-shrink-0"
            title="Toggle filters"
          >
            <svg
              className="w-4 h-4 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4h18M7 12h10M10 20h4"
              />
            </svg>
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-ngen-red rounded-md flex items-center justify-center flex-shrink-0">
              <span className="text-white font-black text-xs">N</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-tight tracking-tight">
                NGen Connect
              </h1>
              <p className="text-[11px] text-gray-400 leading-tight">
                Canadian Manufacturing Matchmaker — Industry 4.0
              </p>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] font-semibold text-ngen-red bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
                {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
              </span>
            </div>
          )}
        </header>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto pt-12">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-2">
                  Find your next manufacturing partner
                </h2>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Search 1,000+ Canadian manufacturers, suppliers, and technology
                  providers. Describe what you need in plain language.
                </p>
              </div>

              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                Example searches
              </p>
              <div className="grid grid-cols-2 gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => handleSearch(s)}
                    className="text-left px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:border-ngen-red/30 hover:bg-red-50/20 hover:shadow-sm transition-all group"
                  >
                    <span className="text-[11px] font-bold text-gray-300 block mb-0.5 group-hover:text-ngen-red/40 transition-colors">
                      0{i + 1}
                    </span>
                    {s}
                  </button>
                ))}
              </div>

              <div className="mt-10 p-4 bg-white border border-gray-200 rounded-xl">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  How it works
                </p>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    ["Semantic Search", "Your query is embedded and matched against 1,000+ companies using vector similarity."],
                    ["Top 3–5 Matches", "Only the strongest matches are returned — no noise, no long lists."],
                    ["AI Analysis", "A detailed breakdown explains exactly why each company fits your requirements."],
                  ].map(([title, desc]) => (
                    <div key={title}>
                      <p className="text-xs font-semibold text-gray-700 mb-1">{title}</p>
                      <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map((msg, i) => (
                <div key={i} className="animate-fade-up">
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="bg-ngen-red text-white px-4 py-2.5 rounded-2xl rounded-br-sm max-w-md text-sm font-medium">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* AI Analysis Card */}
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                          <div className="w-4 h-4 bg-ngen-red rounded flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-[9px] font-black">N</span>
                          </div>
                          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                            Matchmaking Analysis
                          </span>
                          {msg.model && (
                            <span className="ml-auto text-[10px] text-gray-300 font-medium">
                              {msg.model}
                            </span>
                          )}
                        </div>
                        <div className="px-5 py-4 text-sm text-gray-700 leading-relaxed">
                          <FormattedText text={msg.content} />
                        </div>
                      </div>

                      {/* Company Cards */}
                      {msg.companies && msg.companies.length > 0 && (
                        <div>
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
                            {msg.companies.length} Matched{" "}
                            {msg.companies.length === 1 ? "Company" : "Companies"}
                          </p>
                          <div className="space-y-2.5">
                            {msg.companies.map((c, j) => (
                              <CompanyCard key={j} company={c} rank={j + 1} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="animate-fade-up">
                  <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-3">
                    <LoadingDots />
                    <span className="text-sm text-gray-400">
                      Searching database and analyzing matches...
                    </span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 bg-white px-5 py-4">
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch(query);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Describe what you need — e.g., titanium machining for aerospace with AS9100 certification"
                className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ngen-red/20 focus:border-ngen-red/40 transition placeholder:text-gray-400"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-5 py-2.5 bg-ngen-red text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2"
              >
                Search
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Loading Dots ────────────────────────────────────────────────────── */
function LoadingDots() {
  return (
    <div className="flex gap-1 items-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce"
          style={{ animationDelay: `${i * 0.12}s`, animationDuration: "0.8s" }}
        />
      ))}
    </div>
  );
}

/* ── Formatted Text (handles **bold**) ───────────────────────────────── */
function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} className="leading-relaxed">
            {parts.map((part, j) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={j} className="font-semibold text-gray-900">
                  {part.slice(2, -2)}
                </strong>
              ) : (
                <span key={j}>{part}</span>
              )
            )}
          </p>
        );
      })}
    </div>
  );
}

/* ── Filter Section ──────────────────────────────────────────────────── */
function FilterSection({
  label,
  options,
  selected,
  onChange,
  single = false,
  dimmed = false,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  single?: boolean;
  dimmed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(val: string) {
    if (single) {
      onChange(selected.includes(val) ? [] : [val]);
    } else {
      onChange(
        selected.includes(val)
          ? selected.filter((s) => s !== val)
          : [...selected, val]
      );
    }
  }

  return (
    <div className="px-5 py-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between group"
      >
        <span className="text-xs font-semibold text-gray-700 group-hover:text-gray-900 transition flex items-center gap-2">
          {label}
          {selected.length > 0 && (
            <span className="text-[10px] bg-ngen-red/10 text-ngen-red px-1.5 py-0.5 rounded font-bold">
              {selected.length}
            </span>
          )}
          {dimmed && selected.length === 0 && (
            <span className="text-[10px] text-gray-400 font-normal">
              {options.length} relevant
            </span>
          )}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="mt-2.5">
          {options.length > 8 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-ngen-red/30 mb-2"
            />
          )}
          <div className="max-h-44 overflow-y-auto space-y-px">
            {filtered.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type={single ? "radio" : "checkbox"}
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="accent-ngen-red flex-shrink-0"
                />
                <span className="text-xs text-gray-600 truncate leading-tight">
                  {opt}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Company Card ────────────────────────────────────────────────────── */
function CompanyCard({ company, rank }: { company: SearchResult; rank: number }) {
  const scorePct = Math.round(company.score * 100);
  const scoreColor =
    scorePct >= 80
      ? "bg-emerald-500"
      : scorePct >= 65
      ? "bg-amber-400"
      : "bg-gray-400";
  const scoreTextColor =
    scorePct >= 80
      ? "text-emerald-700"
      : scorePct >= 65
      ? "text-amber-700"
      : "text-gray-600";

  const hasTags =
    company.sectors.length > 0 ||
    company.capabilities.length > 0 ||
    company.certifications.length > 0 ||
    company.materials.length > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all">
      {/* Card Header */}
      <div className="px-5 pt-4 pb-4 flex items-start gap-4">
        {/* Rank badge */}
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
          <span className="text-xs font-black text-gray-500">#{rank}</span>
        </div>

        {/* Company info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-sm leading-tight">
            {company.company_name}
          </h3>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {company.province && company.province !== "Unknown" && (
              <span className="text-xs text-gray-500">{company.province}</span>
            )}
            {company.province && company.province !== "Unknown" && company.company_size && (
              <span className="text-gray-300 text-xs">·</span>
            )}
            {company.company_size && (
              <span className="text-xs text-gray-500">{company.company_size}</span>
            )}
          </div>
          <a
            href={company.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-ngen-red hover:underline mt-0.5 inline-block font-medium"
          >
            {company.site || company.homepage}
          </a>
        </div>

        {/* Match score */}
        <div className="flex-shrink-0 text-right min-w-[52px]">
          <span className={`text-lg font-black leading-none ${scoreTextColor}`}>
            {scorePct}
            <span className="text-xs font-semibold text-gray-400 ml-0.5">%</span>
          </span>
          <p className="text-[10px] text-gray-400 mt-0.5">match</p>
          <div className="w-12 h-1 bg-gray-100 rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full ${scoreColor} rounded-full`}
              style={{ width: `${scorePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Description */}
      {company.description && (
        <div className="px-5 pb-4 border-t border-gray-50 pt-3">
          <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
            {company.description}
          </p>
        </div>
      )}

      {/* Tag sections */}
      {hasTags && (
        <div className="border-t border-gray-100 px-5 py-3 grid grid-cols-2 gap-x-6 gap-y-3">
          {company.sectors.length > 0 && (
            <TagGroup label="Sectors" color="blue">
              {company.sectors.slice(0, 3).map((s) => (
                <Tag key={s} text={s} color="blue" />
              ))}
            </TagGroup>
          )}
          {company.capabilities.length > 0 && (
            <TagGroup label="Capabilities" color="amber">
              {company.capabilities.slice(0, 3).map((c) => (
                <Tag key={c} text={c} color="amber" />
              ))}
            </TagGroup>
          )}
          {company.certifications.length > 0 && (
            <TagGroup label="Certifications" color="green">
              {company.certifications.slice(0, 3).map((c) => (
                <Tag key={c} text={c} color="green" />
              ))}
            </TagGroup>
          )}
          {company.materials.length > 0 && (
            <TagGroup label="Materials" color="purple">
              {company.materials.slice(0, 3).map((m) => (
                <Tag key={m} text={m} color="purple" />
              ))}
            </TagGroup>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-gray-100 px-5 py-2.5 flex justify-end">
        <a
          href={company.homepage}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-ngen-red transition-colors"
        >
          Visit Website
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}

function TagGroup({
  label,
  children,
}: {
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
        {label}
      </p>
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
    <span
      className={`text-[11px] px-2 py-0.5 rounded border font-medium leading-tight ${
        styles[color] || styles.blue
      }`}
    >
      {text}
    </span>
  );
}
