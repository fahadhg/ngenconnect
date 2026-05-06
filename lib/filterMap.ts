// Hardcoded sector → { capabilities, certifications, materials }
// and capability → { certifications, materials } maps.
//
// Rules:
//   - No sector selected         → show all options (pass-through)
//   - Sector(s) selected         → union of mapped sector options
//   - Capability(ies) selected   → further narrow certs & materials
//   - Unknown sector/capability  → that selection adds no constraint

type SectorEntry = {
  capabilities: string[];
  certifications: string[];
  materials: string[];
};

type CapabilityEntry = {
  certifications: string[];
  materials: string[];
};

export const SECTOR_FILTER_MAP: Record<string, SectorEntry> = {
  "3D Printing / Additive Manufacturing": {
    capabilities: [
      "3D Printing / Additive Manufacturing",
      "3D Scanning",
      "CNC Machining",
      "Precision Machining",
      "Prototyping",
      "Quality Inspection / Testing",
      "Engineering Design / CAD",
      "Reverse Engineering",
      "Surface Treatment / Coating",
      "Tooling & Mold Making",
    ],
    certifications: ["AS9100", "ISO 9001", "ISO 13485", "ITAR", "FDA", "GMP"],
    materials: [
      "Aluminum", "Titanium", "Stainless Steel", "Steel", "Inconel",
      "Composites", "Carbon Fiber", "Nylon", "ABS", "PETG", "PEEK",
      "Polycarbonate", "Ceramics", "Graphene", "Carbon",
    ],
  },

  "Aerospace": {
    capabilities: [
      "CNC Machining", "CNC Milling", "CNC Turning", "Precision Machining",
      "Composite Manufacturing", "Machining", "Welding", "Assembly",
      "Engineering Design / CAD", "Quality Inspection / Testing",
      "3D Printing / Additive Manufacturing", "Heat Treatment",
      "Surface Treatment / Coating", "Tooling & Mold Making",
      "Reverse Engineering", "Prototyping", "EDM", "Deep Hole Drilling",
      "Laser Welding", "Forging",
    ],
    certifications: [
      "AS9100", "ITAR", "ISO 9001", "Controlled Goods",
      "Transport Canada AMO/DAO (Custom)", "DO-178 (Custom)", "DO-254 (Custom)",
      "ISO 45001", "ISO 14001", "AMS2750E (Custom)",
    ],
    materials: [
      "Titanium", "Inconel", "Aluminum", "Carbon Fiber", "Composites",
      "Stainless Steel", "Nickel Alloys", "Steel",
    ],
  },

  "Automotive": {
    capabilities: [
      "CNC Machining", "Metal Stamping", "Die Casting", "Injection Molding",
      "Welding", "Robotic Welding", "Assembly", "Surface Treatment / Coating",
      "Quality Inspection / Testing", "Engineering Design / CAD",
      "Tooling & Mold Making", "Heat Treatment", "Metal Fabrication",
      "Composite Manufacturing", "Robotics & Automation", "Laser Cutting",
    ],
    certifications: [
      "ISO 9001", "ISO 14001", "ISO 45001", "CSA", "CE",
    ],
    materials: [
      "Steel", "Aluminum", "Composites", "Carbon Fiber", "Rubber",
      "Plastics (General)", "ABS", "Polypropylene", "Magnesium", "Brass",
    ],
  },

  "Robotics & Automation": {
    capabilities: [
      "Robotics & Automation", "Robotic Welding", "Robotic Assembly",
      "Robotic Guidance", "Automation", "System Integration",
      "Engineering Design / CAD", "AI / Machine Learning", "Machine Tending",
      "Bin Picking", "Robotic Sorting", "Digital Twin", "Simulation & Modeling",
    ],
    certifications: [
      "ISO 9001", "CE", "CSA", "Fanuc Authorized System Integrator (Custom)",
    ],
    materials: ["Metal (General)", "Steel", "Aluminum"],
  },

  "Medical Devices": {
    capabilities: [
      "Precision Machining", "CNC Machining", "Cleanroom Manufacturing",
      "Quality Inspection / Testing", "Assembly", "Engineering Design / CAD",
      "Injection Molding", "3D Printing / Additive Manufacturing", "Prototyping",
      "Surface Treatment / Coating", "Optical Manufacturing",
    ],
    certifications: [
      "ISO 13485", "FDA", "ISO 9001", "Health Canada", "GMP", "CE",
      "ISO 14971 (Custom)", "Other (MDSAP)", "ISO 45001", "Other (IEC 60601)",
    ],
    materials: [
      "Titanium", "Stainless Steel", "PEEK", "Silicone", "ABS",
      "Polycarbonate", "Biomaterials", "Ceramics", "Cobalt",
    ],
  },

  "Electronics": {
    capabilities: [
      "PCB Manufacturing", "Electronics Assembly", "Surface Mount Technology (Custom)",
      "Engineering Design / CAD", "Cleanroom Manufacturing",
      "Quality Inspection / Testing", "Injection Molding", "Prototyping",
      "Firmware Design & Development (Custom)", "Firmware Development (Custom)",
    ],
    certifications: [
      "ISO 9001", "CE", "RoHS (Custom)", "ISO 14001", "UL", "FCC (Custom)", "CSA",
    ],
    materials: [
      "Silicon", "Semiconductors", "ABS", "Copper", "Gold", "Silver", "Aluminum",
    ],
  },

  "Electronics & Semiconductors": {
    capabilities: [
      "PCB Manufacturing", "Electronics Assembly", "Surface Mount Technology (Custom)",
      "Engineering Design / CAD", "Cleanroom Manufacturing",
      "Quality Inspection / Testing", "Injection Molding", "Prototyping",
      "Firmware Design & Development (Custom)", "Firmware Development (Custom)",
    ],
    certifications: [
      "ISO 9001", "CE", "RoHS (Custom)", "ISO 14001", "UL", "FCC (Custom)", "CSA",
    ],
    materials: [
      "Silicon", "Semiconductors", "ABS", "Copper", "Gold", "Silver", "Aluminum",
    ],
  },

  "Defence & Security": {
    capabilities: [
      "Precision Machining", "CNC Machining", "Engineering Design / CAD",
      "Cybersecurity Services", "Quality Inspection / Testing",
      "Composite Manufacturing", "Welding", "Assembly", "System Integration",
      "Radar Systems (Custom)", "3D Printing / Additive Manufacturing",
      "Metal Fabrication",
    ],
    certifications: [
      "ITAR", "Controlled Goods", "AS9100", "ISO 9001", "CMMC", "SOC 2",
      "ISO 27001", "ISO 45001",
    ],
    materials: [
      "Titanium", "Steel", "Aluminum", "Composites", "Carbon Fiber", "Inconel",
    ],
  },

  "Energy": {
    capabilities: [
      "Engineering Design / CAD", "Manufacturing", "System Integration",
      "Welding", "Fabrication", "Energy Storage (Custom)",
      "Environmental Services", "Recycling / Waste Management",
      "Battery Cell Manufacturing (Custom)", "Quality Inspection / Testing",
    ],
    certifications: [
      "ISO 9001", "ISO 14001", "ISO 45001", "CSA", "UL", "CE", "ASME",
    ],
    materials: [
      "Steel", "Aluminum", "Composites", "Lithium", "Hydrogen", "Copper",
      "Graphene", "Silicon", "Carbon",
    ],
  },

  "Energy & Clean Tech": {
    capabilities: [
      "Engineering Design / CAD", "Manufacturing", "System Integration",
      "Welding", "Fabrication", "Energy Storage (Custom)",
      "Environmental Services", "Recycling / Waste Management",
      "Battery Cell Manufacturing (Custom)", "Quality Inspection / Testing",
      "Water Treatment (Custom)",
    ],
    certifications: [
      "ISO 9001", "ISO 14001", "ISO 45001", "CSA", "UL", "CE", "ASME", "LEED",
      "Solar Impulse Efficient Solution Label (Custom)",
    ],
    materials: [
      "Steel", "Aluminum", "Composites", "Lithium", "Hydrogen", "Copper",
      "Graphene", "Silicon", "Carbon",
    ],
  },

  "Clean Tech": {
    capabilities: [
      "Engineering Design / CAD", "Environmental Services",
      "Recycling / Waste Management", "Water Treatment (Custom)",
      "System Integration", "Manufacturing", "Energy Storage (Custom)",
      "Quality Inspection / Testing",
    ],
    certifications: [
      "ISO 14001", "ISO 9001", "ISO 45001", "CSA", "UL", "LEED",
      "Solar Impulse Efficient Solution Label (Custom)",
    ],
    materials: [
      "Aluminum", "Steel", "Lithium", "Hydrogen", "Copper",
      "Silicon", "Graphene", "Carbon", "Composites",
    ],
  },

  "Oil & Gas": {
    capabilities: [
      "Machining", "CNC Machining", "Welding", "Fabrication",
      "Engineering Design / CAD", "Quality Inspection / Testing",
      "Heat Treatment", "Surface Treatment / Coating",
      "Industrial Equipment", "Maintenance & Repair (MRO)",
    ],
    certifications: [
      "API", "ISO 9001", "ASME", "ISO 14001", "ISO 45001", "CWB", "ITAR",
    ],
    materials: [
      "Steel", "Stainless Steel", "Inconel", "Nickel Alloys",
      "Aluminum", "Titanium", "Rubber", "PTFE / Teflon",
    ],
  },

  "Mining & Resources": {
    capabilities: [
      "Industrial Equipment", "Automation", "Engineering Design / CAD",
      "Manufacturing", "Fabrication", "Welding",
      "Quality Inspection / Testing", "Environmental Services",
    ],
    certifications: [
      "ISO 9001", "ISO 14001", "ISO 45001", "ASME", "CSA",
    ],
    materials: [
      "Steel", "Aluminum", "Tungsten", "Critical Metals", "Critical Minerals",
      "Rare Earth Elements", "Gold", "Cobalt", "Nickel",
    ],
  },

  "Food & Beverage": {
    capabilities: [
      "Food Processing (Custom)", "Packaging", "Quality Inspection / Testing",
      "Manufacturing", "Assembly", "Engineering Design / CAD",
      "Automation", "Packaging & Fulfillment",
    ],
    certifications: [
      "GMP", "BRC", "FDA", "Health Canada", "ISO 9001",
      "CFIA (Custom)", "Organic", "ISO 14001",
    ],
    materials: [
      "Food Ingredients", "Aluminum", "Stainless Steel",
      "Plastics (General)", "Glass", "Paper",
    ],
  },

  "Pharmaceuticals": {
    capabilities: [
      "GMP Manufacturing (Custom)", "Cleanroom Manufacturing",
      "Quality Inspection / Testing", "Clinical Trials (Custom)",
      "R&D", "Biomanufacturing (Custom)", "Packaging",
    ],
    certifications: [
      "GMP", "ISO 13485", "FDA", "Health Canada", "ISO 9001", "EMA (Custom)", "CE",
    ],
    materials: [
      "Pharmaceuticals / APIs", "Stainless Steel", "Glass",
      "Plastics (General)", "Biomaterials", "Chemicals", "Silicone",
    ],
  },

  "Life Sciences": {
    capabilities: [
      "Cleanroom Manufacturing", "Quality Inspection / Testing",
      "Clinical Trials (Custom)", "R&D", "Biomanufacturing (Custom)",
      "Precision Machining", "Assembly",
    ],
    certifications: [
      "ISO 13485", "GMP", "FDA", "Health Canada", "ISO 9001",
      "CE", "ISO 14971 (Custom)",
    ],
    materials: [
      "Titanium", "Stainless Steel", "PEEK", "Silicone",
      "Biomaterials", "Pharmaceuticals / APIs", "Chemicals",
    ],
  },

  "Marine & Shipbuilding": {
    capabilities: [
      "Welding", "Metal Fabrication", "CNC Machining",
      "Engineering Design / CAD", "Assembly", "Fabrication",
      "Surface Treatment / Coating",
    ],
    certifications: ["ISO 9001", "ISO 14001", "CWB", "ASME", "CSA"],
    materials: [
      "Steel", "Aluminum", "Stainless Steel", "Composites", "Fiberglass", "Rubber",
    ],
  },

  "Construction & Building Materials": {
    capabilities: [
      "Engineering Design / CAD", "Fabrication", "Metal Fabrication",
      "Welding", "Installation", "Precast Concrete Manufacturing (Custom)",
      "Manufacturing",
    ],
    certifications: ["ISO 9001", "CSA", "LEED", "CWB", "CE", "AISC (Custom)"],
    materials: [
      "Steel", "Aluminum", "Concrete", "Cement", "Wood", "Glass",
      "Composites", "Stainless Steel",
    ],
  },

  "Cybersecurity": {
    capabilities: [
      "Cybersecurity Services", "Digital Transformation", "Cloud Computing",
      "System Integration", "IoT / Connected Devices", "AI / Machine Learning",
    ],
    certifications: [
      "ISO 27001", "SOC 2", "CMMC", "TISAX (Custom)", "ISO 42001 (Custom)",
    ],
    materials: [],
  },

  "AI & Software": {
    capabilities: [
      "AI / Machine Learning", "AI & Software", "Data Analytics",
      "Digital Transformation", "Cloud Computing", "Machine Vision (Custom)",
      "Digital Twin", "Simulation & Modeling", "IoT / Connected Devices",
    ],
    certifications: ["ISO 27001", "SOC 2", "ISO 42001 (Custom)"],
    materials: [],
  },

  "IoT / Connected Devices": {
    capabilities: [
      "IoT / Connected Devices", "Electronics Assembly", "PCB Manufacturing",
      "Engineering Design / CAD", "Automation", "System Integration",
      "AI / Machine Learning", "Sensor Technology (Custom)",
      "Firmware Development (Custom)",
    ],
    certifications: [
      "CE", "UL", "ISO 9001", "RoHS (Custom)", "FCC (Custom)", "ISO 27001",
    ],
    materials: ["Silicon", "Semiconductors", "ABS", "Copper", "Aluminum"],
  },

  "Manufacturing": {
    capabilities: [
      "CNC Machining", "CNC Milling", "CNC Turning", "Precision Machining",
      "Metal Fabrication", "Welding", "Assembly", "Machining",
      "Quality Inspection / Testing", "Engineering Design / CAD",
      "Injection Molding", "Die Casting", "Heat Treatment",
      "Surface Treatment / Coating", "Tooling & Mold Making",
      "Contract Manufacturing", "Custom Manufacturing",
    ],
    certifications: [
      "ISO 9001", "ISO 14001", "ISO 45001", "AS9100", "CWB", "ASME", "CSA",
    ],
    materials: [
      "Steel", "Aluminum", "Stainless Steel", "Titanium", "Brass", "Copper",
      "Composites", "Plastics (General)", "ABS", "Rubber",
    ],
  },

  "Space & Satellite": {
    capabilities: [
      "Precision Machining", "CNC Machining", "Composite Manufacturing",
      "Engineering Design / CAD", "Quality Inspection / Testing",
      "3D Printing / Additive Manufacturing", "Assembly", "Electronics Assembly",
    ],
    certifications: ["AS9100", "ITAR", "ISO 9001", "Controlled Goods"],
    materials: [
      "Aluminum", "Titanium", "Composites", "Carbon Fiber",
      "Inconel", "Stainless Steel",
    ],
  },

  "Nuclear": {
    capabilities: [
      "Precision Machining", "CNC Machining", "Welding", "Fabrication",
      "Engineering Design / CAD", "Quality Inspection / Testing",
      "Heat Treatment", "Surface Treatment / Coating",
    ],
    certifications: ["ISO 9001", "ASME", "ISO 14001", "ISO 45001", "CSA"],
    materials: [
      "Steel", "Stainless Steel", "Inconel", "Nickel Alloys",
      "Titanium", "Aluminum",
    ],
  },

  "Rail & Transit": {
    capabilities: [
      "Manufacturing", "Welding", "Metal Fabrication", "Engineering Design / CAD",
      "Assembly", "Quality Inspection / Testing", "System Integration",
    ],
    certifications: ["ISO 9001", "ISO 14001", "ISO 45001", "CSA", "CWB"],
    materials: ["Steel", "Aluminum", "Stainless Steel", "Composites", "Rubber"],
  },

  "Plastics & Rubber": {
    capabilities: [
      "Injection Molding", "Extrusion", "Thermoforming", "Custom Manufacturing",
      "Tooling & Mold Making", "Quality Inspection / Testing",
    ],
    certifications: ["ISO 9001", "ISO 14001", "CE"],
    materials: [
      "ABS", "Nylon", "Polycarbonate", "Polypropylene", "Polyethylene",
      "PETG", "PEEK", "Rubber", "PVC", "PTFE / Teflon", "Silicone",
      "Plastics (General)",
    ],
  },

  "Packaging": {
    capabilities: [
      "Packaging", "Packaging & Fulfillment", "Manufacturing",
      "Quality Inspection / Testing", "Custom Manufacturing",
    ],
    certifications: ["ISO 9001", "ISO 14001", "BRC", "FDA", "GMP"],
    materials: [
      "Aluminum", "Plastics (General)", "ABS", "Polypropylene",
      "Paper", "Glass", "Steel",
    ],
  },
};

