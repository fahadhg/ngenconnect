// Bidirectional mapping between NGen Connect sectors and HS section slugs.
// Used by:
//   - IndustryDetail "Find Canadian Suppliers" button  (slug → sector)
//   - Company card "Check Tariff Exposure" button      (sector → slug)

export const HS_SLUG_TO_SECTOR: Record<string, string> = {
  'live-animals-animal-products':               'Food & Beverage',
  'vegetable-products':                         'Food & Beverage',
  'animal-vegetable-fats':                      'Food & Beverage',
  'prepared-foodstuffs':                        'Food & Beverage',
  'mineral-products':                           'Mining & Resources',
  'chemical-products':                          'Pharmaceuticals',
  'plastics-rubber':                            'Plastics & Rubber',
  'wood-articles':                              'Construction & Building Materials',
  'pulp-paper':                                 'Packaging',
  'stone-ceramic-glass':                        'Construction & Building Materials',
  'precious-metals-jewellery':                  'Metal Fabrication',
  'base-metals-and-articles':                   'Metal Fabrication',
  'machinery-mechanical-electrical-equipment':  'Robotics & Automation',
  'vehicles-aircraft-vessels':                  'Automotive',
  'optical-precision-instruments':              'Medical Devices',
  'arms-ammunition':                            'Defence & Security',
  'miscellaneous-manufactured-articles':        'Contract Manufacturing',
  // no strong NGen sector match — hides-leather-furskins, textiles-apparel, footwear-headgear
};

export const SECTOR_TO_HS_SLUG: Record<string, string> = {
  'Food & Beverage':                    'prepared-foodstuffs',
  'Pharmaceuticals':                    'chemical-products',
  'Plastics & Rubber':                  'plastics-rubber',
  'Injection Molding':                  'plastics-rubber',
  'Extrusion':                          'plastics-rubber',
  'Thermoforming':                      'plastics-rubber',
  'Mining & Resources':                 'mineral-products',
  'Oil & Gas':                          'mineral-products',
  'Energy':                             'mineral-products',
  'Energy & CleanTech':                 'mineral-products',
  'Clean Tech':                         'chemical-products',
  'Construction & Building Materials':  'base-metals-and-articles',
  'Packaging':                          'pulp-paper',
  'Metal Fabrication':                  'base-metals-and-articles',
  'Metal Stamping':                     'base-metals-and-articles',
  'Forging':                            'base-metals-and-articles',
  'Welding':                            'base-metals-and-articles',
  'Robotic Welding':                    'base-metals-and-articles',
  'Laser Welding':                      'base-metals-and-articles',
  'Powder Metallurgy':                  'base-metals-and-articles',
  'Die Casting':                        'base-metals-and-articles',
  'CNC Machining':                      'machinery-mechanical-electrical-equipment',
  'CNC Milling':                        'machinery-mechanical-electrical-equipment',
  'CNC Turning':                        'machinery-mechanical-electrical-equipment',
  'Precision Machining':                'machinery-mechanical-electrical-equipment',
  'Robotics & Automation':              'machinery-mechanical-electrical-equipment',
  'Electronics':                        'machinery-mechanical-electrical-equipment',
  'Electronics & Semiconductors':       'machinery-mechanical-electrical-equipment',
  'Electronics Assembly':               'machinery-mechanical-electrical-equipment',
  'PCB Manufacturing':                  'machinery-mechanical-electrical-equipment',
  'IoT / Connected Devices':            'machinery-mechanical-electrical-equipment',
  'System Integration':                 'machinery-mechanical-electrical-equipment',
  'Tooling & Mold Making':              'machinery-mechanical-electrical-equipment',
  'Assembly':                           'machinery-mechanical-electrical-equipment',
  '3D Printing / Additive Manufacturing': 'machinery-mechanical-electrical-equipment',
  'Automotive':                         'vehicles-aircraft-vessels',
  'Aerospace':                          'vehicles-aircraft-vessels',
  'Marine & Shipbuilding':              'vehicles-aircraft-vessels',
  'Rail & Transit':                     'vehicles-aircraft-vessels',
  'Space & Satellite':                  'vehicles-aircraft-vessels',
  'Composite Manufacturing':            'vehicles-aircraft-vessels',
  'Medical Devices':                    'optical-precision-instruments',
  'Life Sciences':                      'optical-precision-instruments',
  'Cleanroom Manufacturing':            'optical-precision-instruments',
  'Defence & Security':                 'arms-ammunition',
  'Nuclear':                            'arms-ammunition',
  'Contract Manufacturing':             'miscellaneous-manufactured-articles',
};

/** Returns the first matching HS slug for a company's sector list, or null. */
export function getHsSlugForSectors(sectors: string[]): string | null {
  for (const s of sectors) {
    const slug = SECTOR_TO_HS_SLUG[s];
    if (slug) return slug;
  }
  return null;
}
