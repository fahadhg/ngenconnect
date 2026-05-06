/**
 * Seed Supabase with companies + filter_options from data/companies.json.
 * Run: npm run seed
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env vars. Ensure .env.local has:\n" +
    "  NEXT_PUBLIC_SUPABASE_URL\n" +
    "  SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const dataPath = join(__dirname, "../data/companies.json");
const data = JSON.parse(readFileSync(dataPath, "utf8"));

const BATCH_SIZE = 50;

async function seedCompanies() {
  const total = data.companies.length;
  console.log(`Seeding ${total} companies in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = data.companies.slice(i, i + BATCH_SIZE).map((c) => ({
      id: c.id,
      company_name: c.metadata.company_name,
      site: c.metadata.site,
      homepage: c.metadata.homepage,
      description: c.metadata.description,
      sectors: c.metadata.sectors,
      capabilities: c.metadata.capabilities,
      certifications: c.metadata.certifications,
      materials: c.metadata.materials,
      province: c.metadata.province,
      company_size: c.metadata.company_size,
      document: c.document,
      embedding: JSON.stringify(c.embedding), // pgvector expects stringified array
    }));

    const { error } = await supabase.from("companies").upsert(batch, {
      onConflict: "id",
    });

    if (error) {
      console.error(`  ✗ Batch ${i}–${i + BATCH_SIZE} failed:`, error.message);
      process.exit(1);
    }

    const done = Math.min(i + BATCH_SIZE, total);
    process.stdout.write(`\r  ${done}/${total} companies`);
  }
  console.log("\n  ✓ Companies seeded");
}

async function seedFilterOptions() {
  console.log("Seeding filter_options...");
  const { error } = await supabase.from("app_settings").upsert(
    { key: "filter_options", value: data.filter_options },
    { onConflict: "key" }
  );
  if (error) {
    console.error("  ✗ filter_options failed:", error.message);
    process.exit(1);
  }
  console.log("  ✓ filter_options seeded");
}

async function main() {
  await seedCompanies();
  await seedFilterOptions();
  console.log("\nDone! Your Supabase database is ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
