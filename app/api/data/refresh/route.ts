import { NextResponse } from 'next/server';

/**
 * Statistics Canada Data Refresh API
 * 
 * This endpoint fetches the latest data from StatsCan Web Data Service
 * and returns it for caching/storage. Can be called via cron job.
 * 
 * Tables:
 * - 12-10-0099-01: Merchandise imports by HS section
 * - 16-10-0117-01: Manufacturing sales
 * - 16-10-0014-01: Capacity utilization
 * - 14-10-0325-01: Job vacancies
 * - 18-10-0034-01: IPPI (Industrial Product Price Index)
 * - 18-10-0267-01: RMPI (Raw Materials Price Index)
 */

const STATSCAN_WDS = 'https://www150.statcan.gc.ca/t1/wds/rest';

interface VectorRequest {
  vectorId: number;
  latestN: number;
}

interface DataPoint {
  refPer: string;
  value: number | null;
}

// Vector IDs for Manufacturing Sales (Table 16-10-0117-01)
const MFG_SALES_VECTORS: Record<string, number> = {
  'Total manufacturing': 111380109,
  'Food manufacturing': 111380110,
  'Beverage and tobacco': 111380111,
  'Textile mills': 111380112,
  'Wood product': 111380115,
  'Paper manufacturing': 111380116,
  'Petroleum and coal': 111380118,
  'Chemical manufacturing': 111380119,
  'Plastics and rubber': 111380120,
  'Primary metal': 111380122,
  'Fabricated metal': 111380123,
  'Machinery': 111380124,
  'Computer and electronic': 111380125,
  'Electrical equipment': 111380126,
  'Transportation equipment': 111380127,
  'Furniture': 111380129,
};

// Vector IDs for Capacity Utilization (Table 16-10-0014-01)
const CAPACITY_VECTORS: Record<string, number> = {
  'Total manufacturing': 41707442,
  'Food, beverage, tobacco': 41707444,
  'Paper manufacturing': 41707448,
  'Petroleum and coal': 41707450,
  'Chemical manufacturing': 41707451,
  'Plastics and rubber': 41707452,
  'Primary metal': 41707454,
  'Fabricated metal': 41707455,
  'Machinery': 41707456,
  'Computer and electronic': 41707457,
  'Electrical equipment': 41707458,
  'Transportation equipment': 41707459,
};

// Vector IDs for Job Vacancies - Manufacturing (Table 14-10-0325-01)
const VACANCY_VECTORS: Record<string, number> = {
  'Manufacturing - Canada': 347629170,
  'Manufacturing - Ontario': 347629422,
  'Manufacturing - Quebec': 347629338,
  'Manufacturing - BC': 347629590,
  'Manufacturing - Alberta': 347629506,
};

// Vector IDs for IPPI (Table 18-10-0034-01)
const IPPI_VECTORS: Record<string, number> = {
  'Total IPPI': 41690973,
  'Iron and steel': 41691072,
  'Aluminum products': 41691108,
  'Motor vehicles': 41691277,
  'Motor vehicle parts': 41691283,
  'Chemical products': 41691156,
  'Plastic products': 41691189,
};

// Vector IDs for RMPI (Table 18-10-0267-01)
const RMPI_VECTORS: Record<string, number> = {
  'Total RMPI': 41691349,
  'Crude oil': 41691362,
  'Natural gas': 41691365,
  'Ferrous materials': 41691370,
  'Wood products': 41691387,
};

// Vector IDs for Imports by HS Section (Table 12-10-0099-01)
const IMPORT_VECTORS: Record<string, number> = {
  'Total imports': 52367368,
  'Section I - Live animals': 52367369,
  'Section II - Vegetable': 52367370,
  'Section III - Fats': 52367371,
  'Section IV - Prepared food': 52367372,
  'Section V - Mineral': 52367373,
  'Section VI - Chemical': 52367374,
  'Section VII - Plastics': 52367375,
  'Section VIII - Leather': 52367376,
  'Section IX - Wood': 52367377,
  'Section X - Paper': 52367378,
  'Section XI - Textiles': 52367379,
  'Section XII - Footwear': 52367380,
  'Section XIII - Stone': 52367381,
  'Section XIV - Precious': 52367382,
  'Section XV - Base metals': 52367383,
  'Section XVI - Machinery': 52367384,
  'Section XVII - Vehicles': 52367385,
  'Section XVIII - Optical': 52367386,
  'Section XIX - Arms': 52367387,
  'Section XX - Misc': 52367388,
  'Section XXI - Works of art': 52367389,
};

