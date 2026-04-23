import { z } from "zod";
import { ObjectId } from "mongodb";
import { createProjectSchema, updateProjectSchema, objectIdSchema } from "@ai-creator/types";
import { router, protectedProcedure, userIdFilter } from "../trpc.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

export const projectRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const docs = await ctx.db
      .collection("projects")
      .find({ userId: userIdFilter(ctx.user.userId) })
      .sort({ updatedAt: -1 })
      .toArray();
    return docs.map(serializeDoc);
  }),

  getById: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("projects")
        .findOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      return serializeDoc(doc);
    }),

  create: protectedProcedure
    .input(createProjectSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const doc: Record<string, any> = {
        userId: ctx.user.userId,
        name: input.name,
        description: input.description ?? "",
        settings: {
          genre: input.settings?.genre ?? "",
          targetLength: input.settings?.targetLength,
        },
        // Start with no enabled skills; the recommend agent (gated by the
        // "Skills 推荐" checkbox) suggests an initial set on first chat.
        enabledSkillSlugs: [],
        createdAt: now,
        updatedAt: now,
      };
      if (input.worldId) doc.worldId = input.worldId;
      const result = await ctx.db.collection("projects").insertOne(doc);
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: protectedProcedure
    .input(z.object({ id: objectIdSchema, data: updateProjectSchema }))
    .mutation(async ({ ctx, input }) => {
      const updateFields: Record<string, any> = {
        updatedAt: new Date(),
      };
      if (input.data.name !== undefined) updateFields.name = input.data.name;
      if (input.data.description !== undefined) updateFields.description = input.data.description;
      if (input.data.settings !== undefined) updateFields.settings = input.data.settings;
      if (input.data.worldId !== undefined) updateFields.worldId = input.data.worldId;
      if (input.data.enabledSkillSlugs !== undefined && input.data.enabledSkillSlugs !== null) {
        updateFields.enabledSkillSlugs = input.data.enabledSkillSlugs;
      }

      const result = await ctx.db
        .collection("projects")
        .findOneAndUpdate(
          { _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) },
          { $set: updateFields },
          { returnDocument: "after" }
        );
      return serializeDoc(result);
    }),

  // Append skill slugs to a project's enabledSkillSlugs, dedup.
  addEnabledSkills: protectedProcedure
    .input(z.object({ id: objectIdSchema, skillSlugs: z.array(z.string().min(1)).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const projectFilter = { _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) };
      const project = await ctx.db.collection("projects").findOne(projectFilter);
      if (!project) throw new Error("Project not found");

      const existing = Array.isArray(project.enabledSkillSlugs)
        ? (project.enabledSkillSlugs as string[])
        : [];
      const merged = Array.from(new Set([...existing, ...input.skillSlugs]));

      const result = await ctx.db.collection("projects").findOneAndUpdate(
        projectFilter,
        { $set: { enabledSkillSlugs: merged, updatedAt: new Date() } },
        { returnDocument: "after" }
      );
      return serializeDoc(result);
    }),

  listByWorld: protectedProcedure
    .input(z.object({ worldId: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const docs = await ctx.db
        .collection("projects")
        .find({ worldId: { $in: [input.worldId, new ObjectId(input.worldId)] }, userId: userIdFilter(ctx.user.userId) })
        .sort({ updatedAt: -1 })
        .toArray();
      return docs.map(serializeDoc);
    }),

  delete: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .collection("projects")
        .deleteOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      return { success: true };
    }),
});
