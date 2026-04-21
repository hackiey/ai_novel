import { readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { ObjectId, type Db } from "mongodb";
import matter from "gray-matter";
import type { ServerEmbeddingService } from "./services/embeddingService.js";

export interface BuiltinSkillFile {
  slug: string;
  name: string;
  description: string;
  content: string;
  tags: string[];
}

const BUILTIN_DIR = resolve(import.meta.dirname, "../builtin-skills");

function computeBuiltinHash(skill: BuiltinSkillFile): string {
  const payload = JSON.stringify({
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    tags: [...skill.tags].sort(),
  });
  return createHash("sha1").update(payload).digest("hex");
}

export async function loadBuiltinSkills(): Promise<BuiltinSkillFile[]> {
  if (!existsSync(BUILTIN_DIR)) {
    return [];
  }
  const entries = await readdir(BUILTIN_DIR);
  const files = entries.filter((f) => f.endsWith(".md"));
  const skills: BuiltinSkillFile[] = [];

  for (const file of files) {
    const path = resolve(BUILTIN_DIR, file);
    const raw = await readFile(path, "utf-8");
    const { data, content } = matter(raw);

    const slug = data.slug;
    const name = data.name;
    const description = data.description;

    if (!slug || typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug)) {
      console.warn(`[builtin-skills] ${file}: invalid or missing 'slug' (must match /^[a-z0-9-]+$/), skipping`);
      continue;
    }
    if (!name || typeof name !== "string") {
      console.warn(`[builtin-skills] ${file}: missing 'name', skipping`);
      continue;
    }
    if (!description || typeof description !== "string") {
      console.warn(`[builtin-skills] ${file}: missing 'description', skipping`);
      continue;
    }

    const tags = Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === "string") : [];

    skills.push({
      slug,
      name,
      description,
      content: content.trim(),
      tags,
    });
  }

  return skills;
}

export interface SyncStats {
  inserted: number;
  updated: number;
  skipped: number;
  deleted: number;
  conflicts: number;
}

export async function syncBuiltinSkills(
  db: Db,
  embeddingService?: ServerEmbeddingService | null,
): Promise<SyncStats> {
  const stats: SyncStats = { inserted: 0, updated: 0, skipped: 0, deleted: 0, conflicts: 0 };
  const files = await loadBuiltinSkills();
  const fileSlugs = new Set(files.map((f) => f.slug));

  for (const file of files) {
    const computed = computeBuiltinHash(file);
    const doc = await db.collection("skills").findOne({ slug: file.slug });

    if (!doc) {
      const now = new Date();
      const insertResult = await db.collection("skills").insertOne({
        slug: file.slug,
        name: file.name,
        description: file.description,
        content: file.content,
        tags: file.tags,
        isBuiltin: true,
        isPublished: false,
        builtinHash: computed,
        createdAt: now,
        updatedAt: now,
      });
      embeddingService?.enqueue("skills", insertResult.insertedId.toHexString());
      stats.inserted++;
    } else if (!doc.isBuiltin) {
      console.warn(`[builtin-skills] slug "${file.slug}" already exists as user skill (id ${doc._id.toHexString()}), skipping builtin sync`);
      stats.conflicts++;
    } else if (doc.builtinHash !== computed) {
      await db.collection("skills").updateOne(
        { _id: doc._id },
        {
          $set: {
            slug: file.slug,
            name: file.name,
            description: file.description,
            content: file.content,
            tags: file.tags,
            isBuiltin: true,
            builtinHash: computed,
            updatedAt: new Date(),
          },
        },
      );
      embeddingService?.enqueue("skills", doc._id.toHexString());
      stats.updated++;
    } else {
      stats.skipped++;
    }
  }

  // Delete builtin skills no longer present in code
  const stale = await db
    .collection("skills")
    .find({ isBuiltin: true, slug: { $nin: [...fileSlugs] } })
    .project({ _id: 1 })
    .toArray();

  for (const s of stale) {
    await db.collection("skills").deleteOne({ _id: s._id });
    await db.collection("embedding_chunks").deleteMany({
      sourceCollection: "skills",
      sourceId: s._id,
    });
    stats.deleted++;
  }

  return stats;
}
