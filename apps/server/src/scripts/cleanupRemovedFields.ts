/**
 * One-shot cleanup: removes fields that the application no longer reads or
 * writes. Run after deploying the code change that drops these fields from the
 * tool surface, types, routers, and UI.
 *
 *   characters.aliases             → unset
 *   drafts.linkedCharacters        → unset
 *   drafts.linkedWorldSettings     → unset
 *   world_settings.category        → unset
 *
 * Usage:
 *   pnpm --filter @ai-creator/server tsx src/scripts/cleanupRemovedFields.ts
 *   DRY_RUN=1 pnpm --filter @ai-creator/server tsx src/scripts/cleanupRemovedFields.ts
 *
 * Reads MONGODB_URI from .env. The script is idempotent — running twice is
 * safe; the second run reports zero modified docs.
 */

import "dotenv/config";
import { connectDb, disconnectDb, getDb } from "../db.js";

const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

interface Cleanup {
  collection: string;
  fields: string[];
}

const CLEANUPS: Cleanup[] = [
  { collection: "characters", fields: ["aliases"] },
  { collection: "drafts", fields: ["linkedCharacters", "linkedWorldSettings"] },
  { collection: "world_settings", fields: ["category"] },
];

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set in environment.");
    process.exit(1);
  }

  await connectDb(uri);
  const db = getDb();

  console.log(`[cleanupRemovedFields] DB: ${db.databaseName} | dry-run: ${DRY_RUN}`);
  console.log("");

  for (const { collection, fields } of CLEANUPS) {
    const filter: Record<string, unknown> = { $or: fields.map((f) => ({ [f]: { $exists: true } })) };
    const matched = await db.collection(collection).countDocuments(filter);

    console.log(`[${collection}] fields to drop: ${fields.join(", ")}`);
    console.log(`[${collection}] documents with at least one of these fields: ${matched}`);

    if (matched === 0) {
      console.log(`[${collection}] nothing to do.\n`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`[${collection}] DRY_RUN — would $unset on ${matched} documents.\n`);
      continue;
    }

    const unset = Object.fromEntries(fields.map((f) => [f, ""]));
    const result = await db.collection(collection).updateMany(filter, { $unset: unset });
    console.log(`[${collection}] modified: ${result.modifiedCount} (matched: ${result.matchedCount}).\n`);
  }

  await disconnectDb();
  console.log("Done.");
}

main().catch(async (err) => {
  console.error("[cleanupRemovedFields] failed:", err);
  try { await disconnectDb(); } catch { /* ignore */ }
  process.exit(1);
});
