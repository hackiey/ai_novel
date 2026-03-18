import { z } from "zod";
import { ObjectId } from "mongodb";
import { createCharacterSchema, updateCharacterSchema, objectIdSchema } from "@ai-novel/types";
import { router, protectedProcedure, userIdFilter } from "../trpc.js";
import { getEmbeddingService } from "../services/embeddingService.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

function countWords(text: string): number {
  if (!text) return 0;
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
  const cjkCount = cjk ? cjk.length : 0;
  const stripped = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, " ");
  const words = stripped.split(/\s+/).filter(Boolean);
  return cjkCount + words.length;
}

function computeCharacterWordCount(profile: any): number {
  if (!profile) return 0;
  let total = 0;
  for (const key of ["appearance", "personality", "background", "goals"]) {
    if (profile[key]) total += countWords(profile[key]);
  }
  if (profile.customFields) {
    for (const val of Object.values(profile.customFields)) {
      if (typeof val === "string") total += countWords(val);
    }
  }
  return total;
}

export const characterRouter = router({
  list: protectedProcedure
    .input(z.object({ worldId: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const docs = await ctx.db
        .collection("characters")
        .find({ worldId: { $in: [input.worldId, new ObjectId(input.worldId)] }, userId: userIdFilter(ctx.user.userId) })
        .sort({ updatedAt: -1 })
        .toArray();
      return docs.map(serializeDoc);
    }),

  getById: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("characters")
        .findOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      return serializeDoc(doc);
    }),

  create: protectedProcedure
    .input(createCharacterSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const profile = {
        appearance: input.profile?.appearance ?? "",
        personality: input.profile?.personality ?? "",
        background: input.profile?.background ?? "",
        goals: input.profile?.goals ?? "",
        relationships: input.profile?.relationships ?? [],
        customFields: input.profile?.customFields ?? {},
      };
      const doc = {
        userId: ctx.user.userId,
        worldId: new ObjectId(input.worldId),
        name: input.name,
        aliases: input.aliases ?? [],
        role: input.role ?? "other",
        importance: input.importance ?? "minor",
        summary: input.summary ?? "",
        profile,
        wordCount: computeCharacterWordCount(profile),
        createdAt: now,
        updatedAt: now,
      };
      const result = await ctx.db.collection("characters").insertOne(doc);
      getEmbeddingService()?.enqueue("characters", result.insertedId.toHexString());
      // Mark world summary as stale
      await ctx.db.collection("worlds").updateOne(
        { _id: new ObjectId(input.worldId) },
        { $set: { summaryStale: true } }
      );
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: protectedProcedure
    .input(z.object({ id: objectIdSchema, data: updateCharacterSchema }))
    .mutation(async ({ ctx, input }) => {
      const updateFields: Record<string, any> = {
        updatedAt: new Date(),
      };
      if (input.data.name !== undefined) updateFields.name = input.data.name;
      if (input.data.aliases !== undefined) updateFields.aliases = input.data.aliases;
      if (input.data.role !== undefined) updateFields.role = input.data.role;
      if (input.data.importance !== undefined) updateFields.importance = input.data.importance;
      if (input.data.summary !== undefined) updateFields.summary = input.data.summary;
      if (input.data.profile !== undefined) {
        updateFields.profile = input.data.profile;
        updateFields.wordCount = computeCharacterWordCount(input.data.profile);
      }

      const result = await ctx.db
        .collection("characters")
        .findOneAndUpdate(
          { _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) },
          { $set: updateFields },
          { returnDocument: "after" }
        );

      if (result && input.data.profile !== undefined) {
        const wordCount = computeCharacterWordCount(result.profile);
        if (wordCount !== result.wordCount) {
          await ctx.db
            .collection("characters")
            .updateOne({ _id: new ObjectId(input.id) }, { $set: { wordCount } });
          result.wordCount = wordCount;
        }
      }

      if (result) {
        getEmbeddingService()?.enqueue("characters", input.id);
        // Mark world summary as stale
        if (result.worldId) {
          await ctx.db.collection("worlds").updateOne(
            { _id: result.worldId instanceof ObjectId ? result.worldId : new ObjectId(result.worldId as string) },
            { $set: { summaryStale: true } }
          );
        }
      }
      return serializeDoc(result);
    }),

  delete: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.collection("characters").findOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      await ctx.db
        .collection("characters")
        .deleteOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      // Mark world summary as stale
      if (doc?.worldId) {
        await ctx.db.collection("worlds").updateOne(
          { _id: doc.worldId instanceof ObjectId ? doc.worldId : new ObjectId(doc.worldId as string) },
          { $set: { summaryStale: true } }
        );
      }
      return { success: true };
    }),
});