// Capability → further narrows certifications and materials
export const CAPABILITY_FILTER_MAP: Record<string, CapabilityEntry> = {
  "3D Printing / Additive Manufacturing": {
    certifications: ["AS9100", "ISO 9001", "ISO 13485", "FDA", "GMP"],
    materials: [
      "Aluminum", "Titanium", "Stainless Steel", "Steel", "Inconel",
      "Composites", "Carbon Fiber", "Nylon", "ABS", "PETG", "PEEK",
      "Polycarbonate", "Ceramics", "Graphene", "Carbon",
    ],
  },
  "CNC Machining": {
    certifications: ["AS9100", "ISO 9001", "ITAR", "Controlled Goods", "ISO 13485"],
    materials: [
      "Aluminum", "Titanium", "Steel", "Stainless Steel", "Inconel",
      "Brass", "Copper", "Composites", "Carbon Fiber", "PEEK", "Nickel Alloys",
    ],
  },
  "CNC Milling": {
    certifications: ["AS9100", "ISO 9001", "ITAR", "Controlled Goods"],
    materials: [
      "Aluminum", "Titanium", "Steel", "Stainless Steel",
      "Inconel", "Brass", "Copper", "Composites",
    ],
  },
  "CNC Turning": {
    certifications: ["AS9100", "ISO 9001", "ITAR"],
    materials: [
      "Aluminum", "Titanium", "Steel", "Stainless Steel",
      "Brass", "Copper", "Inconel",
    ],
  },
  "Precision Machining": {
    certifications: ["AS9100", "ISO 9001", "ISO 13485", "ITAR", "Controlled Goods"],
    materials: [
      "Aluminum", "Titanium", "Steel", "Stainless Steel",
      "Inconel", "Brass", "Copper", "PEEK",
    ],
  },
  "Composite Manufacturing": {
    certifications: ["AS9100", "ISO 9001", "ITAR", "Controlled Goods"],
    materials: ["Carbon Fiber", "Composites", "Fiberglass", "ABS"],
  },
  "Welding": {
    certifications: ["CWB", "ISO 9001", "ASME", "CSA", "ISO 45001"],
    materials: [
      "Steel", "Aluminum", "Stainless Steel", "Titanium",
      "Inconel", "Nickel Alloys",
    ],
  },
  "Robotic Welding": {
    certifications: ["CWB", "ISO 9001", "ASME", "CSA"],
    materials: ["Steel", "Aluminum", "Stainless Steel"],
  },
  "Metal Fabrication": {
    certifications: ["CWB", "ISO 9001", "CSA", "ASME"],
    materials: [
      "Steel", "Aluminum", "Stainless Steel", "Brass", "Copper", "Titanium",
    ],
  },
  "Metal Stamping": {
    certifications: ["ISO 9001"],
    materials: ["Steel", "Aluminum", "Stainless Steel", "Brass", "Copper"],
  },
  "Laser Cutting": {
    certifications: ["ISO 9001"],
    materials: [
      "Steel", "Aluminum", "Stainless Steel", "Brass",
      "Copper", "Titanium", "Carbon Fiber",
    ],
  },
  "Waterjet Cutting": {
    certifications: ["ISO 9001"],
    materials: [
      "Steel", "Aluminum", "Stainless Steel", "Titanium",
      "Composites", "Carbon Fiber", "Glass", "Ceramics",
    ],
  },
  "Injection Molding": {
    certifications: ["ISO 9001", "ISO 13485", "FDA"],
    materials: [
      "ABS", "Nylon", "Polycarbonate", "Polypropylene", "Polyethylene",
      "PETG", "PEEK", "Plastics (General)", "PVC", "Rubber",
    ],
  },
  "Die Casting": {
    certifications: ["ISO 9001"],
    materials: ["Aluminum", "Zinc", "Magnesium", "Brass"],
  },
  "Thermoforming": {
    certifications: ["ISO 9001"],
    materials: [
      "ABS", "Polycarbonate", "Polypropylene",
      "Polyethylene", "Plastics (General)", "PETG",
    ],
  },
  "Extrusion": {
    certifications: ["ISO 9001"],
    materials: [
      "Aluminum", "ABS", "Nylon", "Polypropylene",
      "Polyethylene", "Plastics (General)", "Rubber",
    ],
  },
  "Robotics & Automation": {
    certifications: [
      "ISO 9001", "CE", "CSA", "Fanuc Authorized System Integrator (Custom)",
    ],
    materials: ["Metal (General)", "Steel", "Aluminum"],
  },
  "Electronics Assembly": {
    certifications: ["ISO 9001", "CE", "UL", "RoHS (Custom)", "FCC (Custom)"],
    materials: ["Silicon", "Semiconductors", "Copper", "Gold", "Silver", "ABS"],
  },
  "PCB Manufacturing": {
    certifications: ["ISO 9001", "CE", "UL", "RoHS (Custom)", "FCC (Custom)"],
    materials: ["Silicon", "Semiconductors", "Copper", "Gold", "Silver"],
  },
  "Cleanroom Manufacturing": {
    certifications: [
      "ISO 13485", "GMP", "FDA", "Health Canada", "ISO 9001", "CE",
    ],
    materials: [
      "Silicon", "Semiconductors", "Pharmaceuticals / APIs",
      "Stainless Steel", "PEEK", "ABS", "Glass", "Biomaterials",
    ],
  },
  "Surface Treatment / Coating": {
    certifications: ["ISO 9001", "AS9100", "ISO 14001"],
    materials: [
      "Steel", "Aluminum", "Stainless Steel", "Titanium", "Coatings", "Inconel",
    ],
  },
  "Heat Treatment": {
    certifications: ["AMS2750E (Custom)", "ISO 9001", "AS9100", "ASME"],
    materials: [
      "Steel", "Aluminum", "Titanium", "Stainless Steel",
      "Inconel", "Nickel Alloys",
    ],
  },
  "Quality Inspection / Testing": {
    certifications: [
      "ISO 9001", "ISO 17025", "ISO 13485", "AS9100", "ISO 45001",
    ],
    materials: [],
  },
  "Cybersecurity Services": {
    certifications: [
      "ISO 27001", "SOC 2", "CMMC", "TISAX (Custom)", "ISO 42001 (Custom)",
    ],
    materials: [],
  },
  "AI / Machine Learning": {
    certifications: ["ISO 27001", "SOC 2", "ISO 42001 (Custom)"],
    materials: [],
  },
  "AI & Software": {
    certifications: ["ISO 27001", "SOC 2", "ISO 42001 (Custom)"],
    materials: [],
  },
  "Engineering Design / CAD": {
    certifications: ["ISO 9001", "AS9100", "ISO 13485"],
    materials: [],
  },
  "Forging": {
    certifications: ["ISO 9001", "AS9100", "ASME"],
    materials: [
      "Steel", "Aluminum", "Titanium", "Stainless Steel",
      "Inconel", "Nickel Alloys",
    ],
  },
  "Powder Metallurgy": {
    certifications: ["ISO 9001"],
    materials: ["Steel", "Titanium", "Aluminum", "Cobalt", "Tungsten", "Nickel"],
  },
  "Laser Welding": {
    certifications: ["ISO 9001", "CWB"],
    materials: [
      "Steel", "Aluminum", "Stainless Steel", "Titanium", "Inconel",
    ],
  },
  "EDM": {
    certifications: ["ISO 9001", "AS9100"],
    materials: [
      "Steel", "Titanium", "Stainless Steel", "Inconel",
      "Copper", "Tungsten", "Aluminum",
    ],
  },
  "Deep Hole Drilling": {
    certifications: ["ISO 9001", "AS9100"],
    materials: [
      "Steel", "Aluminum", "Stainless Steel", "Titanium", "Inconel",
    ],
  },
  "Tooling & Mold Making": {
    certifications: ["ISO 9001", "AS9100", "ISO 13485"],
    materials: [
      "Steel", "Aluminum", "Titanium", "Stainless Steel", "Copper",
    ],
  },
  "Prototyping": {
    certifications: ["ISO 9001", "ISO 13485", "AS9100"],
    materials: [
      "ABS", "Nylon", "Polycarbonate", "Aluminum",
      "Steel", "Titanium", "Composites",
    ],
  },
  "Assembly": {
    certifications: ["ISO 9001", "ISO 13485", "AS9100", "GMP"],
    materials: [],
  },
  "Contract Manufacturing": {
    certifications: ["ISO 9001", "ISO 13485", "GMP", "AS9100"],
    materials: [],
  },
  "System Integration": {
    certifications: ["ISO 9001", "CE", "CSA", "ISO 27001"],
    materials: [],
  },
};

