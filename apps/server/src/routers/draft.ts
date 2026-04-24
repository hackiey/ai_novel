import { z } from "zod";
import { ObjectId, Filter } from "mongodb";
import { createDraftSchema, updateDraftSchema, objectIdSchema } from "@ai-creator/types";
import { draftScopeFilter } from "@ai-creator/agent";
import { router, protectedProcedure, userIdFilter } from "../trpc.js";
import { getEmbeddingService } from "../services/embeddingService.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

export const draftRouter = router({
  list: protectedProcedure
    .input(z.object({
      projectId: objectIdSchema.optional(),
      worldId: objectIdSchema.optional(),
      // When true, return every draft under this world (world-level + every
      // project's drafts) — for the World page's DraftsTab. Otherwise apply
      // the chat-isolation view (world-level + current project only).
      includeAllProjectsUnderWorld: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userFilter = { userId: userIdFilter(ctx.user.userId) };

      let filter: Filter<any>;
      if (input.includeAllProjectsUnderWorld && input.worldId) {
        // Every draft (world-level + project-level) under this world.
        filter = {
          ...userFilter,
          worldId: { $in: [input.worldId, new ObjectId(input.worldId)] },
        };
      } else {
        filter = {
          ...userFilter,
          ...draftScopeFilter({ projectId: input.projectId, worldId: input.worldId }),
        };
      }

      const docs = await ctx.db
        .collection("drafts")
        .find(filter)
        .sort({ updatedAt: -1 })
        .toArray();
      return docs.map(serializeDoc);
    }),

  getById: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("drafts")
        .findOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      return serializeDoc(doc);
    }),

  create: protectedProcedure
    .input(createDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      // Resolve worldId: every draft must carry it. If only projectId is given,
      // derive worldId from the project.
      let worldIdHex = input.worldId;
      if (!worldIdHex && input.projectId) {
        const project = await ctx.db.collection("projects").findOne(
          { _id: new ObjectId(input.projectId), userId: userIdFilter(ctx.user.userId) },
          { projection: { worldId: 1 } } as any,
        );
        if (!project) {
          throw new Error(`Project not found: ${input.projectId}`);
        }
        if (!project.worldId) {
          throw new Error(`Project ${input.projectId} has no worldId — cannot create a draft under it.`);
        }
        worldIdHex = project.worldId instanceof ObjectId ? project.worldId.toHexString() : String(project.worldId);
      }
      if (!worldIdHex) {
        throw new Error("worldId or projectId is required");
      }

      const scope = input.scope ?? (input.projectId ? "project" : "world");
      // World-level drafts get an explicit projectId: null so Atlas Vector
      // Search can filter on it via $in: [<pid>, null] (the index can't
      // express $exists).
      const doc: Record<string, any> = {
        userId: ctx.user.userId,
        title: input.title,
        content: input.content ?? "",
        tags: input.tags ?? [],
        linkedCharacters: input.linkedCharacters ?? [],
        linkedWorldSettings: input.linkedWorldSettings ?? [],
        worldId: new ObjectId(worldIdHex),
        projectId: scope === "project" ? new ObjectId(input.projectId!) : null,
        createdAt: now,
        updatedAt: now,
      };
      if (scope === "project" && !input.projectId) {
        throw new Error("projectId is required when scope is 'project'");
      }
      const result = await ctx.db.collection("drafts").insertOne(doc);
      getEmbeddingService()?.enqueue("drafts", result.insertedId.toHexString());
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: protectedProcedure
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
          { _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) },
          { $set: updateFields },
          { returnDocument: "after" }
        );
      if (result) getEmbeddingService()?.enqueue("drafts", input.id);
      return serializeDoc(result);
    }),

  delete: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .collection("drafts")
        .deleteOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      return { success: true };
    }),
});
