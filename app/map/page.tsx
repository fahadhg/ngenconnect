"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useMemo } from "react";

interface MapCompany {
  company_name: string;
  site: string;
  homepage: string;
  province: string;
  city?: string;
  lat: number;
  lng: number;
  sectors: string[];
}

const CanadaMap = dynamic(() => import("./CanadaMap"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-gray-100">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-gray-300 animate-bounce"
            style={{ animationDelay: `${i * 0.12}s`, animationDuration: "0.8s" }}
          />
        ))}
      </div>
    </div>
  ),
});

const PROVINCES = [
  "Alberta", "British Columbia", "Manitoba", "New Brunswick",
  "Newfoundland and Labrador", "Nova Scotia", "Ontario",
  "Prince Edward Island", "Quebec", "Saskatchewan",
  "Northwest Territories", "Nunavut", "Yukon",
];

export default function MapPage() {
  const [companies, setCompanies] = useState<MapCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    fetch("/api/map-companies")
      .then((r) => r.json())
      .then((d) => {
        setCompanies(d.companies || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredCompanies = useMemo(() => {
    let list = companies;
    if (selectedProvince) {
      list = list.filter((c) => c.province === selectedProvince);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.company_name.toLowerCase().includes(q) ||
          c.province.toLowerCase().includes(q) ||
          (c.city || "").toLowerCase().includes(q) ||
          c.sectors.some((s) => s.toLowerCase().includes(q))
      );
    }
    return list;
  }, [companies, selectedProvince, searchQuery]);

  const provinceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of companies) {
      if (c.province && c.province !== "Unknown" && c.province !== "Non-Canadian") {
        counts[c.province] = (counts[c.province] || 0) + 1;
      }
    }
    return counts;
  }, [companies]);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } transition-all duration-300 bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden flex flex-col`}
      >
        <div className="w-64 flex flex-col h-full">
          <div className="px-4 py-4 border-b border-gray-100">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
              Filter Map
            </p>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search companies..."
              className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-ngen-red/30"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Province
            </p>
            <button
              onClick={() => setSelectedProvince(null)}
              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs mb-1 flex items-center justify-between transition ${
                selectedProvince === null
                  ? "bg-ngen-red/10 text-ngen-red font-semibold"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span>All Provinces</span>
              <span className="text-[10px] text-gray-400">{companies.length}</span>
            </button>
            {PROVINCES.filter((p) => provinceCounts[p]).map((province) => (
              <button
                key={province}
                onClick={() =>
                  setSelectedProvince(selectedProvince === province ? null : province)
                }
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs mb-0.5 flex items-center justify-between transition ${
                  selectedProvince === province
                    ? "bg-ngen-red/10 text-ngen-red font-semibold"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="truncate">{province}</span>
                <span className="text-[10px] text-gray-400 flex-shrink-0 ml-1">
                  {provinceCounts[province] || 0}
                </span>
              </button>
            ))}
          </div>

          <div className="border-t border-gray-100 px-4 py-3">
            <p className="text-[10px] text-gray-400">
              Showing{" "}
              <span className="font-semibold text-gray-700">{filteredCompanies.length}</span>{" "}
              of <span className="font-semibold text-gray-700">{companies.length}</span> companies
            </p>
          </div>
        </div>
      </aside>

      {/* Map area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition"
            title="Toggle sidebar"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 12h10M10 20h4" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-700">Company Map</span>
          {selectedProvince && (
            <span className="text-[11px] font-semibold text-ngen-red bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
              {selectedProvince}
            </span>
          )}
          <span className="ml-auto text-xs text-gray-400">
            {loading ? "Loading..." : `${filteredCompanies.length} companies`}
          </span>
        </header>

        {/* Map */}
        <div className="flex-1 min-h-0">
          {!loading && (
            <CanadaMap
              companies={filteredCompanies}
              highlightedProvince={selectedProvince}
            />
          )}
        </div>
      </div>
    </div>
  );
}
