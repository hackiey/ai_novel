import { z } from "zod";
import { ObjectId } from "mongodb";
import { randomUUID } from "crypto";
import { objectIdSchema } from "@ai-creator/types";
import { router, protectedProcedure, userIdFilter } from "../trpc.js";
import { getEmbeddingService } from "../services/embeddingService.js";

const EXPORT_VERSION = 1;

// Fields to strip from exported documents
const EXCLUDED_FIELDS = [
  "userId",
  "embedding",
  "embeddingText",
  "synopsisJobLockedAt",
  "synopsisJobToken",
] as const;

function serializeForExport(doc: any) {
  if (!doc) return null;
  const result: any = {};
  for (const [key, value] of Object.entries(doc)) {
    if ((EXCLUDED_FIELDS as readonly string[]).includes(key)) continue;
    if (key === "_id") {
      result._id = value instanceof ObjectId ? value.toHexString() : String(value);
    } else if (value instanceof Date) {
      result[key] = value.toISOString();
    } else {
      result[key] = value;
    }
  }
  return result;
}

function parseDateFields(doc: any): any {
  const result = { ...doc };
  for (const key of ["createdAt", "updatedAt", "synopsisUpdatedAt", "synopsisLastAttemptAt"]) {
    if (result[key] && typeof result[key] === "string") {
      result[key] = new Date(result[key]);
    }
  }
  return result;
}

/** Insert many documents, silently skipping any whose _id already exists. */
async function insertManySkipDuplicates(db: any, collection: string, docs: any[]): Promise<string[]> {
  if (docs.length === 0) return [];
  try {
    const result = await db.collection(collection).insertMany(docs, { ordered: false });
    return Object.values(result.insertedIds).map((id: any) => id.toHexString());
  } catch (err: any) {
    // code 11000 = duplicate key — some docs were skipped, the rest were inserted
    if (err.code === 11000 || err.writeErrors?.every((e: any) => e.code === 11000)) {
      const inserted = err.insertedIds
        ? Object.values(err.insertedIds).map((id: any) => id.toHexString())
        : [];
      return inserted;
    }
    throw err;
  }
}

