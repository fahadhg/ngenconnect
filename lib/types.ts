export interface CompanyRecord {
  id: string;
  embedding: number[];
  metadata: CompanyMetadata;
  document: string;
}

export interface CompanyMetadata {
  company_name: string;
  site: string;
  homepage: string;
  description: string;
  sectors: string;
  capabilities: string;
  certifications: string;
  materials: string;
  province: string;
  company_size: string;
  hs_slugs?: string[] | string;
  lat?: number;
  lng?: number;
  city?: string;
  // Defence enrichment fields
  defence_score?: number;
  defence_tier?: string | null;
  cgp_registered?: boolean | null;
  itar_registered?: boolean | null;
  cmmc_level?: number | null;
  facility_clearance?: string | null;
  dnd_approved?: boolean | null;
  prime_sub_supplier?: boolean | null;
}

export interface SearchResult {
  company_name: string;
  site: string;
  homepage: string;
  description: string;
  sectors: string[];
  capabilities: string[];
  certifications: string[];
  materials: string[];
  hs_slugs: string[];
  province: string;
  company_size: string;
  score: number;
  // Defence enrichment fields
  defence_score?: number;
  defence_tier?: string | null;
  cgp_registered?: boolean | null;
  itar_registered?: boolean | null;
  cmmc_level?: number | null;
  facility_clearance?: string | null;
  dnd_approved?: boolean | null;
}

export interface FilterOptions {
  sectors: string[];
  capabilities: string[];
  certifications: string[];
  materials: string[];
  hs_slugs: string[];
  provinces: string[];
  company_sizes: string[];
}

export interface CompanyIndex {
  companies: CompanyRecord[];
  filter_options: FilterOptions;
  total: number;
}
