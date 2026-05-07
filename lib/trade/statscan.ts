/**
 * Statistics Canada Web Data Service API Client
 * https://www.statcan.gc.ca/en/developers/wds
 * 
 * Tables used:
 * - 12-10-0099-01: Merchandise imports by HS section
 * - 12-10-0121-01: Merchandise imports by HS chapter (detailed)
 * - 16-10-0117-01: Manufacturing sales by industry
 * - 16-10-0014-01: Industrial capacity utilization rates
 * - 14-10-0325-01: Job vacancies by industry
 * - 18-10-0034-01: Industrial product price index (IPPI)
 * - 18-10-0267-01: Raw materials price index (RMPI)
 */

const STATSCAN_API_BASE = 'https://www150.statcan.gc.ca/t1/wds/rest';

// Vector IDs for key data series (from StatsCan table metadata)
const VECTORS = {
  // Manufacturing sales by industry (Table 16-10-0117-01)
  mfgSales: {
    total: 'v800001',
    food: 'v800002',
    transportation: 'v800015',
    chemical: 'v800010',
    petroleum: 'v800009',
    primaryMetal: 'v800012',
    machinery: 'v800013',
    fabricatedMetal: 'v800011',
    computer: 'v800014',
    electrical: 'v800016',
    furniture: 'v800018',
    plastics: 'v800008',
    pulpPaper: 'v800007',
    beverage: 'v800003',
  },
  // Capacity utilization (Table 16-10-0014-01)
  capacity: {
    total: 'v41707442',
  },
  // Import values by HS section (Table 12-10-0099-01)
  imports: {
    total: 'v52367368',
  },
};

interface StatsCandDataPoint {
  refPer: string;
  refPer2: string;
  value: number | null;
  decimals: number;
  scalarFactorCode: number;
  symbolCode: number;
  statusCode: string;
  securityLevelCode: string;
  releaseTime: string;
}

interface StatsCanResponse {
  status: string;
  object: {
    vectorId: number;
    coordinate: string;
    vectorDataPoint: StatsCandDataPoint[];
  };
}

/**
 * Fetch data points for a vector ID from StatsCan WDS
 */
export async function fetchVector(vectorId: string, numPeriods = 12): Promise<StatsCandDataPoint[]> {
  try {
    const response = await fetch(
      `${STATSCAN_API_BASE}/getDataFromVectorByReferencePeriodRange/${vectorId}/2024-01-01/2025-12-31`,
      {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 86400 }, // Cache for 24 hours
      }
    );
    
    if (!response.ok) {
      console.error(`[v0] StatsCan API error for ${vectorId}: ${response.status}`);
      return [];
    }
    
    const data: StatsCanResponse = await response.json();
    return data.object?.vectorDataPoint || [];
  } catch (error) {
    console.error(`[v0] Failed to fetch vector ${vectorId}:`, error);
    return [];
  }
}

/**
 * Fetch bulk data from a StatsCan table using cube coordinates
 */
export async function fetchTableData(
  productId: string, 
  coordinate: string
): Promise<StatsCandDataPoint[]> {
  try {
    const response = await fetch(
      `${STATSCAN_API_BASE}/getDataFromCubePidCoordAndLatestNPeriods`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify([{
          productId: parseInt(productId.replace(/-/g, '')),
          coordinate,
          latestN: 12,
        }]),
        next: { revalidate: 86400 },
      }
    );
    
    if (!response.ok) {
      console.error(`[v0] StatsCan table fetch error: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    return data[0]?.object?.vectorDataPoint || [];
  } catch (error) {
    console.error(`[v0] Failed to fetch table ${productId}:`, error);
    return [];
  }
}

/**
 * Format StatsCan reference period to readable date
 */
export function formatPeriod(refPer: string): string {
  // refPer format: "2025-01" or "2024-Q3"
  return refPer;
}

/**
 * Calculate year-over-year change
 */
export function calcYoY(current: number, yearAgo: number): string {
  if (!yearAgo || yearAgo === 0) return 'N/A';
  const change = ((current - yearAgo) / yearAgo) * 100;
  return change.toFixed(1);
}

// ─── HS Import Data Fetching ───────────────────────────────────────────────────

interface HSImportRow {
  hsCode: string;
  description: string;
  totalValue: number;
  countries: { code: string; name: string; value: number }[];
  usShare: number;
}

/**
 * Fetch HS section import data from CIMT database
 * Table 12-10-0099-01: Merchandise imports by HS section
 */
export async function fetchHSImports(): Promise<Record<string, HSImportRow>> {
  // StatsCan CIMT provides aggregate data by HS section
  // For detailed HS code data, we use Table 12-10-0121-01
  
  // This is a placeholder structure - actual implementation would
  // require parsing the full CIMT database or using the SDMX API
  
  const response = await fetch(
    `${STATSCAN_API_BASE}/getAllCubeMetadata`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ productId: 12100099 }]),
      next: { revalidate: 86400 * 7 }, // Cache for 7 days
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch HS import metadata`);
  }
  
  return {};
}

// ─── Manufacturing Data Types ──────────────────────────────────────────────────

export interface MfgSalesData {
  naics: string;
  industry: string;
  period: string;
  value: number;
  unit: string;
  yoy: string;
}

export interface CapacityData {
  industry: string;
  period: string;
  rate: number;
}

export interface MfgHealthPayload {
  source: string;
  generated: string;
  note: string;
  sales: MfgSalesData[];
  capacity: CapacityData[];
}

// ─── Labour Data Types ─────────────────────────────────────────────────────────

export interface VacancyData {
  industry: string;
  province: string;
  period: string;
  vacancies: number;
  unit: string;
  rate: number;
}

export interface EmploymentData {
  naics: string;
  industry: string;
  period: string;
  employed: number;
  unit: string;
}

export interface LabourPayload {
  source: string;
  generated: string;
  note: string;
  vacancies: VacancyData[];
  employment: EmploymentData[];
  hardToFillFlags: string[];
}

// ─── Price Index Types ─────────────────────────────────────────────────────────

export interface PriceAlert {
  product: string;
  yoy: number;
  latest: number;
  severity: 'high' | 'medium' | 'low';
}

export interface PriceIndexSeries {
  product: string;
  yoy: string;
  latest: { period: string; index: number }[];
}

export interface InputCostsPayload {
  source: string;
  generated: string;
  note: string;
  alerts: PriceAlert[];
  ippi: PriceIndexSeries[];
  rmpi: PriceIndexSeries[];
}
