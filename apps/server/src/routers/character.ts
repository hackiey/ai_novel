import { z } from "zod";
import { ObjectId } from "mongodb";
import { createCharacterSchema, updateCharacterSchema, objectIdSchema } from "@ai-novel/types";
import { router, publicProcedure } from "../trpc.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

function countWords(text: string): number {
  if (!text) return 0;
  // Count both CJK characters and whitespace-separated words
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
  list: publicProcedure
    .input(z.object({ worldId: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const docs = await ctx.db
        .collection("characters")
        .find({ worldId: { $in: [input.worldId, new ObjectId(input.worldId)] } })
        .sort({ updatedAt: -1 })
        .toArray();
      return docs.map(serializeDoc);
    }),

  getById: publicProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("characters")
        .findOne({ _id: new ObjectId(input.id) });
      return serializeDoc(doc);
    }),

  create: publicProcedure
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
        worldId: new ObjectId(input.worldId),
        name: input.name,
        aliases: input.aliases ?? [],
        role: input.role ?? "other",
        profile,
        wordCount: computeCharacterWordCount(profile),
        createdAt: now,
        updatedAt: now,
      };
      const result = await ctx.db.collection("characters").insertOne(doc);
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: publicProcedure
    .input(z.object({ id: objectIdSchema, data: updateCharacterSchema }))
    .mutation(async ({ ctx, input }) => {
      const updateFields: Record<string, any> = {
        updatedAt: new Date(),
      };
      if (input.data.name !== undefined) updateFields.name = input.data.name;
      if (input.data.aliases !== undefined) updateFields.aliases = input.data.aliases;
      if (input.data.role !== undefined) updateFields.role = input.data.role;
      if (input.data.profile !== undefined) {
        updateFields.profile = input.data.profile;
        updateFields.wordCount = computeCharacterWordCount(input.data.profile);
      }

      const result = await ctx.db
        .collection("characters")
        .findOneAndUpdate(
          { _id: new ObjectId(input.id) },
          { $set: updateFields },
          { returnDocument: "after" }
        );

      // If profile was partially updated, recalculate wordCount from full doc
      if (result && input.data.profile !== undefined) {
        const wordCount = computeCharacterWordCount(result.profile);
        if (wordCount !== result.wordCount) {
          await ctx.db
            .collection("characters")
            .updateOne({ _id: new ObjectId(input.id) }, { $set: { wordCount } });
          result.wordCount = wordCount;
        }
      }

      return serializeDoc(result);
    }),

  delete: publicProcedure
    .input(z.object({ id: objectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .collection("characters")
        .deleteOne({ _id: new ObjectId(input.id) });
      return { success: true };
    }),
});
