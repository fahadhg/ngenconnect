"use client";

import { useState, useEffect, useRef } from "react";

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
      // Step 1: Search
      const searchRes = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, filters }),
      });
      const searchData = await searchRes.json();

      if (searchData.error) throw new Error(searchData.error);

      // Step 2: Generate summary
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
        content: chatData.summary || chatData.error || "No summary generated.",
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
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-80" : "w-0"
        } transition-all duration-300 bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden`}
      >
        <div className="w-80 h-full flex flex-col">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Filters
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <FilterSelect
              label="Sector / Industry"
              options={filterOptions?.sectors || []}
              selected={filters.sectors || []}
              onChange={(v) => setFilters({ ...filters, sectors: v })}
            />
            <FilterSelect
              label="Capabilities"
              options={filterOptions?.capabilities || []}
              selected={filters.capabilities || []}
              onChange={(v) => setFilters({ ...filters, capabilities: v })}
            />
            <FilterSelect
              label="Certifications"
              options={filterOptions?.certifications || []}
              selected={filters.certifications || []}
              onChange={(v) => setFilters({ ...filters, certifications: v })}
            />
            <FilterSelect
              label="Materials"
              options={filterOptions?.materials || []}
              selected={filters.materials || []}
              onChange={(v) => setFilters({ ...filters, materials: v })}
            />
            <FilterSelect
              label="Province"
              options={filterOptions?.provinces || []}
              selected={filters.province || []}
              onChange={(v) => setFilters({ ...filters, province: v })}
              single
            />
            <FilterSelect
              label="Company Size"
              options={filterOptions?.company_sizes || []}
              selected={filters.company_size || []}
              onChange={(v) => setFilters({ ...filters, company_size: v })}
              single
            />
            {activeFilterCount > 0 && (
              <button
                onClick={() => setFilters({})}
                className="text-sm text-ngen-red hover:underline"
              >
                Clear all filters ({activeFilterCount})
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            title="Toggle filters"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 010 2H4a1 1 0 01-1-1zm4 7a1 1 0 011-1h8a1 1 0 010 2H8a1 1 0 01-1-1zm2 7a1 1 0 011-1h4a1 1 0 010 2h-4a1 1 0 01-1-1z" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-ngen-red rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">
                NGen Connect
              </h1>
              <p className="text-xs text-gray-400">
                Manufacturing Matchmaker — Industry 4.0
              </p>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <span className="ml-auto bg-ngen-red/10 text-ngen-red text-xs font-semibold px-3 py-1 rounded-full">
              {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
            </span>
          )}
        </header>

        {/* Chat area */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto pt-16">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                What are you looking for?
              </h2>
              <p className="text-gray-500 mb-8">
                Search our database of 1,000+ Canadian manufacturers, suppliers,
                and technology providers.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSearch(s)}
                    className="text-left p-4 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:border-ngen-red/40 hover:bg-red-50/30 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className="animate-fade-up">
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="bg-ngen-red text-white px-5 py-3 rounded-2xl rounded-br-md max-w-md text-sm">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* AI Summary */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-5">
                        <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                          {msg.content}
                        </div>
                        {msg.model && (
                          <p className="text-xs text-gray-400 mt-3">
                            Powered by {msg.model}
                          </p>
                        )}
                      </div>

                      {/* Company Cards */}
                      {msg.companies && msg.companies.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold text-gray-500 mb-3">
                            📋 {msg.companies.length} companies matched
                          </p>
                          <div className="space-y-3">
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
                  <div className="bg-white border border-gray-200 rounded-2xl p-5">
                    <div className="flex items-center gap-3 text-gray-400">
                      <div className="animate-pulse-subtle">🔍</div>
                      <span className="text-sm">
                        Searching companies and generating matches...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 bg-white px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch(query);
              }}
              className="flex gap-3"
            >
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Describe what you're looking for... (e.g., 'titanium machining for aerospace')"
                className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-ngen-red/30 focus:border-ngen-red/50 transition"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-5 py-3 bg-ngen-red text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Search
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Filter Select Component ─────────────────────────────────────────── */
function FilterSelect({
  label,
  options,
  selected,
  onChange,
  single = false,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  single?: boolean;
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
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-sm font-medium text-gray-700 hover:text-gray-900 transition"
      >
        <span>
          {label}
          {selected.length > 0 && (
            <span className="ml-2 text-xs bg-ngen-red/10 text-ngen-red px-2 py-0.5 rounded-full">
              {selected.length}
            </span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 space-y-1">
          {options.length > 8 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-ngen-red/30 mb-1"
            />
          )}
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {filtered.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-sm text-gray-600"
              >
                <input
                  type={single ? "radio" : "checkbox"}
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="accent-ngen-red"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Company Card Component ──────────────────────────────────────────── */
function CompanyCard({ company, rank }: { company: SearchResult; rank: number }) {
  const scorePct = Math.round(company.score * 100);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900">
            {rank}. {company.company_name}
          </h3>
          <a
            href={company.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-ngen-red hover:underline"
          >
            {company.homepage}
          </a>
        </div>
        <span className="flex-shrink-0 bg-ngen-red text-white text-xs font-bold px-3 py-1 rounded-full">
          {scorePct}%
        </span>
      </div>

      {company.description && (
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          {company.description}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 mt-3">
        {company.sectors.slice(0, 4).map((s) => (
          <Tag key={s} text={s} color="blue" />
        ))}
        {company.certifications.slice(0, 3).map((c) => (
          <Tag key={c} text={c} color="green" />
        ))}
        {company.capabilities.slice(0, 3).map((c) => (
          <Tag key={c} text={c} color="amber" />
        ))}
        {company.materials.slice(0, 2).map((m) => (
          <Tag key={m} text={m} color="purple" />
        ))}
        {company.province && company.province !== "Unknown" && (
          <Tag text={company.province} color="rose" />
        )}
      </div>
    </div>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    purple: "bg-purple-50 text-purple-700",
    rose: "bg-rose-50 text-rose-700",
  };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${colors[color] || colors.blue}`}>
      {text}
    </span>
  );
}
