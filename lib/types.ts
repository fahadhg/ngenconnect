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
