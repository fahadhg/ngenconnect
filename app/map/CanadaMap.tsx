"use client";

import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";

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

interface Props {
  companies: MapCompany[];
  highlightedProvince: string | null;
}

const PROVINCE_COLORS: Record<string, string> = {
  "Ontario":                    "#ef4444",
  "Quebec":                     "#3b82f6",
  "British Columbia":           "#10b981",
  "Alberta":                    "#f59e0b",
  "Manitoba":                   "#8b5cf6",
  "Saskatchewan":               "#f97316",
  "Nova Scotia":                "#06b6d4",
  "New Brunswick":              "#84cc16",
  "Newfoundland and Labrador":  "#ec4899",
  "Prince Edward Island":       "#14b8a6",
  "Northwest Territories":      "#6366f1",
  "Nunavut":                    "#a78bfa",
  "Yukon":                      "#fb923c",
};

function getColor(province: string): string {
  return PROVINCE_COLORS[province] ?? "#6b7280";
}

// Spread co-located markers in a golden-angle spiral so they don't stack
function computeJitteredPositions(companies: MapCompany[]): [number, number][] {
  const groups = new Map<string, number[]>();
  companies.forEach((c, i) => {
    const key = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });

  const positions: [number, number][] = companies.map((c) => [c.lat, c.lng]);
  for (const indices of groups.values()) {
    if (indices.length <= 1) continue;
    indices.forEach((idx, j) => {
      const c = companies[idx];
      const angle = j * 2.399963; // golden angle ≈ 137.508° in radians
      const r = j === 0 ? 0 : 0.06 * Math.sqrt(j);
      positions[idx] = [c.lat + r * Math.cos(angle), c.lng + r * Math.sin(angle)];
    });
  }
  return positions;
}

// Tiny hook to re-fit map when filtered companies change
function FitBounds({ companies }: { companies: MapCompany[] }) {
  const map = useMap();
  // Don't auto-fit — let user pan freely. Just here as extension point.
  void map; void companies;
  return null;
}

export default function CanadaMap({ companies, highlightedProvince }: Props) {
  const jitteredPositions = useMemo(() => computeJitteredPositions(companies), [companies]);

  return (
    <MapContainer
      center={[56.0, -95.0]}
      zoom={4}
      minZoom={3}
      maxZoom={14}
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <FitBounds companies={companies} />

      {companies.map((company, i) => {
        const color = getColor(company.province);
        const dimmed = highlightedProvince != null && company.province !== highlightedProvince;
        const location = company.city
          ? `${company.city}, ${company.province}`
          : company.province;

        return (
          <CircleMarker
            key={`${company.site}-${i}`}
            center={jitteredPositions[i]}
            radius={6}
            pathOptions={{
              fillColor: color,
              color: "#fff",
              weight: 1.5,
              opacity: dimmed ? 0.2 : 0.9,
              fillOpacity: dimmed ? 0.15 : 0.85,
            }}
          >
            <Popup maxWidth={260}>
              <div className="min-w-[200px]">
                <p className="font-bold text-sm mb-0.5">{company.company_name}</p>
                <p className="text-xs text-gray-500 mb-2">{location}</p>
                {company.sectors.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {company.sectors.slice(0, 3).map((s) => (
                      <span
                        key={s}
                        className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                <a
                  href={company.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-ngen-red font-semibold hover:underline"
                >
                  Visit Website →
                </a>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Legend overlay — using plain div positioned by Leaflet's zIndex */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          right: 12,
          zIndex: 1000,
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: "10px 12px",
          maxWidth: 180,
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#9ca3af",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 8,
          }}
        >
          Province
        </p>
        <div style={{ maxHeight: 200, overflowY: "auto" }}>
          {Object.entries(PROVINCE_COLORS)
            .filter(([prov]) => companies.some((c) => c.province === prov))
            .map(([prov, color]) => (
              <div
                key={prov}
                style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 10, color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {prov}
                </span>
              </div>
            ))}
        </div>
      </div>
    </MapContainer>
  );
}
