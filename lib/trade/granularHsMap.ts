// Multi-signal mapping: materials + capabilities + sectors → HS section slugs.
// More granular than sector-only: a company with "Steel, Aluminum" + "CNC Machining"
// maps directly to base-metals-and-articles regardless of its listed sector.

export const MATERIAL_TO_SLUGS: Record<string, string[]> = {
  // Base metals
  'Steel':                      ['base-metals-and-articles'],
  'Stainless Steel':             ['base-metals-and-articles'],
  'Aluminum':                    ['base-metals-and-articles'],
  'Copper':                      ['base-metals-and-articles'],
  'Nickel Alloys':               ['base-metals-and-articles'],
  'Titanium':                    ['base-metals-and-articles', 'optical-precision-instruments'],
  'Inconel':                     ['base-metals-and-articles'],
  'Tungsten':                    ['base-metals-and-articles'],
  'Zinc':                        ['base-metals-and-articles'],
  'Magnesium':                   ['base-metals-and-articles'],
  'Precious Metals':             ['precious-metals-jewellery'],
  'Gold':                        ['precious-metals-jewellery'],
  'Silver':                      ['precious-metals-jewellery'],
  // Plastics & rubber
  'Plastics (General)':          ['plastics-rubber'],
  'Rubber':                      ['plastics-rubber'],
  'Elastomers':                  ['plastics-rubber'],
  'Nylon':                       ['plastics-rubber'],
  'ABS':                         ['plastics-rubber'],
  'PETG':                        ['plastics-rubber'],
  'PEEK':                        ['plastics-rubber'],
  'Polycarbonate':               ['plastics-rubber'],
  'Polyethylene':                ['plastics-rubber'],
  'Polypropylene':               ['plastics-rubber'],
  'Foam':                        ['plastics-rubber'],
  'Silicone':                    ['plastics-rubber'],
  // Wood
  'Wood':                        ['wood-articles'],
  'Lumber':                      ['wood-articles'],
  // Textiles
  'Textiles (Custom)':           ['textiles-apparel'],
  'Fibres':                      ['textiles-apparel'],
  // Stone / ceramic / glass
  'Glass':                       ['stone-ceramic-glass'],
  'Ceramics':                    ['stone-ceramic-glass'],
  'Concrete':                    ['stone-ceramic-glass'],
  // Chemicals & pharma
  'Chemicals':                   ['chemical-products'],
  'Pharmaceuticals / APIs':      ['chemical-products'],
  'Adhesives':                   ['chemical-products'],
  'Coatings':                    ['chemical-products'],
  // Food
  'Food Ingredients':            ['prepared-foodstuffs'],
  // Composites & advanced materials (primarily used in vehicles/aerospace)
  'Carbon Fiber':                ['vehicles-aircraft-vessels', 'base-metals-and-articles'],
  'Composites':                  ['vehicles-aircraft-vessels'],
  // Semiconductors & electronics
  'Semiconductors':              ['machinery-mechanical-electrical-equipment'],
  'PCBs':                        ['machinery-mechanical-electrical-equipment'],
  // Rare earths / minerals
  'Rare Earth Elements':         ['mineral-products'],
  'Nanomaterials':               ['chemical-products'],
  'Biomaterials':                ['optical-precision-instruments', 'chemical-products'],
};

