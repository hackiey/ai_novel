#!/usr/bin/env node

/**
 * Database migration script: ai_novel -> ai_creator
 *
 * Copies all collections from the old database to the new one.
 * Usage:
 *   node scripts/migrate-db.mjs [MONGODB_URI_BASE]
 *
 * Examples:
 *   node scripts/migrate-db.mjs                          # uses localhost:27017
 *   node scripts/migrate-db.mjs "mongodb://localhost:27017"
 *   node scripts/migrate-db.mjs "mongodb+srv://user:pass@cluster.mongodb.net"
 */

import { MongoClient } from "mongodb";

const OLD_DB = "ai_novel";
const NEW_DB = "ai_creator";

const baseUri = process.argv[2] || "mongodb://localhost:27017";

async function migrate() {
  const client = new MongoClient(baseUri);

  try {
    await client.connect();
    console.log(`Connected to ${baseUri}`);

    const oldDb = client.db(OLD_DB);
    const newDb = client.db(NEW_DB);

    // List all collections in the old database
    const collections = await oldDb.listCollections().toArray();

    if (collections.length === 0) {
      console.log(`Database "${OLD_DB}" has no collections. Nothing to migrate.`);
      return;
    }

    console.log(`Found ${collections.length} collections in "${OLD_DB}":\n`);

    for (const colInfo of collections) {
      const name = colInfo.name;

      // Skip system collections
      if (name.startsWith("system.")) {
        console.log(`  [skip] ${name} (system collection)`);
        continue;
      }

      const oldCol = oldDb.collection(name);
      const newCol = newDb.collection(name);

      const count = await oldCol.countDocuments();

      if (count === 0) {
        console.log(`  [skip] ${name} (0 documents)`);
        continue;
      }

      // Check if target collection already has data
      const existingCount = await newCol.countDocuments();
      if (existingCount > 0) {
        console.log(`  [skip] ${name} (${existingCount} documents already exist in target, skipping to avoid duplicates)`);
        continue;
      }

      // Batch insert in chunks of 1000
      const BATCH_SIZE = 1000;
      let inserted = 0;
      const cursor = oldCol.find();

      let batch = [];
      for await (const doc of cursor) {
        batch.push(doc);
        if (batch.length >= BATCH_SIZE) {
          await newCol.insertMany(batch, { ordered: false });
          inserted += batch.length;
          batch = [];
        }
      }
      if (batch.length > 0) {
        await newCol.insertMany(batch, { ordered: false });
        inserted += batch.length;
      }

      console.log(`  [done] ${name}: ${inserted} documents copied`);
    }

    // Copy indexes (excluding _id and vector search indexes)
    console.log("\nCopying indexes...\n");

    for (const colInfo of collections) {
      const name = colInfo.name;
      if (name.startsWith("system.")) continue;

      const oldCol = oldDb.collection(name);
      const newCol = newDb.collection(name);

      const indexes = await oldCol.indexes();

      for (const idx of indexes) {
        // Skip default _id index
        if (idx.name === "_id_") continue;

        // Skip vector search indexes (managed separately)
        if (idx.name === "vector_index") continue;

        try {
          const { key, ...options } = idx;
          // Remove internal fields
          delete options.v;
          delete options.ns;

          await newCol.createIndex(key, options);
          console.log(`  [index] ${name}.${idx.name}`);
        } catch (err) {
          if (err.code === 85 || err.code === 86) {
            // Index already exists
            console.log(`  [skip] ${name}.${idx.name} (already exists)`);
          } else {
            console.log(`  [warn] ${name}.${idx.name}: ${err.message}`);
          }
        }
      }
    }

    console.log("\nMigration complete!");
    console.log(`\nOld database "${OLD_DB}" is untouched. You can drop it manually after verifying:`);
    console.log(`  mongosh --eval 'db.getSiblingDB("${OLD_DB}").dropDatabase()'`);

  } finally {
    await client.close();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
