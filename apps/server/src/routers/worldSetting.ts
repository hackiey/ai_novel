import { z } from "zod";
import { ObjectId, Filter } from "mongodb";
import { createWorldSettingSchema, updateWorldSettingSchema, objectIdSchema } from "@ai-novel/types";
import { router, publicProcedure } from "../trpc.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

export const worldSettingRouter = router({
  list: publicProcedure
    .input(z.object({
      worldId: objectIdSchema,
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const filter: Filter<any> = { worldId: { $in: [input.worldId, new ObjectId(input.worldId)] } };
      if (input.category) {
        filter.category = input.category;
      }
      const docs = await ctx.db
        .collection("world_settings")
        .find(filter)
        .sort({ updatedAt: -1 })
        .toArray();
      return docs.map(serializeDoc);
    }),

  getById: publicProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("world_settings")
        .findOne({ _id: new ObjectId(input.id) });
      return serializeDoc(doc);
    }),

  create: publicProcedure
    .input(createWorldSettingSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const doc = {
        worldId: new ObjectId(input.worldId),
        category: input.category,
        title: input.title,
        content: input.content ?? "",
        tags: input.tags ?? [],
        createdAt: now,
        updatedAt: now,
      };
      const result = await ctx.db.collection("world_settings").insertOne(doc);
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: publicProcedure
    .input(z.object({ id: objectIdSchema, data: updateWorldSettingSchema }))
    .mutation(async ({ ctx, input }) => {
      const updateFields: Record<string, any> = {
        updatedAt: new Date(),
      };
      if (input.data.category !== undefined) updateFields.category = input.data.category;
      if (input.data.title !== undefined) updateFields.title = input.data.title;
      if (input.data.content !== undefined) updateFields.content = input.data.content;
      if (input.data.tags !== undefined) updateFields.tags = input.data.tags;

      const result = await ctx.db
        .collection("world_settings")
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
        .collection("world_settings")
        .deleteOne({ _id: new ObjectId(input.id) });
      return { success: true };
    }),
});