export const CAPABILITY_TO_SLUGS: Record<string, string[]> = {
  // Metal processing → base metals
  'CNC Machining':               ['base-metals-and-articles', 'machinery-mechanical-electrical-equipment'],
  'CNC Milling':                 ['base-metals-and-articles'],
  'CNC Turning':                 ['base-metals-and-articles'],
  'Precision Machining':         ['base-metals-and-articles', 'optical-precision-instruments'],
  'Metal Fabrication':           ['base-metals-and-articles'],
  'Metal Stamping':              ['base-metals-and-articles'],
  'Welding':                     ['base-metals-and-articles'],
  'Robotic Welding':             ['base-metals-and-articles'],
  'Laser Welding':               ['base-metals-and-articles'],
  'Forging':                     ['base-metals-and-articles'],
  'Die Casting':                 ['base-metals-and-articles'],
  'Powder Metallurgy':           ['base-metals-and-articles'],
  'Heat Treatment':              ['base-metals-and-articles'],
  'Surface Treatment / Coating': ['base-metals-and-articles'],
  'Deep Hole Drilling':          ['base-metals-and-articles'],
  'EDM':                         ['base-metals-and-articles'],
  'Laser Cutting':               ['base-metals-and-articles'],
  'Waterjet Cutting':            ['base-metals-and-articles'],
  'Sheet Metal (Custom)':        ['base-metals-and-articles'],
  // Plastics
  'Injection Molding':           ['plastics-rubber'],
  'Extrusion':                   ['plastics-rubber'],
  'Thermoforming':               ['plastics-rubber'],
  // Electronics
  'Electronics Assembly':        ['machinery-mechanical-electrical-equipment'],
  'PCB Manufacturing':           ['machinery-mechanical-electrical-equipment'],
  'Optical Manufacturing':       ['optical-precision-instruments'],
  'Cleanroom Manufacturing':     ['optical-precision-instruments'],
  // Composites / advanced mfg
  'Composite Manufacturing':     ['vehicles-aircraft-vessels'],
  // Vehicles / vehicles adjacent
  'Assembly':                    ['machinery-mechanical-electrical-equipment'],
};

export const SECTOR_TO_SLUGS: Record<string, string[]> = {
  'Automotive':                         ['vehicles-aircraft-vessels'],
  'Aerospace':                          ['vehicles-aircraft-vessels'],
  'Marine & Shipbuilding':              ['vehicles-aircraft-vessels'],
  'Rail & Transit':                     ['vehicles-aircraft-vessels'],
  'Space & Satellite':                  ['vehicles-aircraft-vessels'],
  'Metal Fabrication':                  ['base-metals-and-articles'],
  'Plastics & Rubber':                  ['plastics-rubber'],
  'Medical Devices':                    ['optical-precision-instruments'],
  'Life Sciences':                      ['optical-precision-instruments'],
  'Pharmaceuticals':                    ['chemical-products'],
  'Food & Beverage':                    ['prepared-foodstuffs'],
  'Mining & Resources':                 ['mineral-products'],
  'Oil & Gas':                          ['mineral-products'],
  'Defence & Security':                 ['arms-ammunition'],
  'Nuclear':                            ['arms-ammunition'],
  'Construction & Building Materials':  ['base-metals-and-articles', 'stone-ceramic-glass'],
  'Electronics & Semiconductors':       ['machinery-mechanical-electrical-equipment'],
  'Electronics':                        ['machinery-mechanical-electrical-equipment'],
  'Forestry & Wood Products':           ['wood-articles', 'pulp-paper'],
  'Chemicals':                          ['chemical-products'],
  'Textiles & Apparel':                 ['textiles-apparel'],
  'Packaging':                          ['pulp-paper', 'plastics-rubber'],
};

/**
 * Returns unique HS slugs relevant to a company, ranked by signal strength.
 * Materials & capabilities are stronger signals than sectors.
 */
export function getHsSlugsForCompany(
  sectors: string[],
  capabilities: string[],
  materials: string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (slugs: string[]) => {
    for (const s of slugs) {
      if (!seen.has(s)) { seen.add(s); result.push(s); }
    }
  };

  // Materials first (strongest signal — most specific)
  for (const m of materials) {
    const slugs = MATERIAL_TO_SLUGS[m];
    if (slugs) add(slugs);
  }

  // Capabilities second
  for (const c of capabilities) {
    const slugs = CAPABILITY_TO_SLUGS[c];
    if (slugs) add(slugs);
  }

  // Sectors last (most generic)
  for (const s of sectors) {
    const slugs = SECTOR_TO_SLUGS[s];
    if (slugs) add(slugs);
  }

  return result;
}

/** Convenience: returns the single best (first/highest-signal) slug, or null. */
export function getPrimaryHsSlug(
  sectors: string[],
  capabilities: string[],
  materials: string[],
): string | null {
  return getHsSlugsForCompany(sectors, capabilities, materials)[0] ?? null;
}
