"use client";

import { useEffect, useState } from "react";

interface Article {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
}

const SOURCE_COLORS: Record<string, string> = {
  "Canadian Manufacturing": "bg-red-50 text-red-700 border-red-100",
  "Modern Machine Shop":    "bg-blue-50 text-blue-700 border-blue-100",
  "Automation World":       "bg-amber-50 text-amber-700 border-amber-100",
  "IndustryWeek":           "bg-purple-50 text-purple-700 border-purple-100",
};

export default function NewsPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((d) => { setArticles(d.articles || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const sources = ["All", ...Array.from(new Set(articles.map((a) => a.source)))];
  const filtered = filter === "All" ? articles : articles.filter((a) => a.source === filter);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Manufacturing News</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Latest from Canadian manufacturing &amp; Industry 4.0
            </p>
          </div>
          {!loading && articles.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-end">
              {sources.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all ${
                    filter === s
                      ? "bg-ngen-red text-white border-ngen-red"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-2 h-2 rounded-full bg-gray-300 animate-bounce"
                  style={{ animationDelay: `${i * 0.12}s`, animationDuration: "0.8s" }} />
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <p className="text-sm font-semibold text-gray-700">No articles available</p>
            <p className="text-xs text-gray-400 mt-1">
              News feeds may be temporarily unavailable. Try again shortly.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((article, i) => {
              const dateStr = article.pubDate
                ? new Date(article.pubDate).toLocaleDateString("en-CA", {
                    month: "short", day: "numeric", year: "numeric",
                  })
                : "";
              const colorClass = SOURCE_COLORS[article.source] || "bg-gray-50 text-gray-600 border-gray-100";

              return (
                <a
                  key={i}
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2.5 hover:border-gray-300 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${colorClass}`}>
                      {article.source}
                    </span>
                    {dateStr && (
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{dateStr}</span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 leading-snug group-hover:text-ngen-red transition-colors line-clamp-2">
                    {article.title}
                  </h3>
                  {article.description && (
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                      {article.description}
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-auto text-[10px] font-semibold text-gray-400 group-hover:text-ngen-red transition-colors">
                    Read article
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
