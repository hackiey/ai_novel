import "dotenv/config";
import { ObjectId } from "mongodb";
import { connectDb, disconnectDb, getDb } from "../db.js";

interface MigrationStats {
  scanned: number;
  alreadyMigrated: number;
  legacyTranslated: number;
  defaultedToEmpty: number;
}

async function migrateCollection(collectionName: "projects" | "worlds"): Promise<MigrationStats> {
  const db = getDb();
  const stats: MigrationStats = {
    scanned: 0,
    alreadyMigrated: 0,
    legacyTranslated: 0,
    defaultedToEmpty: 0,
  };

  const cursor = db.collection(collectionName).find(
    {},
    { projection: { _id: 1, enabledSkillSlugs: 1, enabledSkillIds: 1 } },
  );

  for await (const doc of cursor) {
    stats.scanned++;

    if (Array.isArray(doc.enabledSkillSlugs)) {
      stats.alreadyMigrated++;
      continue;
    }

    if (Array.isArray(doc.enabledSkillIds)) {
      const oids = (doc.enabledSkillIds as unknown[])
        .map((id): ObjectId | null => {
          if (id instanceof ObjectId) return id;
          if (typeof id === "string" && /^[a-f0-9]{24}$/i.test(id)) return new ObjectId(id);
          return null;
        })
        .filter((x): x is ObjectId => x !== null);

      let slugs: string[] = [];
      if (oids.length > 0) {
        const skillDocs = await db
          .collection("skills")
          .find({ _id: { $in: oids } })
          .project({ slug: 1 })
          .toArray();
        slugs = skillDocs.map((d) => d.slug as string).filter(Boolean);
      }

      await db.collection(collectionName).updateOne(
        { _id: doc._id },
        { $set: { enabledSkillSlugs: slugs }, $unset: { enabledSkillIds: "" } },
      );
      stats.legacyTranslated++;
      continue;
    }

    await db.collection(collectionName).updateOne(
      { _id: doc._id },
      { $set: { enabledSkillSlugs: [] } },
    );
    stats.defaultedToEmpty++;
  }

  return stats;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  await connectDb(uri);

  try {
    for (const name of ["projects", "worlds"] as const) {
      const stats = await migrateCollection(name);
      console.log(
        `[${name}] scanned=${stats.scanned} alreadyMigrated=${stats.alreadyMigrated} ` +
        `legacyTranslated=${stats.legacyTranslated} defaultedToEmpty=${stats.defaultedToEmpty}`,
      );
    }
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
