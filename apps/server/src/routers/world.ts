import { z } from "zod";
import { ObjectId } from "mongodb";
import { createWorldSchema, updateWorldSchema, objectIdSchema } from "@ai-creator/types";
import { router, protectedProcedure, userIdFilter } from "../trpc.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

export const worldRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const docs = await ctx.db
      .collection("worlds")
      .find({ userId: userIdFilter(ctx.user.userId) })
      .sort({ updatedAt: -1 })
      .toArray();
    return docs.map(serializeDoc);
  }),

  getById: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("worlds")
        .findOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      return serializeDoc(doc);
    }),

  create: protectedProcedure
    .input(createWorldSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const doc = {
        userId: ctx.user.userId,
        name: input.name,
        description: input.description ?? "",
        createdAt: now,
        updatedAt: now,
      };
      const result = await ctx.db.collection("worlds").insertOne(doc);
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: protectedProcedure
    .input(z.object({ id: objectIdSchema, data: updateWorldSchema }))
    .mutation(async ({ ctx, input }) => {
      const updateFields: Record<string, any> = {
        updatedAt: new Date(),
      };
      const unsetFields: Record<string, ""> = {};
      if (input.data.name !== undefined) updateFields.name = input.data.name;
      if (input.data.description !== undefined) updateFields.description = input.data.description;
      if (input.data.enabledSkillIds === null) {
        unsetFields.enabledSkillIds = "";
      } else if (input.data.enabledSkillIds !== undefined) {
        updateFields.enabledSkillIds = input.data.enabledSkillIds.map((id) => new ObjectId(id));
      }

      const updateOps: Record<string, unknown> = { $set: updateFields };
      if (Object.keys(unsetFields).length > 0) updateOps.$unset = unsetFields;

      const result = await ctx.db
        .collection("worlds")
        .findOneAndUpdate(
          { _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) },
          updateOps,
          { returnDocument: "after" }
        );
      return serializeDoc(result);
    }),

  delete: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .collection("worlds")
        .deleteOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      return { success: true };
    }),
});
