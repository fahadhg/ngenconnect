export interface SearchResult {
  company_name:          string;
  site:                  string;
  homepage:              string;
  city:                  string;
  province:              string;
  tagline:               string;
  summary:               string;
  company_type:          string;
  business_model:        string;
  headcount_range:       string;
  founded_year:          number | null;
  capabilities:          string[];
  capabilities_enhanced: string[];
  specializations:       string[];
  products:              string[];
  technology:            string[];
  equipment:             string[];
  materials:             string[];
  certifications:        string[];
  certifications_not_found: string[];
  industries_served:     string[];
  key_customers:         string[];
  export_compliance:     string[];
  capacity:              string;
  score:                 number;
}

export interface FilterOptions {
  provinces:      string[];
  company_types:  string[];
  certifications: string[];
  industries:     string[];
  materials:      string[];
  headcount_ranges: string[];
}

// Legacy — kept for backward compat with filterMap.ts
export interface CompanyIndex {
  companies:      CompanyRecord[];
  filter_options: FilterOptions;
  total:          number;
}

export interface CompanyRecord {
  id:        string;
  embedding: number[];
  metadata:  Record<string, unknown>;
  document:  string;
}