export const exportImportRouter = router({
  exportWorld: protectedProcedure
    .input(z.object({ worldId: objectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db;
      const userId = userIdFilter(ctx.user.userId);

      // Fetch world
      const world = await db.collection("worlds").findOne({
        _id: new ObjectId(input.worldId),
        userId,
      });
      if (!world) throw new Error("World not found");

      // Fetch all related collections in parallel
      const worldIdFilter = { $in: [input.worldId, new ObjectId(input.worldId)] };
      const [characters, worldSettings, drafts, projects] = await Promise.all([
        db.collection("characters").find({ worldId: worldIdFilter, userId }).toArray(),
        db.collection("world_settings").find({ worldId: worldIdFilter, userId }).toArray(),
        db.collection("drafts").find({ worldId: worldIdFilter, userId }).toArray(),
        db.collection("projects").find({ worldId: worldIdFilter, userId }).toArray(),
      ]);

      // For each project, fetch chapters
      const projectBundles = await Promise.all(
        projects.map(async (project) => {
          const projectIdStr = project._id.toHexString();
          const [chapters, projectMemoryDoc] = await Promise.all([
            db.collection("chapters").find({
              projectId: { $in: [projectIdStr, new ObjectId(projectIdStr)] },
              userId,
            }).sort({ order: 1 }).toArray(),
            db.collection("agent_memory").findOne({ projectId: new ObjectId(projectIdStr) }),
          ]);
          return {
            project: serializeForExport(project),
            chapters: chapters.map(serializeForExport),
            agentMemory: projectMemoryDoc ? [{ scope: "project", content: projectMemoryDoc.content }] : [],
          };
        }),
      );

      // Fetch world-level agent memory
      const worldMemoryDoc = await db.collection("agent_memory").findOne({
        worldId: new ObjectId(input.worldId),
      });

      return {
        version: EXPORT_VERSION,
        type: "world" as const,
        exportedAt: new Date().toISOString(),
        data: {
          world: serializeForExport(world),
          characters: characters.map(serializeForExport),
          worldSettings: worldSettings.map(serializeForExport),
          drafts: drafts.map(serializeForExport),
          projects: projectBundles,
          agentMemory: worldMemoryDoc ? [{ scope: "world", content: worldMemoryDoc.content }] : [],
        },
      };
    }),

  importWorld: protectedProcedure
    .input(z.object({
      data: z.any(),
      overwriteMemory: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const payload = input.data;

      // Validate top-level format
      if (!payload || typeof payload !== "object") throw new Error("Invalid import data");
      if (payload.version !== EXPORT_VERSION) throw new Error(`Unsupported version: ${payload.version}. Expected: ${EXPORT_VERSION}`);
      if (payload.type !== "world") throw new Error(`Expected type "world", got "${payload.type}"`);

      const data = payload.data;
      if (!data?.world) throw new Error("Missing world data");

      const db = ctx.db;
      const userId = ctx.user.userId;
      const now = new Date();

      // Use original _id from export — if it already exists, skip (dedup)
      const worldId = data.world._id;
      const worldDoc = parseDateFields(data.world);
      delete worldDoc._id;

      // Try insert world — if already exists, merge new data into it
      let worldExists = false;
      try {
        await db.collection("worlds").insertOne({
          _id: new ObjectId(worldId),
          ...worldDoc,
          userId,
          summaryStale: true,
          summary: "",
          updatedAt: now,
        });
      } catch (err: any) {
        if (err.code === 11000) {
          worldExists = true;
        } else {
          throw err;
        }
      }

      // Insert characters (skip duplicates)
      const characters = data.characters ?? [];
      const insertedCharIds = await insertManySkipDuplicates(db, "characters",
        characters.map((char: any) => {
          const doc = parseDateFields(char);
          const id = doc._id;
          delete doc._id;
          return { _id: new ObjectId(id), ...doc, userId, worldId };
        }),
      );

      // Insert world settings (skip duplicates)
      const worldSettings = data.worldSettings ?? [];
      const insertedWsIds = await insertManySkipDuplicates(db, "world_settings",
        worldSettings.map((ws: any) => {
          const doc = parseDateFields(ws);
          const id = doc._id;
          delete doc._id;
          return { _id: new ObjectId(id), ...doc, userId, worldId };
        }),
      );

      // Insert drafts (skip duplicates)
      const drafts = data.drafts ?? [];
      const insertedDraftIds = await insertManySkipDuplicates(db, "drafts",
        drafts.map((draft: any) => {
          const doc = parseDateFields(draft);
          const id = doc._id;
          delete doc._id;
          return { _id: new ObjectId(id), ...doc, userId, worldId };
        }),
      );

      // Insert projects and their chapters
      const insertedChapterIds: string[] = [];
      for (const bundle of data.projects ?? []) {
        const projDoc = parseDateFields(bundle.project);
        const projectId = projDoc._id;
        delete projDoc._id;

        await insertManySkipDuplicates(db, "projects", [{
          _id: new ObjectId(projectId),
          ...projDoc,
          userId,
          worldId,
        }]);

        const chapters = bundle.chapters ?? [];
        const ids = await insertManySkipDuplicates(db, "chapters",
          chapters.map((ch: any) => {
            const doc = parseDateFields(ch);
            const id = doc._id;
            delete doc._id;
            return {
              _id: new ObjectId(id),
              ...doc,
              userId,
              projectId,
              synopsisStatus: "pending",
              synopsisSourceHash: undefined,
            };
          }),
        );
        insertedChapterIds.push(...ids);

        // Insert project-level agent memory (only if overwriteMemory is set)
        if (input.overwriteMemory) {
          for (const mem of bundle.agentMemory ?? []) {
            if (mem.content) {
              await db.collection("agent_memory").updateOne(
                { projectId: new ObjectId(projectId) },
                { $set: { content: mem.content, updatedAt: now } },
                { upsert: true },
              );
            }
          }
        }
      }

      // Insert world-level agent memory (only if overwriteMemory is set)
      if (input.overwriteMemory) {
        for (const mem of data.agentMemory ?? []) {
          if (mem.content) {
            await db.collection("agent_memory").updateOne(
              { worldId: new ObjectId(worldId) },
              { $set: { content: mem.content, updatedAt: now } },
              { upsert: true },
            );
          }
        }
      }

      // Enqueue embedding generation only for newly inserted documents
      const embeddingService = getEmbeddingService();
      if (embeddingService) {
        for (const id of insertedCharIds) embeddingService.enqueue("characters", id);
        for (const id of insertedWsIds) embeddingService.enqueue("world_settings", id);
        for (const id of insertedDraftIds) embeddingService.enqueue("drafts", id);
        for (const id of insertedChapterIds) embeddingService.enqueue("chapters", id);
      }

      // Mark world summary as stale after merge
      if (worldExists) {
        await db.collection("worlds").updateOne(
          { _id: new ObjectId(worldId) },
          { $set: { summaryStale: true, updatedAt: now } },
        );
      }

      return { worldId, merged: worldExists };
    }),
});
