import { z } from "zod";
import { ObjectId } from "mongodb";
import { createWorldSchema, updateWorldSchema, objectIdSchema } from "@ai-novel/types";
import { router, publicProcedure } from "../trpc.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

export const worldRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const docs = await ctx.db
      .collection("worlds")
      .find()
      .sort({ updatedAt: -1 })
      .toArray();
    return docs.map(serializeDoc);
  }),

  getById: publicProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("worlds")
        .findOne({ _id: new ObjectId(input.id) });
      return serializeDoc(doc);
    }),

  create: publicProcedure
    .input(createWorldSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const doc = {
        name: input.name,
        description: input.description ?? "",
        createdAt: now,
        updatedAt: now,
      };
      const result = await ctx.db.collection("worlds").insertOne(doc);
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: publicProcedure
    .input(z.object({ id: objectIdSchema, data: updateWorldSchema }))
    .mutation(async ({ ctx, input }) => {
      const updateFields: Record<string, any> = {
        updatedAt: new Date(),
      };
      if (input.data.name !== undefined) updateFields.name = input.data.name;
      if (input.data.description !== undefined) updateFields.description = input.data.description;

      const result = await ctx.db
        .collection("worlds")
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
        .collection("worlds")
        .deleteOne({ _id: new ObjectId(input.id) });
      return { success: true };
    }),
});
