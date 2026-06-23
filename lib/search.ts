// Search is now handled directly in app/api/search/route.ts via Supabase + Cohere.
// These stubs exist only to satisfy any legacy imports.
import type { SearchResult, FilterOptions } from "./types";

export function searchCompanies(): SearchResult[] { return []; }
export function searchCompaniesByKeyword(): SearchResult[] { return []; }
export function findCompaniesByName(): SearchResult[] { return []; }
export function loadCompaniesForMap(): never[] { return []; }
export function getFilterOptions(): FilterOptions {
  return { provinces: [], company_types: [], certifications: [], industries: [], materials: [], headcount_ranges: [] };
}
