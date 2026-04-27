import { z } from "zod";
import { ObjectId, Filter } from "mongodb";
import { createWorldSettingSchema, updateWorldSettingSchema, objectIdSchema } from "@ai-creator/types";
import { entityScopeFilter } from "@ai-creator/agent";
import { router, protectedProcedure, userIdFilter } from "../trpc.js";
import { getEmbeddingService } from "../services/embeddingService.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

export const worldSettingRouter = router({
  list: protectedProcedure
    .input(z.object({
      worldId: objectIdSchema,
      projectId: objectIdSchema.optional(),
      includeAllProjectsUnderWorld: z.boolean().optional(),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userFilter = { userId: userIdFilter(ctx.user.userId) };
      let filter: Filter<any>;
      if (input.includeAllProjectsUnderWorld && !input.projectId) {
        filter = { ...userFilter, worldId: { $in: [input.worldId, new ObjectId(input.worldId)] } };
      } else {
        filter = { ...userFilter, ...entityScopeFilter({ projectId: input.projectId, worldId: input.worldId }) };
      }
      if (input.category) {
        filter.category = input.category;
      }
      const docs = await ctx.db
        .collection("world_settings")
        .find(filter)
        .sort({ updatedAt: -1 })
        .toArray();
      const importanceOrder: Record<string, number> = { core: 0, major: 1, minor: 2 };
      docs.sort((a, b) => (importanceOrder[a.importance] ?? 2) - (importanceOrder[b.importance] ?? 2));
      return docs.map(serializeDoc);
    }),

  getById: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("world_settings")
        .findOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      return serializeDoc(doc);
    }),

  create: protectedProcedure
    .input(createWorldSettingSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();

      let worldIdHex = input.worldId;
      if (!worldIdHex && input.projectId) {
        const project = await ctx.db.collection("projects").findOne(
          { _id: new ObjectId(input.projectId), userId: userIdFilter(ctx.user.userId) },
          { projection: { worldId: 1 } } as any,
        );
        if (!project) throw new Error(`Project not found: ${input.projectId}`);
        if (!project.worldId) throw new Error(`Project ${input.projectId} has no worldId`);
        worldIdHex = project.worldId instanceof ObjectId ? project.worldId.toHexString() : String(project.worldId);
      }
      if (!worldIdHex) throw new Error("worldId or projectId is required");

      const scope = input.scope ?? (input.projectId ? "project" : "world");
      if (scope === "project" && !input.projectId) {
        throw new Error("projectId is required when scope is 'project'");
      }

      const doc = {
        userId: ctx.user.userId,
        worldId: new ObjectId(worldIdHex),
        projectId: scope === "project" ? new ObjectId(input.projectId!) : null,
        category: input.category,
        title: input.title,
        content: input.content ?? "",
        tags: input.tags ?? [],
        importance: input.importance ?? "minor",
        summary: input.summary ?? "",
        createdAt: now,
        updatedAt: now,
      };
      const result = await ctx.db.collection("world_settings").insertOne(doc);
      getEmbeddingService()?.enqueue("world_settings", result.insertedId.toHexString());
      await ctx.db.collection("worlds").updateOne(
        { _id: new ObjectId(worldIdHex) },
        { $set: { summaryStale: true } }
      );
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: protectedProcedure
    .input(z.object({ id: objectIdSchema, data: updateWorldSettingSchema }))
    .mutation(async ({ ctx, input }) => {
      const updateFields: Record<string, any> = {
        updatedAt: new Date(),
      };
      if (input.data.category !== undefined) updateFields.category = input.data.category;
      if (input.data.title !== undefined) updateFields.title = input.data.title;
      if (input.data.content !== undefined) updateFields.content = input.data.content;
      if (input.data.tags !== undefined) updateFields.tags = input.data.tags;
      if (input.data.importance !== undefined) updateFields.importance = input.data.importance;
      if (input.data.summary !== undefined) updateFields.summary = input.data.summary;
      if (input.data.projectId !== undefined) {
        updateFields.projectId = input.data.projectId === null ? null : new ObjectId(input.data.projectId);
      }

      const result = await ctx.db
        .collection("world_settings")
        .findOneAndUpdate(
          { _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) },
          { $set: updateFields },
          { returnDocument: "after" }
        );
      if (result) {
        getEmbeddingService()?.enqueue("world_settings", input.id);
        // Mark world summary as stale
        if (result.worldId) {
          await ctx.db.collection("worlds").updateOne(
            { _id: result.worldId instanceof ObjectId ? result.worldId : new ObjectId(result.worldId as string) },
            { $set: { summaryStale: true } }
          );
        }
      }
      return serializeDoc(result);
    }),

  delete: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.collection("world_settings").findOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      await ctx.db
        .collection("world_settings")
        .deleteOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      // Mark world summary as stale
      if (doc?.worldId) {
        await ctx.db.collection("worlds").updateOne(
          { _id: doc.worldId instanceof ObjectId ? doc.worldId : new ObjectId(doc.worldId as string) },
          { $set: { summaryStale: true } }
        );
      }
      return { success: true };
    }),
});
