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
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Your session usage and activity</p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Searches", value: stats.total.toLocaleString(), sub: "all time" },
            { label: "Total Cost", value: `$${stats.totalCost.toFixed(4)}`, sub: "USD" },
            { label: "Tokens Used", value: fmtTokens(stats.totalInputTokens + stats.totalOutputTokens + stats.totalEmbeddingTokens), sub: "combined" },
            { label: "Avg Cost / Search", value: `$${(stats.totalCost / stats.total).toFixed(5)}`, sub: "USD" },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
              <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {/* Activity chart */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
              Activity (last {stats.recent.length} days)
            </p>
            <div className="flex items-end gap-1 h-24">
              {stats.recent.slice().reverse().map(({ date, count }) => (
                <div key={date} className="flex-1 flex flex-col items-center gap-1 group">
                  <div
                    className="w-full bg-ngen-red/20 rounded-sm hover:bg-ngen-red/40 transition-colors cursor-default"
                    style={{ height: `${(count / maxDayCount) * 88}px` }}
                    title={`${date}: ${count} search${count !== 1 ? "es" : ""}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[9px] text-gray-300">{stats.recent[stats.recent.length - 1]?.date}</span>
              <span className="text-[9px] text-gray-300">{stats.recent[0]?.date}</span>
            </div>
          </div>

          {/* Model breakdown */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
              Model Usage
            </p>
            <div className="space-y-2.5">
              {stats.byModel.map(({ model, count, cost }) => {
                const pct = Math.round((count / stats.total) * 100);
                return (
                  <div key={model}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700 truncate">{model}</span>
                      <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                        {count} · ${cost.toFixed(4)}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full">
                      <div className="h-full bg-ngen-red rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Token breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Token Breakdown</p>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Input Tokens", value: fmtTokens(stats.totalInputTokens) },
              { label: "Output Tokens", value: fmtTokens(stats.totalOutputTokens) },
              { label: "Embedding Tokens", value: fmtTokens(stats.totalEmbeddingTokens) },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-xl font-black text-gray-900">{value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
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
