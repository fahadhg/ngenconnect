/**
 * Curated StatsCan vector IDs for the Intel dashboard.
 * All vectors are numeric (no "v" prefix) as required by the WDS POST API.
 *
 * Sources:
 *   Mfg Sales:    table 16100047  (monthly, seasonally adjusted)
 *   Cap Util:     table 16100012  (monthly)
 *   Employment:   table 14100022  (LFS monthly, Employment, Total Gender, 15+)
 *   Vacancies:    table 14100325  (quarterly, Canada)
 *   IPPI:         table 18100267  (monthly, 202001=100)
 *   RMPI:         table 18100268  (monthly, 202001=100)
 */

export const MFG_SALES: Record<string, { v: number; naics: string; industry: string }> = {
  total:        { v: 800450,  naics: '31-33', industry: 'Total manufacturing' },
  food:         { v: 800452,  naics: '311',   industry: 'Food manufacturing' },
  bevTobacco:   { v: 800453,  naics: '312',   industry: 'Beverage & tobacco' },
  paper:        { v: 800458,  naics: '322',   industry: 'Paper manufacturing' },
  petroleum:    { v: 800460,  naics: '324',   industry: 'Petroleum & coal' },
  chemical:     { v: 800461,  naics: '325',   industry: 'Chemical manufacturing' },
  plastics:     { v: 800462,  naics: '326',   industry: 'Plastics & rubber' },
  wood:         { v: 800464,  naics: '321',   industry: 'Wood products' },
  primaryMetal: { v: 800466,  naics: '331',   industry: 'Primary metal' },
  fabMetal:     { v: 800467,  naics: '332',   industry: 'Fabricated metal' },
  machinery:    { v: 800468,  naics: '333',   industry: 'Machinery' },
  computer:     { v: 800469,  naics: '334',   industry: 'Computer & electronics' },
  transport:    { v: 800471,  naics: '336',   industry: 'Transportation equipment' },
};

export const CAP_UTIL: Record<string, { v: number; industry: string }> = {
  total:        { v: 122804837, industry: 'Total manufacturing' },
  food:         { v: 122804839, industry: 'Food manufacturing' },
  paper:        { v: 122804847, industry: 'Paper manufacturing' },
  petroleum:    { v: 122804849, industry: 'Petroleum & coal' },
  chemical:     { v: 122804850, industry: 'Chemical manufacturing' },
  plastics:     { v: 122804851, industry: 'Plastics & rubber' },
  wood:         { v: 122804855, industry: 'Wood products' },
  primaryMetal: { v: 122804857, industry: 'Primary metal' },
  fabMetal:     { v: 122804858, industry: 'Fabricated metal' },
  machinery:    { v: 122804859, industry: 'Machinery' },
  computer:     { v: 122804860, industry: 'Computer & electronics' },
  transport:    { v: 122804862, industry: 'Transportation equipment' },
};

export const EMPLOYMENT: Record<string, { v: number; naics: string; industry: string }> = {
  total:    { v: 2710142, naics: '31-33', industry: 'Total manufacturing' },
  durables: { v: 2710143, naics: '321,327,331-339', industry: 'Durable goods' },
  nonDur:   { v: 2710144, naics: '311-316,322-326', industry: 'Non-durable goods' },
};

// Vacancies: table 14100372 — monthly, by NAICS industry sector
export const VACANCIES     = { v: 1212389418, industry: 'Manufacturing [31-33]' };
export const VACANCY_RATE  = { v: 1212389419 };
export const PAYROLL_EMP   = { v: 1212389417 };

export const IPPI: Record<string, { v: number; product: string }> = {
  total:        { v: 1230996350, product: 'Manufacturing total (IPPI)' },
  food:         { v: 1230996351, product: 'Food products (ch 16-21)' },
  wood:         { v: 1230996429, product: 'Wood products (ch 44)' },
  paper:        { v: 1230996438, product: 'Paper & paperboard (ch 48)' },
  petroleum:    { v: 1230996452, product: 'Petroleum & coal (ch 27)' },
  chemical:     { v: 1230996457, product: 'Chemical products (ch 28-38)' },
  plastics:     { v: 1230996482, product: 'Plastics & rubber (ch 39-40)' },
  primaryMetal: { v: 1230996512, product: 'Primary metals (ch 72-81)' },
  fabMetal:     { v: 1230996527, product: 'Fabricated metal (ch 73-83)' },
  machinery:    { v: 1230996551, product: 'Machinery (ch 84)' },
  computer:     { v: 1230996570, product: 'Computer & electronics (ch 85)' },
};

export const RMPI: Record<string, { v: number; commodity: string }> = {
  total:      { v: 1230998135, commodity: 'Total RMPI' },
  energy:     { v: 1230998136, commodity: 'Crude energy products' },
  crudeoil:   { v: 1230998138, commodity: 'Conventional crude oil' },
  natgas:     { v: 1230998141, commodity: 'Natural gas' },
  crops:      { v: 1230998149, commodity: 'Crop products' },
  metals:     { v: 1230998203, commodity: 'Metal ores & concentrates' },
  steelScrap: { v: 1230998208, commodity: 'Iron & steel scrap' },
  nonFerrous: { v: 1230998209, commodity: 'Non-ferrous metal scrap' },
  logs:       { v: 1230998186, commodity: 'Logs & pulpwood' },
  minerals:   { v: 1230998177, commodity: 'Non-metallic minerals' },
};
