import { z } from "zod";
import { ObjectId } from "mongodb";
import { createWorldSchema, updateWorldSchema, objectIdSchema } from "@ai-creator/types";
import { router, protectedProcedure, userIdFilter } from "../trpc.js";
import { resolveEnabledSkillSlugs } from "../utils/enabledSkills.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

async function serializeDocWithSlugs(db: any, doc: any) {
  if (!doc) return null;
  if (doc.enabledSkillSlugs === undefined && Array.isArray(doc.enabledSkillIds)) {
    const slugs = await resolveEnabledSkillSlugs(db, doc);
    if (slugs !== undefined) {
      const { enabledSkillIds: _drop, ...rest } = doc;
      return serializeDoc({ ...rest, enabledSkillSlugs: slugs });
    }
  }
  return serializeDoc(doc);
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
      return serializeDocWithSlugs(ctx.db, doc);
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
      if (input.data.enabledSkillSlugs === null) {
        unsetFields.enabledSkillSlugs = "";
        unsetFields.enabledSkillIds = ""; // also drop legacy field if present
      } else if (input.data.enabledSkillSlugs !== undefined) {
        updateFields.enabledSkillSlugs = input.data.enabledSkillSlugs;
        unsetFields.enabledSkillIds = ""; // migrate away from legacy ObjectId field
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