async function fetchVectors(vectors: VectorRequest[]): Promise<Record<number, DataPoint[]>> {
  try {
    const response = await fetch(`${STATSCAN_WDS}/getDataFromVectorsAndLatestNPeriods`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(vectors),
    });

    if (!response.ok) {
      throw new Error(`StatsCan API returned ${response.status}`);
    }

    const data = await response.json();
    const result: Record<number, DataPoint[]> = {};
    
    for (const item of data) {
      if (item.status === 'SUCCESS' && item.object) {
        result[item.object.vectorId] = item.object.vectorDataPoint.map((dp: { refPer: string; value: number | null }) => ({
          refPer: dp.refPer,
          value: dp.value,
        }));
      }
    }
    
    return result;
  } catch (error) {
    console.error('[v0] StatsCan API fetch failed:', error);
    return {};
  }
}

function calcYoY(data: DataPoint[]): string {
  if (data.length < 13) return 'N/A';
  const current = data[0]?.value;
  const yearAgo = data[12]?.value;
  if (current == null || yearAgo == null || yearAgo === 0) return 'N/A';
  return ((current - yearAgo) / yearAgo * 100).toFixed(1);
}

function getLatestPeriod(data: DataPoint[]): string {
  return data[0]?.refPer || 'N/A';
}

function getLatestValue(data: DataPoint[]): number {
  return data[0]?.value || 0;
}

