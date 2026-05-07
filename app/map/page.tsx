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
          sidebarOpen ? "w-72 sm:w-64" : "w-0"
        } transition-all duration-300 bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden flex flex-col shadow-sm-soft`}
      >
        <div className="w-72 sm:w-64 flex flex-col h-full">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-4">
              Filter &amp; Search
            </p>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search companies..."
              className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ngen-orange/20 focus:border-ngen-orange transition-all"
            />
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">
              Province
            </p>
            <button
              onClick={() => setSelectedProvince(null)}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm mb-2 flex items-center justify-between transition-all font-medium ${
                selectedProvince === null
                  ? "bg-ngen-orange/10 text-ngen-orange border border-ngen-orange/30"
                  : "text-gray-700 hover:bg-gray-100 border border-transparent"
              }`}
            >
              <span>All Provinces</span>
              <span className="text-xs text-gray-500 bg-gray-100/50 px-2.5 py-1 rounded">{companies.length}</span>
            </button>
            {PROVINCES.filter((p) => provinceCounts[p]).map((province) => (
              <button
                key={province}
                onClick={() =>
                  setSelectedProvince(selectedProvince === province ? null : province)
                }
                className={`w-full text-left px-4 py-2.5 rounded-lg text-sm mb-1 flex items-center justify-between transition-all font-medium ${
                  selectedProvince === province
                    ? "bg-ngen-orange/10 text-ngen-orange border border-ngen-orange/30"
                    : "text-gray-700 hover:bg-gray-100 border border-transparent"
                }`}
              >
                <span className="truncate">{province}</span>
                <span className="text-xs text-gray-500 bg-gray-100/50 px-2.5 py-1 rounded flex-shrink-0 ml-2">
                  {provinceCounts[province] || 0}
                </span>
              </button>
            ))}
          </div>

          <div className="border-t border-gray-100 px-5 py-4 bg-gradient-to-t from-gray-50 to-white">
            <p className="text-xs text-gray-600 font-medium">
              Showing{" "}
              <span className="font-bold text-gray-900">{filteredCompanies.length}</span>{" "}
              of <span className="font-bold text-gray-900">{companies.length}</span> companies
            </p>
          </div>
        </div>
      </aside>

      {/* Map area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-5 py-3.5 flex items-center gap-4 flex-shrink-0 shadow-sm-soft">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition duration-200 flex-shrink-0 text-gray-500 hover:text-gray-900"
            title="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4h18M7 12h10M10 20h4" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-700">Company Map</span>
          {selectedProvince && (
            <span className="text-xs font-bold text-ngen-orange bg-ngen-orange/10 border border-ngen-orange/30 px-3.5 py-1.5 rounded-full uppercase tracking-wider">
              {selectedProvince}
            </span>
          )}
          <span className="ml-auto text-xs font-medium text-gray-500">
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
