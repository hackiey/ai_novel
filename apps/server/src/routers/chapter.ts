import { z } from "zod";
import { ObjectId } from "mongodb";
import { createChapterSchema, updateChapterSchema, objectIdSchema } from "@ai-novel/types";
import { router, publicProcedure } from "../trpc.js";

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

export const chapterRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const docs = await ctx.db
        .collection("chapters")
        .find({ projectId: { $in: [input.projectId, new ObjectId(input.projectId)] } })
        .sort({ order: 1 })
        .toArray();
      return docs.map(serializeDoc);
    }),

  getById: publicProcedure
    .input(z.object({ id: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("chapters")
        .findOne({ _id: new ObjectId(input.id) });
      return serializeDoc(doc);
    }),

  create: publicProcedure
    .input(createChapterSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const content = input.content ?? "";
      const wordCount = countWords(content);

      let order = input.order;
      if (order === undefined || order === null) {
        // Auto-assign order: find the max order in the project and add 1
        const lastChapter = await ctx.db
          .collection("chapters")
          .find({ projectId: { $in: [input.projectId, new ObjectId(input.projectId)] } })
          .sort({ order: -1 })
          .limit(1)
          .toArray();
        order = lastChapter.length > 0 ? (lastChapter[0].order as number) + 1 : 0;
      }

      const doc = {
        projectId: new ObjectId(input.projectId),
        order,
        title: input.title,
        content,
        synopsis: input.synopsis ?? "",
        wordCount,
        status: input.status ?? "draft",
        createdAt: now,
        updatedAt: now,
      };
      const result = await ctx.db.collection("chapters").insertOne(doc);
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: publicProcedure
    .input(z.object({ id: objectIdSchema, data: updateChapterSchema }))
    .mutation(async ({ ctx, input }) => {
      const updateFields: Record<string, any> = {
        updatedAt: new Date(),
      };
      if (input.data.title !== undefined) updateFields.title = input.data.title;
      if (input.data.content !== undefined) {
        updateFields.content = input.data.content;
        updateFields.wordCount = countWords(input.data.content);
      }
      if (input.data.synopsis !== undefined) updateFields.synopsis = input.data.synopsis;
      if (input.data.status !== undefined) updateFields.status = input.data.status;
      if (input.data.order !== undefined) updateFields.order = input.data.order;

      const result = await ctx.db
        .collection("chapters")
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
        .collection("chapters")
        .deleteOne({ _id: new ObjectId(input.id) });
      return { success: true };
    }),

  reorder: publicProcedure
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
          filter: { _id: new ObjectId(item.id), projectId: { $in: [input.projectId, new ObjectId(input.projectId)] } },
          update: { $set: { order: item.order, updatedAt: now } },
        },
      }));

      if (bulkOps.length > 0) {
        await ctx.db.collection("chapters").bulkWrite(bulkOps);
      }

      // Return updated list sorted by order
      const docs = await ctx.db
        .collection("chapters")
        .find({ projectId: { $in: [input.projectId, new ObjectId(input.projectId)] } })
        .sort({ order: 1 })
        .toArray();
      return docs.map(serializeDoc);
    }),
});
