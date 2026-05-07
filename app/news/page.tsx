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
  "Canadian Manufacturing": "bg-ngen-orange/10 text-ngen-orange border-ngen-orange/30",
  "Modern Machine Shop":    "bg-blue-50 text-blue-700 border-blue-200",
  "Automation World":       "bg-amber-50 text-amber-700 border-amber-200",
  "IndustryWeek":           "bg-purple-50 text-purple-700 border-purple-200",
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
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Manufacturing News</h1>
            <p className="text-base text-gray-600 mt-2">
              Latest coverage from Canadian manufacturing and Industry 4.0
            </p>
          </div>
          {!loading && articles.length > 0 && (
            <div className="flex gap-2 flex-wrap justify-end">
              {sources.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`text-xs font-semibold px-4 py-2 rounded-lg border transition-all duration-200 ${
                    filter === s
                      ? "bg-ngen-orange text-white border-ngen-orange shadow-md"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:shadow-sm"
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
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-3 h-3 rounded-full bg-ngen-orange animate-pulse"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-16 text-center shadow-sm">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6m-6-8h6v4H7V8z" />
            </svg>
            <p className="text-lg font-semibold text-gray-700 mb-1">No articles available</p>
            <p className="text-sm text-gray-500">News feeds may be temporarily unavailable. Try again shortly.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {filtered.map((article, i) => {
              const dateStr = article.pubDate
                ? new Date(article.pubDate).toLocaleDateString("en-CA", {
                    month: "short", day: "numeric", year: "numeric",
                  })
                : "";
              const colorClass = SOURCE_COLORS[article.source] || "bg-gray-50 text-gray-600 border-gray-200";

              return (
                <a
                  key={i}
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-4 hover:border-ngen-orange/50 hover:shadow-md transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${colorClass}`}>
                      {article.source}
                    </span>
                    <span className="text-xs text-gray-500 font-medium flex-shrink-0">{dateStr}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-ngen-orange transition-colors line-clamp-3 leading-relaxed mb-2">
                      {article.title}
                    </p>
                    <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{article.description}</p>
                  </div>
                  <div className="flex items-center gap-2 text-ngen-orange opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs font-semibold">Read more</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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
