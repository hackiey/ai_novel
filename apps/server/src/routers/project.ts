import { z } from "zod";
import { ObjectId } from "mongodb";
import { createProjectSchema, updateProjectSchema, objectIdSchema } from "@ai-creator/types";
import { router, protectedProcedure, userIdFilter } from "../trpc.js";
import { resolveEnabledSkillSlugs } from "../utils/enabledSkills.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

/**
 * Same as serializeDoc, but also normalizes the legacy `enabledSkillIds: ObjectId[]`
 * field to the new `enabledSkillSlugs: string[]` for the wire response. Lazy
 * translation only — the DB document is not rewritten until the user next saves.
 */
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
      return serializeDocWithSlugs(ctx.db, doc);
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
        // New projects start with no enabled skills and rely on the dedicated
        // recommend agent (gated by the "Skills 推荐" checkbox stored client-side)
        // to suggest some. Legacy projects without this field load all skills.
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
      const unsetFields: Record<string, ""> = {};
      if (input.data.name !== undefined) updateFields.name = input.data.name;
      if (input.data.description !== undefined) updateFields.description = input.data.description;
      if (input.data.settings !== undefined) updateFields.settings = input.data.settings;
      if (input.data.worldId !== undefined) updateFields.worldId = input.data.worldId;
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
        .collection("projects")
        .findOneAndUpdate(
          { _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) },
          updateOps,
          { returnDocument: "after" }
        );
      return serializeDoc(result);
    }),

  // Append skill slugs to a project's enabledSkillSlugs, dedup. Refuses to mutate a
  // legacy project where neither enabledSkillSlugs nor enabledSkillIds exists (that
  // means "all enabled"; appending would silently downgrade to "only these few").
  // Legacy ObjectId-based docs are migrated to slugs on the fly.
  addEnabledSkills: protectedProcedure
    .input(z.object({ id: objectIdSchema, skillSlugs: z.array(z.string().min(1)).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const projectFilter = { _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) };
      const project = await ctx.db.collection("projects").findOne(projectFilter);
      if (!project) throw new Error("Project not found");

      const hasNew = Array.isArray(project.enabledSkillSlugs);
      const hasLegacy = Array.isArray(project.enabledSkillIds);
      if (!hasNew && !hasLegacy) {
        throw new Error("Cannot append skills to a project with all skills enabled. Use the skill settings dialog to switch to custom mode first.");
      }

      // Resolve current slug set, translating legacy ObjectIds if needed.
      const existing = await resolveEnabledSkillSlugs(ctx.db, project) ?? [];
      const merged = Array.from(new Set([...existing, ...input.skillSlugs]));

      const result = await ctx.db.collection("projects").findOneAndUpdate(
        projectFilter,
        {
          $set: { enabledSkillSlugs: merged, updatedAt: new Date() },
          $unset: { enabledSkillIds: "" }, // migrate legacy field if present
        },
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
