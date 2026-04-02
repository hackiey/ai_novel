import { z } from "zod";
import { ObjectId, type Db } from "mongodb";
import { createChapterSchema, updateChapterSchema, objectIdSchema } from "@ai-creator/types";
import { computeChapterSynopsisSourceHash } from "@ai-creator/agent";
import { router, protectedProcedure, userIdFilter } from "../trpc.js";
import { getEmbeddingService } from "../services/embeddingService.js";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

function countWords(text: string): number {
  if (!text) return 0;
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
  const cjkCount = cjk ? cjk.length : 0;
  const stripped = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, " ");
  const words = stripped.split(/\s+/).filter(Boolean);
  return cjkCount + words.length;
}

function buildSynopsisCreateState(title: string, content: string, synopsisProvided: boolean, now: Date) {
  const sourceHash = computeChapterSynopsisSourceHash({ title, content });

  if (synopsisProvided || !content.trim()) {
    return {
      synopsisSourceHash: sourceHash,
      synopsisStatus: "ready" as const,
      synopsisUpdatedAt: now,
    };
  }

  return {
    synopsisStatus: "pending" as const,
  };
}

async function markDependentChapterSynopsesPending(
  db: Db,
  args: { projectId: string; userId: string; fromOrder?: number; excludeId?: string; all?: boolean },
): Promise<void> {
  const filter: Record<string, unknown> = {
    projectId: { $in: [args.projectId, new ObjectId(args.projectId)] },
    userId: userIdFilter(args.userId),
  };

  if (!args.all && args.fromOrder !== undefined) {
    filter.order = { $gte: args.fromOrder };
  }

  if (args.excludeId) {
    filter._id = { $ne: new ObjectId(args.excludeId) };
  }

  await db.collection("chapters").updateMany(
    filter,
    {
      $set: { synopsisStatus: "pending" },
      $unset: {
        synopsisJobLockedAt: "",
        synopsisJobToken: "",
        synopsisError: "",
      },
    },
  );
}

