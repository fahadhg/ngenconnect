"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Conversation {
  id: string;
  query: string;
  response: string | null;
  companies_matched: Record<string, string>[] | null;
  model_used: string | null;
  input_tokens: number;
  output_tokens: number;
  embedding_tokens: number;
  llm_cost_usd: number;
  embedding_cost_usd: number;
  created_at: string;
}

export default function HistoryPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("conversations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setConversations((data as Conversation[]) || []);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2 h-2 rounded-full bg-gray-300 animate-bounce"
              style={{ animationDelay: `${i * 0.12}s`, animationDuration: "0.8s" }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Search History</h1>
          <p className="text-base text-gray-600 mt-2">{conversations.length} search{conversations.length !== 1 ? "es" : ""} saved</p>
        </div>

        {conversations.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-16 text-center shadow-sm-soft">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-gray-700 mb-1">No searches yet</p>
            <p className="text-sm text-gray-500">Your search history will appear here as you explore manufacturers.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((c) => {
              const isOpen = expanded === c.id;
              const totalCost = (c.llm_cost_usd ?? 0) + (c.embedding_cost_usd ?? 0);
              const date = new Date(c.created_at);
              const dateStr = date.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
              const timeStr = date.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });

              return (
                <div key={c.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 hover:shadow-sm-soft transition-all">
                  <button
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                    className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 line-clamp-1 group-hover:text-ngen-orange transition-colors">
                        {c.query}
                      </p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2.5 py-1 rounded">
                          {c.model_used || "Model"}
                        </span>
                        <span className="text-xs text-gray-400">{dateStr} at {timeStr}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-gray-500 font-medium">Cost</p>
                        <p className="text-sm font-bold text-ngen-orange">${totalCost.toFixed(5)}</p>
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7-7m0 0L5 14m7-7v12" />
                      </svg>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4 space-y-4">
                      <div>
                        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Response</p>
                        <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">{c.response}</p>
                      </div>

                      {c.companies_matched && c.companies_matched.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">
                            {c.companies_matched.length} Matched Companies
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {c.companies_matched.slice(0, 4).map((co, j) => (
                              <div key={j} className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 font-medium hover:border-ngen-orange/50 transition-colors">
                                {co.company_name}
                              </div>
                            ))}
                            {c.companies_matched.length > 4 && (
                              <div className="px-3 py-2.5 bg-ngen-orange/10 border border-ngen-orange/20 rounded-lg text-sm text-ngen-orange font-semibold">
                                +{c.companies_matched.length - 4} more
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-200">
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">Input Tokens</p>
                          <p className="text-sm font-bold text-gray-900">{c.input_tokens.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">Output Tokens</p>
                          <p className="text-sm font-bold text-gray-900">{c.output_tokens.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">Total Cost</p>
                          <p className="text-sm font-bold text-ngen-orange">${totalCost.toFixed(5)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
                  <button
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                    className="w-full text-left px-5 py-4 flex items-start gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 leading-snug truncate">
                        {c.query}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-[11px] text-gray-400">
                          {date.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                          {" · "}
                          {date.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {c.model_used && (
                          <span className="text-[11px] text-gray-400">{c.model_used}</span>
                        )}
                        {c.companies_matched && (
                          <span className="text-[11px] text-gray-400">
                            {Array.isArray(c.companies_matched) ? c.companies_matched.length : 0} companies
                          </span>
                        )}
                        <span className="text-[11px] font-semibold text-gray-500">
                          ${totalCost.toFixed(5)}
                        </span>
                      </div>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isOpen && c.response && (
                    <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                      {/* Token breakdown */}
                      <div className="flex gap-4 text-[11px]">
                        <span className="text-gray-400">Input: <strong className="text-gray-600">{c.input_tokens?.toLocaleString()}</strong></span>
                        <span className="text-gray-400">Output: <strong className="text-gray-600">{c.output_tokens?.toLocaleString()}</strong></span>
                        <span className="text-gray-400">Embed: <strong className="text-gray-600">{c.embedding_tokens?.toLocaleString()}</strong></span>
                        <span className="text-gray-400">Cost: <strong className="text-gray-600">${totalCost.toFixed(5)}</strong></span>
                      </div>

                      {/* Response */}
                      <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {c.response.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
                          part.startsWith("**") && part.endsWith("**") ? (
                            <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
                          ) : (
                            <span key={i}>{part}</span>
                          )
                        )}
                      </div>

                      {/* Matched companies */}
                      {Array.isArray(c.companies_matched) && c.companies_matched.length > 0 && (
                        <div className="pt-2 border-t border-gray-100">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                            Matched Companies
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {c.companies_matched.map((co, i) => (
                              <a
                                key={i}
                                href={co.homepage}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-ngen-red hover:underline"
                              >
                                {co.company_name}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