// ── Public API ──────────────────────────────────────────────────────────────

export type DerivedOptions = {
  capabilities: string[];
  certifications: string[];
  materials: string[];
};

/**
 * Compute which filter options should be shown given current sector and
 * capability selections. Provinces and company sizes are never narrowed.
 */
export function getFilteredOptions(
  allOptions: DerivedOptions,
  selectedSectors: string[],
  selectedCapabilities: string[]
): DerivedOptions {
  // No sectors → show everything
  if (selectedSectors.length === 0) return allOptions;

  const mappedSectors = selectedSectors.filter((s) => s in SECTOR_FILTER_MAP);

  // All selected sectors are unmapped → show everything
  if (mappedSectors.length === 0) return allOptions;

  // Union of sector-level options
  const sectorCaps = union(mappedSectors.map((s) => SECTOR_FILTER_MAP[s].capabilities));
  const sectorCerts = union(mappedSectors.map((s) => SECTOR_FILTER_MAP[s].certifications));
  const sectorMats = union(mappedSectors.map((s) => SECTOR_FILTER_MAP[s].materials));

  const capabilities = allOptions.capabilities.filter((c) => sectorCaps.has(c));
  let certifications = allOptions.certifications.filter((c) => sectorCerts.has(c));
  let materials = allOptions.materials.filter((m) => sectorMats.has(m));

  // Further narrow by selected capabilities
  const mappedCaps = selectedCapabilities.filter((c) => c in CAPABILITY_FILTER_MAP);
  if (mappedCaps.length > 0) {
    const capCerts = union(mappedCaps.map((c) => CAPABILITY_FILTER_MAP[c].certifications));
    const capMats = union(mappedCaps.map((c) => CAPABILITY_FILTER_MAP[c].materials));

    // Intersect with sector-level options (both constraints must be satisfied)
    certifications = certifications.filter((c) => capCerts.has(c));
    materials = materials.filter((m) => capMats.has(m));
  }

  return { capabilities, certifications, materials };
}

function union(arrays: string[][]): Set<string> {
  const result = new Set<string>();
  for (const arr of arrays) arr.forEach((v) => result.add(v));
  return result;
}
