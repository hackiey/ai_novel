import { z } from "zod";
import { ObjectId, Filter } from "mongodb";
import { createDraftSchema, updateDraftSchema, objectIdSchema } from "@ai-novel/types";
import { router, publicProcedure } from "../trpc.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

export const draftRouter = router({
  list: publicProcedure
    .input(z.object({
      projectId: objectIdSchema.optional(),
      worldId: objectIdSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      const filter: Filter<any> = {};
      if (input.projectId) filter.projectId = { $in: [input.projectId, new ObjectId(input.projectId)] };
      if (input.worldId) filter.worldId = { $in: [input.worldId, new ObjectId(input.worldId)] };
      const docs = await ctx.db
        .collection("drafts")
        .find(filter)
        .sort({ updatedAt: -1 })
        .toArray();
      return docs.map(serializeDoc);
    }),

  getById: publicProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("drafts")
        .findOne({ _id: new ObjectId(input.id) });
      return serializeDoc(doc);
    }),

  create: publicProcedure
    .input(createDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const doc: Record<string, any> = {
        title: input.title,
        content: input.content ?? "",
        tags: input.tags ?? [],
        linkedCharacters: input.linkedCharacters ?? [],
        linkedWorldSettings: input.linkedWorldSettings ?? [],
        createdAt: now,
        updatedAt: now,
      };
      if (input.projectId) doc.projectId = new ObjectId(input.projectId);
      if (input.worldId) doc.worldId = new ObjectId(input.worldId);
      const result = await ctx.db.collection("drafts").insertOne(doc);
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: publicProcedure
    .input(z.object({ id: objectIdSchema, data: updateDraftSchema }))
    .mutation(async ({ ctx, input }) => {
      const updateFields: Record<string, any> = {
        updatedAt: new Date(),
      };
      if (input.data.title !== undefined) updateFields.title = input.data.title;
      if (input.data.content !== undefined) updateFields.content = input.data.content;
      if (input.data.tags !== undefined) updateFields.tags = input.data.tags;
      if (input.data.linkedCharacters !== undefined) updateFields.linkedCharacters = input.data.linkedCharacters;
      if (input.data.linkedWorldSettings !== undefined) updateFields.linkedWorldSettings = input.data.linkedWorldSettings;

      const result = await ctx.db
        .collection("drafts")
        .findOneAndUpdate(
          { _id: new ObjectId(input.id) },
          { $set: updateFields },
          { returnDocument: "after" }
        );
      return serializeDoc(result);
    }),

  delete: publicProcedure
    .input(z.object({ id: objectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .collection("drafts")
        .deleteOne({ _id: new ObjectId(input.id) });
      return { success: true };
    }),
});
