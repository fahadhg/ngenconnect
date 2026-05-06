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
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Search History</h1>
          <p className="text-sm text-gray-400 mt-0.5">{conversations.length} searches saved</p>
        </div>

        {conversations.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">No searches yet</p>
            <p className="text-xs text-gray-400 mt-1">Your search history will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((c) => {
              const isOpen = expanded === c.id;
              const totalCost = (c.llm_cost_usd ?? 0) + (c.embedding_cost_usd ?? 0);
              const date = new Date(c.created_at);

              return (
                <div key={c.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors">
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
