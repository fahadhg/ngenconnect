import { CompanyIndex, CompanyRecord, SearchResult, FilterOptions } from "./types";
import fs from "fs";
import path from "path";

let cachedIndex: CompanyIndex | null = null;

export function loadIndex(): CompanyIndex {
  if (cachedIndex) return cachedIndex;

  const filePath = path.join(process.cwd(), "data", "companies.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  cachedIndex = JSON.parse(raw) as CompanyIndex;
  return cachedIndex;
}

export function getFilterOptions(): FilterOptions {
  const index = loadIndex();
  return index.filter_options;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function matchesFilter(company: CompanyRecord, filters: Record<string, string[]>): boolean {
  for (const [key, values] of Object.entries(filters)) {
    if (!values || values.length === 0) continue;

    const raw = company.metadata[key as keyof typeof company.metadata];
    const field = typeof raw === "string" ? raw : "";

    if (key === "province" || key === "company_size") {
      if (!values.includes(field)) return false;
    } else {
      // For comma-separated fields, check if any filter value is contained
      const hasMatch = values.some((v) => field.toLowerCase().includes(v.toLowerCase()));
      if (!hasMatch) return false;
    }
  }
  return true;
}

export function searchCompanies(
  queryEmbedding: number[],
  filters: Record<string, string[]>,
  topK: number = 20
): SearchResult[] {
  const index = loadIndex();

  // Score all companies
  const scored: { record: CompanyRecord; score: number }[] = [];

  for (const company of index.companies) {
    // Apply filters first
    if (!matchesFilter(company, filters)) continue;

    const score = cosineSimilarity(queryEmbedding, company.embedding);
    scored.push({ record: company, score });
  }

  // Sort by score, take top K
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topK);

  return top.map(({ record, score }) => ({
    company_name: record.metadata.company_name,
    site: record.metadata.site,
    homepage: record.metadata.homepage || `https://${record.metadata.site}`,
    description: record.metadata.description,
    sectors: splitField(record.metadata.sectors),
    capabilities: splitField(record.metadata.capabilities),
    certifications: splitField(record.metadata.certifications),
    materials: splitField(record.metadata.materials),
    province: record.metadata.province,
    company_size: record.metadata.company_size,
    score: Math.round(score * 100) / 100,
  }));
}

function splitField(field: string): string[] {
  if (!field) return [];
  return field.split(",").map((s) => s.trim()).filter(Boolean);
}

export interface MapCompany {
  company_name: string;
  site: string;
  homepage: string;
  province: string;
  city?: string;
  lat: number;
  lng: number;
  sectors: string[];
}

export function getMapCompanies(): MapCompany[] {
  const index = loadIndex();
  const results: MapCompany[] = [];
  for (const company of index.companies) {
    const m = company.metadata;
    if (m.lat == null || m.lng == null) continue;
    results.push({
      company_name: m.company_name,
      site: m.site,
      homepage: m.homepage || `https://${m.site}`,
      province: m.province,
      city: m.city,
      lat: m.lat,
      lng: m.lng,
      sectors: splitField(m.sectors),
    });
  }
  return results;
}
