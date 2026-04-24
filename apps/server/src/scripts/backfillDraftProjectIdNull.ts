import "dotenv/config";
import { connectDb, disconnectDb, getDb } from "../db.js";

/**
 * Backfill: every draft must have an explicit `projectId` field. Drafts created
 * before the scope-isolation refactor either have no field at all (legacy
 * world-level) or a real ObjectId. This script writes `projectId: null` to all
 * documents missing the field so Atlas Vector Search can filter on
 * `$in: [<pid>, null]`.
 *
 * Run: pnpm --filter @ai-creator/server exec tsx src/scripts/backfillDraftProjectIdNull.ts
 */
async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }
  await connectDb(mongoUri);
  const db = getDb();

  const beforeCount = await db.collection("drafts").countDocuments({ projectId: { $exists: false } });
  console.log(`[backfill] drafts missing projectId: ${beforeCount}`);

  if (beforeCount === 0) {
    console.log("[backfill] nothing to do.");
    await disconnectDb();
    return;
  }

  const result = await db.collection("drafts").updateMany(
    { projectId: { $exists: false } },
    { $set: { projectId: null } },
  );
  console.log(`[backfill] matched=${result.matchedCount} modified=${result.modifiedCount}`);

  const afterCount = await db.collection("drafts").countDocuments({ projectId: { $exists: false } });
  console.log(`[backfill] remaining drafts missing projectId: ${afterCount}`);

  await disconnectDb();
}

main().catch(async (err) => {
  console.error("[backfill] failed:", err);
  try { await disconnectDb(); } catch {}
  process.exit(1);
});
