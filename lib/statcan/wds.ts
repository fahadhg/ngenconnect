/**
 * Statistics Canada Web Data Service (WDS) client.
 * API docs: https://www.statcan.gc.ca/en/developers/wds/user-guide
 * Base URL: https://www150.statcan.gc.ca/t1/wds/rest/
 *
 * No API key required. Rate limit: be reasonable.
 */

const WDS_BASE = 'https://www150.statcan.gc.ca/t1/wds/rest';
const REVALIDATE = 3600; // 1-hour Next.js cache

export interface WdsDataPoint {
  refPer: string;       // "2026-03-01"
  value: number;
  statusCode: number;   // 0=normal, 3=revised
  releaseTime: string;
}

export interface WdsVectorResult {
  vectorId: number;
  productId: number;
  coordinate: string;
  dataPoints: WdsDataPoint[];
}

/** Fetch latest N data points for a set of vector IDs (numeric, no "v" prefix). */
export async function fetchVectors(
  vectors: number[],
  latestN: number
): Promise<Map<number, WdsVectorResult>> {
  const body = vectors.map(vectorId => ({ vectorId, latestN }));

  const res = await fetch(`${WDS_BASE}/getDataFromVectorsAndLatestNPeriods`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    next: { revalidate: REVALIDATE },
  });

  if (!res.ok) throw new Error(`WDS HTTP ${res.status}`);

  const json: Array<{ status: string; object: any }> = await res.json();
  const out = new Map<number, WdsVectorResult>();

  for (const item of json) {
    if (item.status !== 'SUCCESS' || !item.object) continue;
    const obj = item.object;
    out.set(obj.vectorId, {
      vectorId: obj.vectorId,
      productId: obj.productId,
      coordinate: obj.coordinate,
      dataPoints: (obj.vectorDataPoint ?? []).map((dp: any) => ({
        refPer: dp.refPer,
        value: dp.value,
        statusCode: dp.statusCode,
        releaseTime: dp.releaseTime,
      })),
    });
  }

  return out;
}

/** Pull the latest value + YoY change for a single vector. */
export function latestAndYoy(result: WdsVectorResult, periodsBack = 12): {
  latest: number | null;
  period: string | null;
  yoy: number | null;
} {
  const pts = result.dataPoints;
  if (!pts.length) return { latest: null, period: null, yoy: null };

  const last = pts[pts.length - 1];
  const prev = pts.length > periodsBack ? pts[pts.length - 1 - periodsBack] : null;

  const latest = last.value;
  const period = last.refPer.slice(0, 7); // "2026-03"
  const yoy =
    prev && prev.value
      ? parseFloat((((latest - prev.value) / Math.abs(prev.value)) * 100).toFixed(1))
      : null;

  return { latest, period, yoy };
}