export const chapterRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const docs = await ctx.db
        .collection("chapters")
        .find({ projectId: { $in: [input.projectId, new ObjectId(input.projectId)] }, userId: userIdFilter(ctx.user.userId) })
        .sort({ order: 1 })
        .toArray();
      return docs.map(serializeDoc);
    }),

  getById: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("chapters")
        .findOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      return serializeDoc(doc);
    }),

  create: protectedProcedure
    .input(createChapterSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const content = input.content ?? "";
      const wordCount = countWords(content);

      let order = input.order;
      if (order === undefined || order === null) {
        const lastChapter = await ctx.db
          .collection("chapters")
          .find({ projectId: { $in: [input.projectId, new ObjectId(input.projectId)] } })
          .sort({ order: -1 })
          .limit(1)
          .toArray();
        order = lastChapter.length > 0 ? (lastChapter[0].order as number) + 1 : 0;
      }

      const doc = {
        userId: ctx.user.userId,
        projectId: new ObjectId(input.projectId),
        order,
        title: input.title,
        content,
        synopsis: input.synopsis ?? "",
        ...buildSynopsisCreateState(input.title, content, input.synopsis !== undefined, now),
        wordCount,
        status: input.status ?? "draft",
        createdAt: now,
        updatedAt: now,
      };
      const result = await ctx.db.collection("chapters").insertOne(doc);
      if (input.order !== undefined) {
        await markDependentChapterSynopsesPending(ctx.db, {
          projectId: input.projectId,
          userId: ctx.user.userId,
          fromOrder: order,
          excludeId: result.insertedId.toHexString(),
        });
      }
      getEmbeddingService()?.enqueue("chapters", result.insertedId.toHexString());
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: protectedProcedure
    .input(z.object({ id: objectIdSchema, data: updateChapterSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .collection("chapters")
        .findOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      if (!existing) return null;

      const existingTitle = typeof existing.title === "string" ? existing.title : "";
      const existingContent = typeof existing.content === "string" ? existing.content : "";
      const existingSynopsis = typeof existing.synopsis === "string" ? existing.synopsis : "";
      const existingOrder = typeof existing.order === "number" ? existing.order : 0;
      const nextTitle = input.data.title ?? existingTitle;
      const nextContent = input.data.content ?? existingContent;
      const nextSourceHash = computeChapterSynopsisSourceHash({ title: nextTitle, content: nextContent });
      const titleChanged = input.data.title !== undefined && input.data.title !== existingTitle;
      const contentChanged = input.data.content !== undefined && input.data.content !== existingContent;
      const synopsisChanged = input.data.synopsis !== undefined && input.data.synopsis !== existingSynopsis;
      const orderChanged = input.data.order !== undefined && input.data.order !== existingOrder;
      const updateFields: Record<string, any> = {
        updatedAt: new Date(),
      };
      const unsetFields: Record<string, ""> = {};

      if (input.data.title !== undefined) updateFields.title = input.data.title;
      if (input.data.content !== undefined) {
        updateFields.content = input.data.content;
        updateFields.wordCount = countWords(input.data.content);
      }

      if (titleChanged || contentChanged || orderChanged || synopsisChanged) {
        unsetFields.synopsisJobLockedAt = "";
        unsetFields.synopsisJobToken = "";
        unsetFields.synopsisError = "";
      }

      if (input.data.synopsis === undefined && (titleChanged || contentChanged || orderChanged)) {
        if (!nextContent.trim()) {
          updateFields.synopsis = "";
          updateFields.synopsisSourceHash = nextSourceHash;
          updateFields.synopsisStatus = "ready";
          updateFields.synopsisUpdatedAt = updateFields.updatedAt;
        } else {
          updateFields.synopsisStatus = "pending";
        }
      }

      if (input.data.synopsis !== undefined) {
        updateFields.synopsis = input.data.synopsis;
        updateFields.synopsisSourceHash = nextSourceHash;
        updateFields.synopsisStatus = "ready";
        updateFields.synopsisUpdatedAt = updateFields.updatedAt;
      }
      if (input.data.status !== undefined) updateFields.status = input.data.status;
      if (input.data.order !== undefined) updateFields.order = input.data.order;

      const result = await ctx.db
        .collection("chapters")
        .findOneAndUpdate(
          { _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) },
          Object.keys(unsetFields).length > 0
            ? { $set: updateFields, $unset: unsetFields }
            : { $set: updateFields },
          { returnDocument: "after" }
        );
      if (result) {
        const projectId = typeof existing.projectId === "string" ? existing.projectId : existing.projectId.toHexString();
        if (orderChanged) {
          await markDependentChapterSynopsesPending(ctx.db, {
            projectId,
            userId: ctx.user.userId,
            all: true,
            excludeId: input.id,
          });
        } else if (titleChanged || contentChanged || synopsisChanged) {
          await markDependentChapterSynopsesPending(ctx.db, {
            projectId,
            userId: ctx.user.userId,
            fromOrder: existingOrder,
            excludeId: input.id,
          });
        }
        getEmbeddingService()?.enqueue("chapters", input.id);
      }
      return serializeDoc(result);
    }),

  delete: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db
        .collection("chapters")
        .findOneAndDelete({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      if (deleted) {
        const projectId = typeof deleted.projectId === "string" ? deleted.projectId : deleted.projectId.toHexString();
        await markDependentChapterSynopsesPending(ctx.db, {
          projectId,
          userId: ctx.user.userId,
          fromOrder: typeof deleted.order === "number" ? deleted.order : 0,
        });
      }
      return { success: true };
    }),

  reorder: protectedProcedure
    .input(z.object({
      projectId: objectIdSchema,
      orders: z.array(z.object({
        id: objectIdSchema,
        order: z.number().int().nonnegative(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const bulkOps = input.orders.map((item) => ({
        updateOne: {
          filter: {
            _id: new ObjectId(item.id),
            projectId: { $in: [input.projectId, new ObjectId(input.projectId)] },
            userId: userIdFilter(ctx.user.userId),
          },
          update: { $set: { order: item.order, updatedAt: now } },
        },
      }));

      if (bulkOps.length > 0) {
        await ctx.db.collection("chapters").bulkWrite(bulkOps);
        await markDependentChapterSynopsesPending(ctx.db, {
          projectId: input.projectId,
          userId: ctx.user.userId,
          all: true,
        });
      }

      const docs = await ctx.db
        .collection("chapters")
        .find({ projectId: { $in: [input.projectId, new ObjectId(input.projectId)] }, userId: userIdFilter(ctx.user.userId) })
        .sort({ order: 1 })
        .toArray();
      return docs.map(serializeDoc);
    }),
});
