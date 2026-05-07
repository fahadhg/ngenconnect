// Rules of Origin complexity flags by HS chapter
// Source: CUSMA Annex 4-B, CETA Protocol on Rules of Origin, CPTPP Chapter 3
// Categories:
//   "shift" = tariff shift rule (easy to qualify if inputs from different chapter)
//   "rvc"   = regional value content required (typically 40-75%)
//   "complex" = product-specific rule (automotive, textiles, chemicals)
//   "mixed" = combination of shift + RVC

export type ROOType = 'shift' | 'rvc' | 'complex' | 'mixed';

export interface ROORule {
  type: ROOType;
  cusma: string;
  ceta: string;
  difficulty: 'easy' | 'moderate' | 'hard';
  note: string;
}

// Per-chapter ROO complexity (manufacturing chapters 25-96)
// Based on CUSMA Annex 4-B predominant rule type per chapter
export const CHAPTER_ROO: Record<number, ROORule> = {
  25: { type: 'shift', cusma: 'CC (change of chapter)', ceta: 'CC', difficulty: 'easy', note: 'Simple tariff shift — mineral products generally qualify if processed in FTA region' },
  26: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Ores — tariff shift from any other chapter' },
  27: { type: 'shift', cusma: 'CC or RVC 60%', ceta: 'CC', difficulty: 'moderate', note: 'Petroleum products may require RVC if blended from non-originating crude' },
  28: { type: 'mixed', cusma: 'CTSH or RVC 60%', ceta: 'CTH', difficulty: 'moderate', note: 'Inorganic chemicals — tariff subheading change or 60% RVC' },
  29: { type: 'mixed', cusma: 'CTSH or RVC 60%', ceta: 'CTH or MaxNOM 50%', difficulty: 'moderate', note: 'Organic chemicals — reaction rule may apply (chemical transformation = origin)' },
  30: { type: 'rvc', cusma: 'CC or RVC 60%', ceta: 'MaxNOM 50%', difficulty: 'moderate', note: 'Pharmaceuticals — active ingredient origin often determines qualification' },
  31: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Fertilizers — straightforward tariff shift' },
  32: { type: 'mixed', cusma: 'CTSH or RVC 60%', ceta: 'CTH', difficulty: 'moderate', note: 'Paints/dyes — mixing and formulation in FTA region typically qualifies' },
  33: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Essential oils/cosmetics — heading change sufficient' },
  34: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Soap/waxes — formulation qualifies' },
  35: { type: 'mixed', cusma: 'CTH or RVC 60%', ceta: 'CTH', difficulty: 'moderate', note: 'Glues/enzymes — biological processing may have specific requirements' },
  36: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Explosives — chapter change' },
  37: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Photographic goods' },
  38: { type: 'mixed', cusma: 'CTSH or RVC 60%', ceta: 'CTH', difficulty: 'moderate', note: 'Chemical products NES — varies by product' },
  39: { type: 'mixed', cusma: 'CTH or RVC 60%', ceta: 'CTH', difficulty: 'moderate', note: 'Plastics — polymerization in region typically qualifies; articles need CTH' },
  40: { type: 'mixed', cusma: 'CTH or RVC 60%', ceta: 'CTH', difficulty: 'moderate', note: 'Rubber — vulcanization qualifies; articles need heading change' },
  41: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Hides/leather — tanning is substantial transformation' },
  42: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Leather articles — assembly from cut pieces qualifies' },
  43: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Furskins' },
  44: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Wood — processing from logs qualifies' },
  45: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Cork' },
  46: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Straw/plaiting materials' },
  47: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Wood pulp — pulping process is substantial transformation' },
  48: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Paper — papermaking from pulp qualifies' },
  49: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Printed materials' },
  50: { type: 'complex', cusma: 'Yarn forward', ceta: 'Fabric forward', difficulty: 'hard', note: 'Silk textiles — yarn-forward rule: yarn must be spun in FTA region' },
  51: { type: 'complex', cusma: 'Yarn forward', ceta: 'Fabric forward', difficulty: 'hard', note: 'Wool — strict textile rules; yarn must originate in FTA territory' },
  52: { type: 'complex', cusma: 'Yarn forward', ceta: 'Fabric forward', difficulty: 'hard', note: 'Cotton — yarn-forward rule makes it difficult with non-originating yarn' },
  53: { type: 'complex', cusma: 'Yarn forward', ceta: 'Fabric forward', difficulty: 'hard', note: 'Vegetable fibres — same textile-specific rules' },
  54: { type: 'complex', cusma: 'Yarn forward', ceta: 'Fabric forward', difficulty: 'hard', note: 'Man-made filaments — extrusion must occur in FTA region' },
  55: { type: 'complex', cusma: 'Yarn forward', ceta: 'Fabric forward', difficulty: 'hard', note: 'Man-made staple fibres — strict rules' },
  56: { type: 'complex', cusma: 'Yarn forward', ceta: 'Fabric forward', difficulty: 'hard', note: 'Nonwovens — textile rules apply' },
  57: { type: 'complex', cusma: 'Yarn forward', ceta: 'Fabric forward', difficulty: 'hard', note: 'Carpets — must be tufted/woven from originating yarn' },
  58: { type: 'complex', cusma: 'Yarn forward', ceta: 'Fabric forward', difficulty: 'hard', note: 'Special woven fabrics' },
  59: { type: 'complex', cusma: 'Yarn forward', ceta: 'Fabric forward', difficulty: 'hard', note: 'Impregnated textiles' },
  60: { type: 'complex', cusma: 'Yarn forward', ceta: 'Fabric forward', difficulty: 'hard', note: 'Knitted fabrics' },
  61: { type: 'complex', cusma: 'Yarn forward + cut & sew', ceta: 'Fabric forward', difficulty: 'hard', note: 'Knitted apparel — yarn must originate AND garment cut & sewn in region' },
  62: { type: 'complex', cusma: 'Yarn forward + cut & sew', ceta: 'Fabric forward', difficulty: 'hard', note: 'Woven apparel — strictest textile rules' },
  63: { type: 'complex', cusma: 'Yarn forward', ceta: 'Fabric forward', difficulty: 'hard', note: 'Textile articles NES' },
  64: { type: 'shift', cusma: 'CC or CTH', ceta: 'CC', difficulty: 'moderate', note: 'Footwear — assembly in region qualifies but upper material origin matters' },
  65: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Headgear' },
  66: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Umbrellas' },
  67: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Feathers/artificial flowers' },
  68: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Stone/cement products — processing qualifies' },
  69: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Ceramics — firing is substantial transformation' },
  70: { type: 'mixed', cusma: 'CTH or RVC 60%', ceta: 'CTH', difficulty: 'moderate', note: 'Glass — melting qualifies; articles need heading change' },
  71: { type: 'shift', cusma: 'CC or CTH', ceta: 'CTH', difficulty: 'easy', note: 'Precious metals/jewellery — refining or fabrication qualifies' },
  72: { type: 'mixed', cusma: 'CTH or RVC 60%', ceta: 'CTH', difficulty: 'moderate', note: 'Iron/steel — smelting from ore qualifies; rolling from slab may need RVC' },
  73: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Iron/steel articles — fabrication from flat/long products qualifies' },
  74: { type: 'mixed', cusma: 'CTH or RVC 60%', ceta: 'CTH', difficulty: 'moderate', note: 'Copper — refining qualifies; fabrication needs heading change' },
  75: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Nickel' },
  76: { type: 'mixed', cusma: 'CTH or RVC 60%', ceta: 'CTH', difficulty: 'moderate', note: 'Aluminium — smelting from alumina qualifies; extrusion may need RVC' },
  78: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Lead' },
  79: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Zinc' },
  80: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Tin' },
  81: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Other base metals' },
  82: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Tools/cutlery — forging or machining qualifies' },
  83: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Misc metal articles' },
  84: { type: 'mixed', cusma: 'CTSH or RVC 65%', ceta: 'CTH or MaxNOM 50%', difficulty: 'moderate', note: 'Machinery — assembly with sufficient value added qualifies; some subheadings have specific RVC' },
  85: { type: 'mixed', cusma: 'CTSH or RVC 65%', ceta: 'CTH or MaxNOM 50%', difficulty: 'moderate', note: 'Electrical machinery — similar to Ch 84; electronics assembly may need RVC' },
  86: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Railway equipment' },
  87: { type: 'complex', cusma: 'RVC 75% (net cost) for vehicles', ceta: 'MaxNOM 45%', difficulty: 'hard', note: 'Vehicles — CUSMA requires 75% RVC for cars, 70% for trucks, with steel/aluminum purchase requirements and labor value content (LVC) of $16/hr' },
  88: { type: 'shift', cusma: 'CTH or RVC 60%', ceta: 'CTH', difficulty: 'moderate', note: 'Aircraft — assembly qualifies but engine/avionics origin tracked separately' },
  89: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Ships — construction in FTA territory qualifies' },
  90: { type: 'mixed', cusma: 'CTSH or RVC 65%', ceta: 'CTH or MaxNOM 50%', difficulty: 'moderate', note: 'Optical/precision instruments — assembly with originating key components' },
  91: { type: 'mixed', cusma: 'CTSH or RVC 65%', ceta: 'CTH', difficulty: 'moderate', note: 'Clocks/watches — movement origin matters' },
  92: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Musical instruments' },
  93: { type: 'shift', cusma: 'CC', ceta: 'CC', difficulty: 'easy', note: 'Arms/ammunition' },
  94: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Furniture — assembly from components qualifies if heading changes' },
  95: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Toys/games/sports equipment' },
  96: { type: 'shift', cusma: 'CTH', ceta: 'CTH', difficulty: 'easy', note: 'Misc manufactured articles' },
};

export function getROO(chapter: number): ROORule | null {
  return CHAPTER_ROO[chapter] || null;
}

// HHI calculation for supply chain concentration
// HHI = sum of squared market shares (0-10000 scale)
// <1500 = unconcentrated, 1500-2500 = moderate, >2500 = highly concentrated
export function calculateHHI(shares: number[]): { hhi: number; level: 'low' | 'moderate' | 'high' } {
  const hhi = Math.round(shares.reduce((sum, s) => sum + s * s, 0));
  const level = hhi > 2500 ? 'high' : hhi > 1500 ? 'moderate' : 'low';
  return { hhi, level };
}
