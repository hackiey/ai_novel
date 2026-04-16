import { z } from "zod";
import { ObjectId } from "mongodb";
import { createSkillSchema, updateSkillSchema, objectIdSchema } from "@ai-creator/types";
import { router, protectedProcedure, adminProcedure, userIdFilter } from "../trpc.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

export const skillRouter = router({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const docs = await ctx.db
        .collection("skills")
        .find({
          $or: [
            { isBuiltin: true },
            { isPublished: true },
            { authorId: userIdFilter(ctx.user.userId) },
          ],
        })
        .sort({ isBuiltin: -1, updatedAt: -1 })
        .toArray();
      return docs.map(serializeDoc);
    }),

  getById: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("skills")
        .findOne({ _id: new ObjectId(input.id) });
      return serializeDoc(doc);
    }),

  create: protectedProcedure
    .input(createSkillSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const doc = {
        ...input,
        tags: input.tags ?? [],
        disableModelInvocation: input.disableModelInvocation ?? false,
        userInvocable: input.userInvocable ?? true,
        isBuiltin: false,
        isPublished: false,
        authorId: ctx.user.userId,
        createdAt: now,
        updatedAt: now,
      };
      const result = await ctx.db.collection("skills").insertOne(doc);
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: protectedProcedure
    .input(z.object({ id: objectIdSchema, data: updateSkillSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.collection("skills").findOne({
        _id: new ObjectId(input.id),
      });
      if (!existing) return null;

      // Only author or admin can update; builtin skills require admin
      if (existing.isBuiltin && ctx.user.role !== "admin") {
        return null;
      }
      if (!existing.isBuiltin && String(existing.authorId) !== ctx.user.userId && ctx.user.role !== "admin") {
        return null;
      }

      const result = await ctx.db
        .collection("skills")
        .findOneAndUpdate(
          { _id: new ObjectId(input.id) },
          { $set: { ...input.data, updatedAt: new Date() } },
          { returnDocument: "after" },
        );
      return serializeDoc(result);
    }),

  delete: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.collection("skills").findOne({
        _id: new ObjectId(input.id),
      });
      if (!existing) return { success: false };

      // Cannot delete builtin skills; only author or admin can delete
      if (existing.isBuiltin) return { success: false };
      if (String(existing.authorId) !== ctx.user.userId && ctx.user.role !== "admin") {
        return { success: false };
      }

      await ctx.db.collection("skills").deleteOne({ _id: new ObjectId(input.id) });
      return { success: true };
    }),
});
