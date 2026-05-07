export interface TariffItem {
  h: string;   // HS code
  c: number;   // chapter
  d: string;   // description
  u: string;   // unit of measure
  m: number;   // MFN rate
  us?: number; // UST (CUSMA US)
  mx?: number; // MXT (CUSMA Mexico)
  eu?: number; // CEUT (CETA EU)
  cp?: number; // CPTPT
  uk?: number; // UKT
  jp?: number; // JT (Japan)
  kr?: number; // KRT (Korea)
  g?: number;  // General tariff
}

export interface ImportData {
  t: number;   // total value
  c: { k: string; n: string; v: number }[];  // top countries
  p: number;   // top1 percentage
}

export interface ImportOverlay {
  [hs: string]: ImportData;
}

export interface USRatesOverlay {
  [hs6: string]: number;  // US general duty rate %
}

export interface HSSection {
  id: number;
  slug: string;
  name: string;
  chapters: number[];
  description: string;
  codeCount: number;
  dutiableCount: number;
  totalImports: number;
  surtaxAffected: number;
  topSources: { k: string; n: string; v: number }[];
}

export const CHAPTER_NAMES: Record<number, string> = {
  1: "Live animals", 2: "Meat and offal", 3: "Fish, crustaceans",
  4: "Dairy, eggs, honey", 5: "Animal products NES",
  6: "Live plants", 7: "Vegetables", 8: "Fruit and nuts",
  9: "Coffee, tea, spices", 10: "Cereals", 11: "Milling, malt, starch",
  12: "Oil seeds", 13: "Lac, gums, resins", 14: "Vegetable materials NES",
  15: "Animal/vegetable fats, oils",
  16: "Preparations of meat/fish", 17: "Sugars", 18: "Cocoa",
  19: "Preparations of cereals", 20: "Preparations of vegetables",
  21: "Misc. food preparations", 22: "Beverages, spirits",
  23: "Feed residues", 24: "Tobacco",
  25: "Salt, sulphur, earth, stone", 26: "Ores, slag, ash", 27: "Mineral fuels, oils",
  28: "Inorganic chemicals", 29: "Organic chemicals", 30: "Pharmaceuticals",
  31: "Fertilizers", 32: "Tanning, dyeing, pigments", 33: "Essential oils, cosmetics",
  34: "Soap, lubricants, waxes", 35: "Albuminoidal, glues", 36: "Explosives, pyrotechnics",
  37: "Photographic goods", 38: "Chemical products NES", 39: "Plastics",
  40: "Rubber", 41: "Raw hides, leather", 42: "Leather articles",
  43: "Furskins", 44: "Wood", 45: "Cork", 46: "Straw, plaiting",
  47: "Wood pulp", 48: "Paper, paperboard", 49: "Printed books",
  50: "Silk", 51: "Wool, animal hair", 52: "Cotton",
  53: "Vegetable textile fibres", 54: "Man-made filaments", 55: "Man-made staple fibres",
  56: "Wadding, felt, nonwovens", 57: "Carpets", 58: "Special woven fabrics",
  59: "Impregnated textiles", 60: "Knitted fabrics", 61: "Knitted apparel",
  62: "Woven apparel", 63: "Textile articles NES", 64: "Footwear",
  65: "Headgear", 66: "Umbrellas", 67: "Feathers, artificial flowers",
  68: "Stone, plaster, cement", 69: "Ceramic products", 70: "Glass",
  71: "Precious metals, jewellery", 72: "Iron and steel", 73: "Iron/steel articles",
  74: "Copper", 75: "Nickel", 76: "Aluminium", 78: "Lead", 79: "Zinc",
  80: "Tin", 81: "Other base metals", 82: "Tools, cutlery",
  83: "Misc. metal articles", 84: "Machinery, mechanical", 85: "Electrical machinery",
  86: "Railway, tramway", 87: "Vehicles", 88: "Aircraft, spacecraft",
  89: "Ships, boats", 90: "Optical, precision instruments", 91: "Clocks, watches",
  92: "Musical instruments", 93: "Arms, ammunition", 94: "Furniture, lighting",
  95: "Toys, games, sports", 96: "Misc. manufactured articles"
};

export const FTA_LABELS: Record<string, string> = {
  us: "US (CUSMA)", mx: "Mexico (CUSMA)", eu: "EU (CETA)",
  cp: "CPTPP", uk: "UK", jp: "Japan", kr: "Korea"
};

