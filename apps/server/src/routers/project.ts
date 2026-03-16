import { z } from "zod";
import { ObjectId } from "mongodb";
import { createProjectSchema, updateProjectSchema, objectIdSchema } from "@ai-novel/types";
import { router, publicProcedure } from "../trpc.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

export const projectRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const docs = await ctx.db
      .collection("projects")
      .find()
      .sort({ updatedAt: -1 })
      .toArray();
    return docs.map(serializeDoc);
  }),

  getById: publicProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("projects")
        .findOne({ _id: new ObjectId(input.id) });
      return serializeDoc(doc);
    }),

  create: publicProcedure
    .input(createProjectSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const doc: Record<string, any> = {
        name: input.name,
        description: input.description ?? "",
        settings: {
          genre: input.settings?.genre ?? "",
          targetLength: input.settings?.targetLength,
        },
        createdAt: now,
        updatedAt: now,
      };
      if (input.worldId) doc.worldId = input.worldId;
      const result = await ctx.db.collection("projects").insertOne(doc);
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: publicProcedure
    .input(z.object({ id: objectIdSchema, data: updateProjectSchema }))
    .mutation(async ({ ctx, input }) => {
      const updateFields: Record<string, any> = {
        updatedAt: new Date(),
      };
      if (input.data.name !== undefined) updateFields.name = input.data.name;
      if (input.data.description !== undefined) updateFields.description = input.data.description;
      if (input.data.settings !== undefined) updateFields.settings = input.data.settings;
      if (input.data.worldId !== undefined) updateFields.worldId = input.data.worldId;

      const result = await ctx.db
        .collection("projects")
        .findOneAndUpdate(
          { _id: new ObjectId(input.id) },
          { $set: updateFields },
          { returnDocument: "after" }
        );
      return serializeDoc(result);
    }),

  listByWorld: publicProcedure
    .input(z.object({ worldId: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const docs = await ctx.db
        .collection("projects")
        .find({ worldId: input.worldId })
        .sort({ updatedAt: -1 })
        .toArray();
      return docs.map(serializeDoc);
    }),

  delete: publicProcedure
    .input(z.object({ id: objectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .collection("projects")
        .deleteOne({ _id: new ObjectId(input.id) });
      return { success: true };
    }),
});
