import { readFileSync } from "fs";
import { join } from "path";
import type { SearchResult, FilterOptions, CompanyIndex } from "./types";

let _cache: CompanyIndex | null = null;

function loadCompanies(): CompanyIndex {
  if (_cache) return _cache;
  const filePath = join(process.cwd(), "data", "companies.json");
  const raw = readFileSync(filePath, "utf-8");
  _cache = JSON.parse(raw) as CompanyIndex;
  return _cache;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function parseList(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === "string") return v.split(",").map(s => s.trim()).filter(Boolean);
  return [];
}

export function searchCompanies(
  queryEmbedding: number[],
  filters: Record<string, string[]> = {},
  topK = 5,
  defenceMode = false
): SearchResult[] {
  const { companies } = loadCompanies();

  const scored = companies
    .map((c) => {
      const m = c.metadata;
      const sectors        = parseList(m.sectors);
      const capabilities   = parseList(m.capabilities);
      const certifications = parseList(m.certifications);
      const materials      = parseList(m.materials);
      const hs_slugs       = parseList(m.hs_slugs ?? []);

      // In defence mode, only return companies with a defence signal
      if (defenceMode && !(m.defence_score && m.defence_score > 0)) return null;

      // Apply filters
      if (filters.sectors?.length        && !filters.sectors.some(f        => sectors.includes(f)))        return null;
      if (filters.capabilities?.length   && !filters.capabilities.some(f   => capabilities.includes(f)))   return null;
      if (filters.certifications?.length && !filters.certifications.some(f => certifications.includes(f))) return null;
      if (filters.materials?.length      && !filters.materials.some(f      => materials.includes(f)))      return null;
      if (filters.provinces?.length      && !filters.provinces.includes(m.province))                       return null;
      if (filters.company_sizes?.length  && !filters.company_sizes.includes(m.company_size))               return null;

      const score = cosineSimilarity(queryEmbedding, c.embedding);
      return {
        company_name:   m.company_name   as string,
        site:           m.site           as string,
        homepage:       (m.homepage      as string) || `https://${m.site}`,
        description:    (m.description   as string) || "",
        sectors,
        capabilities,
        certifications,
        materials,
        hs_slugs,
        province:       m.province       as string,
        company_size:   m.company_size   as string,
        score,
        defence_score:      m.defence_score      ?? 0,
        defence_tier:       m.defence_tier       ?? null,
        cgp_registered:     m.cgp_registered     ?? null,
        itar_registered:    m.itar_registered     ?? null,
        cmmc_level:         m.cmmc_level          ?? null,
        facility_clearance: m.facility_clearance  ?? null,
        dnd_approved:       m.dnd_approved        ?? null,
      } as SearchResult;
    })
    .filter((r): r is SearchResult => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

export function loadCompaniesForMap() {
  const { companies } = loadCompanies();
  return companies
    .map((c) => {
      const m = c.metadata;
      if (m.lat == null || m.lng == null) return null;
      return {
        company_name: m.company_name as string,
        site:         m.site         as string,
        homepage:     (m.homepage    as string) || `https://${m.site}`,
        province:     m.province     as string,
        city:         m.city         as string | undefined,
        lat:          m.lat          as number,
        lng:          m.lng          as number,
        sectors:      parseList(m.sectors),
        hs_slugs:     parseList(m.hs_slugs ?? []),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
}

export function getFilterOptions(): FilterOptions {
  const { filter_options } = loadCompanies();
  return {
    sectors:        filter_options.sectors        || [],
    capabilities:   filter_options.capabilities   || [],
    certifications: filter_options.certifications || [],
    materials:      filter_options.materials      || [],
    hs_slugs:       filter_options.hs_slugs       || [],
    provinces:      filter_options.provinces      || [],
    company_sizes:  filter_options.company_sizes  || [],
  };
}