export const FTA_COLORS: Record<string, string> = {
  us: "#3b82f6", mx: "#22c55e", eu: "#a78bfa",
  cp: "#f97316", uk: "#8b5cf6", jp: "#ef4444", kr: "#f59e0b", mfn: "#6b7280"
};

export const GAZETTE_ALERTS = [
  { id: 1, date: "2026-04-05", title: "Section 232 metal surcharges extended to derivative products", sev: "high" as const, status: "In effect", chs: [72, 73, 76], desc: "25% surtax now applies to downstream steel/aluminum products" },
  { id: 2, date: "2026-04-02", title: "Proposed duty remission for hot-rolled steel (CUSMA origin)", sev: "med" as const, status: "30-day comment", chs: [72], desc: "Would exempt HS 7208 from surtax for US/Mexico origin" },
  { id: 3, date: "2026-03-29", title: "Countervailing duty on Chinese fasteners adjusted", sev: "high" as const, status: "In effect", chs: [73], desc: "Anti-dumping duty on HS 7318.xx increased to 25% for Chinese origin" },
  { id: 4, date: "2026-03-22", title: "Anti-dumping review: Vietnamese aluminum extrusions", sev: "med" as const, status: "Under review", chs: [76], desc: "Investigation into potential duties on Vietnamese aluminum" },
  { id: 5, date: "2026-03-15", title: "Section 122 global temporary tariff extended 90 days", sev: "high" as const, status: "In effect", chs: [], desc: "10% baseline surtax on non-FTA imports extended through June 2026" },
  { id: 6, date: "2026-03-01", title: "CETA specialty steel surtax reduction proposed", sev: "med" as const, status: "30-day comment", chs: [72, 73], desc: "Proposed reduction of surtax on EU-origin specialty steel" },
  { id: 7, date: "2026-02-22", title: "25% surtax on Chinese vehicle parts (Ch 87)", sev: "high" as const, status: "In effect", chs: [87], desc: "Covers HS 8708 vehicle parts of Chinese origin" },
  { id: 8, date: "2026-02-15", title: "CARM system batch query limits changing", sev: "low" as const, status: "Upcoming Apr 12", chs: [], desc: "API rate limits reduced from 100 to 60 requests/minute" },
];

export function getHS6(hs: string): string {
  return hs.replace(/\./g, '').slice(0, 6);
}

export function getBestFTA(item: TariffItem): { key: string; rate: number; label: string } | null {
  const keys = ['us', 'mx', 'eu', 'cp', 'uk', 'jp', 'kr'] as const;
  const rates = keys
    .map(k => ({ k, rate: item[k] != null ? item[k]! : 999 }))
    .filter(x => x.rate < 999);
  if (!rates.length) return null;
  rates.sort((a, b) => a.rate - b.rate);
  return { key: rates[0].k, rate: rates[0].rate, label: FTA_LABELS[rates[0].k] };
}

export function fmtVal(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + Math.round(v / 1e6) + 'M';
  if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
  return '$' + Math.round(v);
}

// Surtax overlay types
export interface SurtaxEntry {
  hs: string;
  origin: string; // ISO2 or "ALL"
  rate: number;
  order: string;
  sor: string;
  cn: string;
  from: string;
  to: string | null;
  type: string;
  note?: string;
}

export interface SurtaxOverlay {
  generated: string;
  sources: { order: string; sor: string; url: string }[];
  surtaxes: SurtaxEntry[];
  notes: Record<string, string>;
}

// Find applicable surtax for a given HS code + origin
export function findSurtax(surtaxData: SurtaxOverlay | null, hsCode: string, origin: string): SurtaxEntry | null {
  if (!surtaxData) return null;
  const hs8 = hsCode.replace(/\./g,'').slice(0,8);
  const hs8dot = hs8.slice(0,4)+'.'+hs8.slice(4,6)+'.'+hs8.slice(6,8);
  
  // Non-stackable: check origin-specific first, then ALL
  // Priority: US/CN steel > Steel derivative (ALL)
  const match = surtaxData.surtaxes.find(s => {
    const shs = s.hs.replace(/\./g,'');
    return shs.slice(0,8) === hs8.slice(0,8) && (s.origin === origin || s.origin === 'ALL');
  });
  return match || null;
}
