/**
 * Audit script: find documents whose id-shaped fields are stored as strings
 * instead of ObjectIds. The dual-type pattern (`$in: [str, ObjectId]`) we use
 * for normal Mongo finds tolerates this, but `$vectorSearch.filter` does not
 * — it rejects mixed-type `$in` arrays — so dirty data silently breaks vector
 * search.
 *
 * Run: pnpm --filter @ai-creator/server exec tsx src/scripts/auditObjectIds.ts
 *
 * Read-only. Pass `--fix` to coerce string values to ObjectId in place.
 */

import "dotenv/config";
import { ObjectId } from "mongodb";
import { connectDb, disconnectDb, getDb } from "../db.js";

interface CheckSpec {
  collection: string;
  /** Fields that should be ObjectId (or null where explicitly nullable). */
  fields: { name: string; nullable?: boolean }[];
}

const CHECKS: CheckSpec[] = [
  { collection: "characters", fields: [{ name: "worldId" }, { name: "projectId", nullable: true }, { name: "userId" }] },
  { collection: "world_settings", fields: [{ name: "worldId" }, { name: "projectId", nullable: true }, { name: "userId" }] },
  { collection: "drafts", fields: [{ name: "worldId" }, { name: "projectId", nullable: true }, { name: "userId" }] },
  { collection: "chapters", fields: [{ name: "projectId" }, { name: "userId" }] },
  { collection: "agent_memory", fields: [{ name: "worldId", nullable: true }, { name: "projectId", nullable: true }, { name: "userId" }] },
  { collection: "projects", fields: [{ name: "worldId" }, { name: "userId" }] },
  { collection: "worlds", fields: [{ name: "userId" }] },
  { collection: "embedding_chunks", fields: [{ name: "sourceId" }] },
];

const fix = process.argv.includes("--fix");

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }
  await connectDb(mongoUri);
  const db = getDb();

  let totalBad = 0;
  const fixPlan: Array<{ collection: string; field: string; ids: ObjectId[] }> = [];

  for (const { collection, fields } of CHECKS) {
    const col = db.collection(collection);
    // Skip if collection doesn't exist
    const exists = await db.listCollections({ name: collection }).toArray();
    if (exists.length === 0) {
      console.log(`\n[${collection}] (collection does not exist, skipped)`);
      continue;
    }

    const total = await col.estimatedDocumentCount();
    console.log(`\n[${collection}] total ≈ ${total}`);

    for (const { name, nullable } of fields) {
      // Anything that is NOT objectId AND NOT null (when nullable) AND NOT missing.
      const badFilter: Record<string, unknown> = {
        [name]: { $exists: true, $not: { $type: "objectId" } },
      };
      if (nullable) {
        badFilter[name] = { $exists: true, $ne: null, $not: { $type: "objectId" } };
      }

      const count = await col.countDocuments(badFilter);
      if (count === 0) {
        console.log(`  ${name}: ✓ all ObjectId`);
        continue;
      }

      totalBad += count;
      const samples = await col
        .find(badFilter, { projection: { _id: 1, [name]: 1 } })
        .limit(5)
        .toArray();
      console.log(
        `  ${name}: ✗ ${count} bad doc(s). samples: ${samples
          .map((d) => `${d._id} (${typeof d[name]}=${JSON.stringify(d[name])})`)
          .join(", ")}`
      );

      if (fix) {
        // Only attempt to fix string values that look like 24-hex ObjectIds.
        const fixable = await col
          .find({ [name]: { $type: "string" } }, { projection: { _id: 1, [name]: 1 } })
          .toArray();
        const ids = fixable
          .filter((d) => typeof d[name] === "string" && /^[a-fA-F0-9]{24}$/.test(d[name]))
          .map((d) => d._id as ObjectId);
        if (ids.length) fixPlan.push({ collection, field: name, ids });
      }
    }
  }

  if (fix && fixPlan.length) {
    console.log(`\nApplying --fix to ${fixPlan.reduce((n, p) => n + p.ids.length, 0)} document(s)...`);
    for (const { collection, field, ids } of fixPlan) {
      const col = db.collection(collection);
      let fixed = 0;
      for (const id of ids) {
        const doc = await col.findOne({ _id: id }, { projection: { [field]: 1 } });
        const value = doc?.[field];
        if (typeof value !== "string" || !/^[a-fA-F0-9]{24}$/.test(value)) continue;
        await col.updateOne({ _id: id }, { $set: { [field]: new ObjectId(value) } });
        fixed += 1;
      }
      console.log(`  [${collection}.${field}] coerced ${fixed} value(s) to ObjectId`);
    }
  } else if (totalBad > 0) {
    console.log(`\n${totalBad} bad value(s) found. Re-run with --fix to coerce string→ObjectId where safe (24-hex strings only).`);
  } else {
    console.log("\nAll clear.");
  }

  await disconnectDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