export async function GET() {
  const timestamp = new Date().toISOString().split('T')[0];
  
  try {
    // 1. Fetch Manufacturing Sales data
    const mfgRequests: VectorRequest[] = Object.values(MFG_SALES_VECTORS).map(v => ({
      vectorId: v,
      latestN: 13,
    }));
    const mfgData = await fetchVectors(mfgRequests);

    // 2. Fetch Capacity Utilization data
    const capacityRequests: VectorRequest[] = Object.values(CAPACITY_VECTORS).map(v => ({
      vectorId: v,
      latestN: 5,
    }));
    const capacityData = await fetchVectors(capacityRequests);

    // 3. Fetch Job Vacancy data
    const vacancyRequests: VectorRequest[] = Object.values(VACANCY_VECTORS).map(v => ({
      vectorId: v,
      latestN: 5,
    }));
    const vacancyData = await fetchVectors(vacancyRequests);

    // 4. Fetch IPPI data
    const ippiRequests: VectorRequest[] = Object.values(IPPI_VECTORS).map(v => ({
      vectorId: v,
      latestN: 13,
    }));
    const ippiData = await fetchVectors(ippiRequests);

    // 5. Fetch RMPI data
    const rmpiRequests: VectorRequest[] = Object.values(RMPI_VECTORS).map(v => ({
      vectorId: v,
      latestN: 13,
    }));
    const rmpiData = await fetchVectors(rmpiRequests);

    // 6. Fetch Import data by HS section
    const importRequests: VectorRequest[] = Object.values(IMPORT_VECTORS).map(v => ({
      vectorId: v,
      latestN: 13,
    }));
    const importData = await fetchVectors(importRequests);

    // ─── Build Manufacturing Health Payload ────────────────────────────────────
    const mfgHealthPayload = {
      source: 'Statistics Canada, Table 16-10-0117-01 / 16-10-0014-01',
      generated: timestamp,
      note: 'Monthly Survey of Manufacturing — seasonally adjusted values (x 1,000,000 CAD)',
      sales: Object.entries(MFG_SALES_VECTORS).map(([industry, vectorId]) => {
        const data = mfgData[vectorId] || [];
        return {
          naics: industry === 'Total manufacturing' ? '31-33' : '',
          industry,
          period: getLatestPeriod(data),
          value: getLatestValue(data),
          unit: 'millions $',
          yoy: calcYoY(data),
        };
      }),
      capacity: Object.entries(CAPACITY_VECTORS).map(([industry, vectorId]) => {
        const data = capacityData[vectorId] || [];
        return {
          industry,
          period: getLatestPeriod(data),
          rate: getLatestValue(data),
        };
      }),
    };

    // ─── Build Labour Payload ──────────────────────────────────────────────────
    const labourPayload = {
      source: 'Statistics Canada, Table 14-10-0325-01 / 14-10-0202-01',
      generated: timestamp,
      note: 'Job vacancy data, quarterly',
      vacancies: Object.entries(VACANCY_VECTORS).map(([key, vectorId]) => {
        const data = vacancyData[vectorId] || [];
        const parts = key.split(' - ');
        return {
          industry: parts[0],
          province: parts[1] || 'Canada',
          period: getLatestPeriod(data),
          vacancies: getLatestValue(data),
          unit: 'number',
          rate: 0, // Would need separate calculation
        };
      }),
      employment: [], // Requires separate table
      hardToFillFlags: [],
    };

    // ─── Build Input Costs Payload ─────────────────────────────────────────────
    const inputCostsPayload = {
      source: 'Statistics Canada, Table 18-10-0034-01 (IPPI) / 18-10-0267-01 (RMPI)',
      generated: timestamp,
      note: 'Price indices, 2012=100 base',
      alerts: Object.entries(IPPI_VECTORS)
        .filter(([name]) => name !== 'Total IPPI')
        .map(([product, vectorId]) => {
          const data = ippiData[vectorId] || [];
          const yoy = parseFloat(calcYoY(data));
          return {
            product,
            yoy: isNaN(yoy) ? 0 : yoy,
            latest: getLatestValue(data),
            severity: Math.abs(yoy) > 10 ? 'high' : Math.abs(yoy) > 5 ? 'medium' : 'low',
          };
        }),
      ippi: Object.entries(IPPI_VECTORS).map(([product, vectorId]) => {
        const data = ippiData[vectorId] || [];
        return {
          product,
          yoy: calcYoY(data),
          latest: data.slice(0, 13).map(dp => ({
            period: dp.refPer,
            index: dp.value || 0,
          })),
        };
      }),
      rmpi: Object.entries(RMPI_VECTORS).map(([commodity, vectorId]) => {
        const data = rmpiData[vectorId] || [];
        return {
          commodity,
          yoy: calcYoY(data),
          latest: data.slice(0, 13).map(dp => ({
            period: dp.refPer,
            index: dp.value || 0,
          })),
        };
      }),
    };

    // ─── Build Import Section Data ─────────────────────────────────────────────
    const sectionImports = Object.entries(IMPORT_VECTORS)
      .filter(([name]) => name !== 'Total imports')
      .map(([name, vectorId]) => {
        const data = importData[vectorId] || [];
        const sectionNum = name.match(/Section ([IVX]+)/)?.[1] || '';
        return {
          section: name,
          sectionNumber: sectionNum,
          totalImports: getLatestValue(data) * 1000, // Values in thousands
          period: getLatestPeriod(data),
          yoy: calcYoY(data),
        };
      });

    return NextResponse.json({
      success: true,
      generated: timestamp,
      data: {
        mfgHealth: mfgHealthPayload,
        labour: labourPayload,
        inputCosts: inputCostsPayload,
        sectionImports,
      },
      meta: {
        mfgVectorsFound: Object.keys(mfgData).length,
        capacityVectorsFound: Object.keys(capacityData).length,
        vacancyVectorsFound: Object.keys(vacancyData).length,
        ippiVectorsFound: Object.keys(ippiData).length,
        rmpiVectorsFound: Object.keys(rmpiData).length,
        importVectorsFound: Object.keys(importData).length,
      },
    });

  } catch (error) {
    console.error('[v0] Data refresh failed:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// Allow POST for manual refresh triggers
export async function POST() {
  return GET();
}
