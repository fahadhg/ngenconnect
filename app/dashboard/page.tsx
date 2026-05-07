"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Stats {
  total: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEmbeddingTokens: number;
  byModel: { model: string; count: number; cost: number }[];
  recent: { date: string; count: number; cost: number }[];
  topQueries: string[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("conversations")
        .select("query, model_used, input_tokens, output_tokens, embedding_tokens, llm_cost_usd, embedding_cost_usd, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (!data || data.length === 0) {
        setStats({ total: 0, totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, totalEmbeddingTokens: 0, byModel: [], recent: [], topQueries: [] });
        setLoading(false);
        return;
      }

      const total = data.length;
      let totalCost = 0, totalInputTokens = 0, totalOutputTokens = 0, totalEmbeddingTokens = 0;
      const modelMap: Record<string, { count: number; cost: number }> = {};
      const dayMap: Record<string, { count: number; cost: number }> = {};

      for (const row of data) {
        const cost = (row.llm_cost_usd ?? 0) + (row.embedding_cost_usd ?? 0);
        totalCost += cost;
        totalInputTokens += row.input_tokens ?? 0;
        totalOutputTokens += row.output_tokens ?? 0;
        totalEmbeddingTokens += row.embedding_tokens ?? 0;

        const model = row.model_used || "Unknown";
        if (!modelMap[model]) modelMap[model] = { count: 0, cost: 0 };
        modelMap[model].count++;
        modelMap[model].cost += cost;

        const day = new Date(row.created_at).toLocaleDateString("en-CA");
        if (!dayMap[day]) dayMap[day] = { count: 0, cost: 0 };
        dayMap[day].count++;
        dayMap[day].cost += cost;
      }

      const byModel = Object.entries(modelMap)
        .map(([model, v]) => ({ model, ...v }))
        .sort((a, b) => b.count - a.count);

      const recent = Object.entries(dayMap)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 14)
        .map(([date, v]) => ({ date, ...v }));

      const topQueries = data.slice(0, 5).map((r) => r.query);

      setStats({ total, totalCost, totalInputTokens, totalOutputTokens, totalEmbeddingTokens, byModel, recent, topQueries });
      setLoading(false);
    }
    load();
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

  if (!stats || stats.total === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-700">No data yet</p>
          <p className="text-xs text-gray-400 mt-1">Start searching to see your dashboard.</p>
        </div>
      </div>
    );
  }

  const maxDayCount = Math.max(...stats.recent.map((r) => r.count), 1);

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-base text-gray-600">Your session usage, analytics, and activity overview</p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Searches", value: stats.total.toLocaleString(), sub: "all time", accent: false },
            { label: "Total Cost", value: `$${stats.totalCost.toFixed(4)}`, sub: "USD", accent: true },
            { label: "Tokens Used", value: fmtTokens(stats.totalInputTokens + stats.totalOutputTokens + stats.totalEmbeddingTokens), sub: "combined", accent: false },
            { label: "Avg Cost/Search", value: `$${(stats.totalCost / stats.total).toFixed(5)}`, sub: "USD", accent: false },
          ].map(({ label, value, sub, accent }) => (
            <div key={label} className={`relative overflow-hidden p-6 rounded-xl border transition-all duration-200 ${
              accent 
                ? "bg-gradient-to-br from-ngen-orange/10 to-ngen-orange/5 border-ngen-orange/30 hover:border-ngen-orange/60 hover:shadow-md-soft" 
                : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-md-soft"
            }`}>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{label}</p>
              <p className={`text-3xl font-bold leading-none mb-1 ${accent ? "text-ngen-orange" : "text-gray-900"}`}>{value}</p>
              <p className="text-xs text-gray-400 font-medium">{sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Activity chart */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm-soft">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-5">
              Activity — Last {stats.recent.length} Days
            </p>
            <div className="flex items-end gap-1.5 h-28">
              {stats.recent.slice().reverse().map(({ date, count }) => (
                <div key={date} className="flex-1 flex flex-col items-center gap-1 group">
                  <div
                    className="w-full bg-gradient-to-t from-ngen-orange to-ngen-orange/70 rounded hover:from-ngen-orange/90 hover:to-ngen-orange/80 transition-all cursor-default shadow-sm-soft"
                    style={{ height: `${(count / maxDayCount) * 100}px` }}
                    title={`${date}: ${count} search${count !== 1 ? "es" : ""}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3 text-[11px] text-gray-400 font-medium">
              <span>{stats.recent[stats.recent.length - 1]?.date}</span>
              <span>{stats.recent[0]?.date}</span>
            </div>
          </div>

          {/* Model breakdown */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm-soft">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-5">
              Model Usage Breakdown
            </p>
            <div className="space-y-3">
              {stats.byModel.map(({ model, count, cost }) => {
                const pct = Math.round((count / stats.total) * 100);
                return (
                  <div key={model} className="group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{model}</span>
                      <span className="text-xs text-gray-500 ml-2 flex-shrink-0 font-medium">
                        {pct}% · ${cost.toFixed(4)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-ngen-orange to-orange-500 rounded-full transition-all duration-300 group-hover:shadow-md-soft" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Token breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm-soft mb-6">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-6">Token Breakdown</p>
          <div className="grid grid-cols-3 gap-6">
            {[
              { label: "Input Tokens", value: fmtTokens(stats.totalInputTokens), color: "ngen-orange" },
              { label: "Output Tokens", value: fmtTokens(stats.totalOutputTokens), color: "orange-500" },
              { label: "Embedding Tokens", value: fmtTokens(stats.totalEmbeddingTokens), color: "orange-400" },
            ].map(({ label, value }) => (
              <div key={label} className="text-center p-4 bg-gradient-to-br from-gray-50 to-white rounded-lg border border-gray-100">
                <p className="text-2xl font-bold text-gray-900 mb-1">{value}</p>
                <p className="text-xs text-gray-600 font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent queries */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Recent Searches</p>
          <div className="space-y-2">
            {stats.topQueries.map((q, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-[10px] font-bold text-gray-300 mt-0.5 flex-shrink-0">0{i + 1}</span>
                <p className="text-sm text-gray-700 leading-snug">{q}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return n.toString();
}
