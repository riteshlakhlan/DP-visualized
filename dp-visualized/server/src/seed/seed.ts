/**
 * Seed MongoDB with the catalog. Safe to re-run (upserts).
 *   npm run seed
 */
import mongoose from "mongoose";
import "dotenv/config";
import { env } from "../config/env";
import { Problem } from "../models/Problem";
import { Pattern } from "../models/Pattern";
import { patterns, problems, implementedSlugs } from "../data/catalog";
import { COMPLEXITY } from "../data/complexity";
import { getService } from "../services/registry";

async function seed() {
  if (!env.mongoUri) {
    console.error("MONGODB_URI is not set — nothing to seed.");
    process.exit(1);
  }
  await mongoose.connect(env.mongoUri);
  console.log("[seed] connected");

  for (const pat of patterns) {
    await Pattern.updateOne({ slug: pat.slug }, { $set: pat }, { upsert: true });
  }
  console.log(`[seed] ${patterns.length} patterns upserted`);

  for (const prob of problems) {
    const def = getService(prob.slug);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code: any = {};
    if (def?.codes) {
      for (const [variant, langs] of Object.entries(def.codes)) code[variant] = langs;
    }
    await Problem.updateOne(
      { slug: prob.slug },
      {
        $set: {
          ...prob,
          implemented: implementedSlugs.has(prob.slug),
          code,
          timeComplexity: COMPLEXITY[prob.slug]?.time ?? null,
          spaceComplexity: COMPLEXITY[prob.slug]?.space ?? null,
          keyInsight: COMPLEXITY[prob.slug]?.insight ?? null,
        },
      },
      { upsert: true },
    );
  }
  console.log(`[seed] ${problems.length} problems upserted (${implementedSlugs.size} with trace engines)`);

  await mongoose.disconnect();
  console.log("[seed] done");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
