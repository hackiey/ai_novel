import crypto from "crypto";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { createShareSchema, updateShareSchema, objectIdSchema } from "@ai-creator/types";
import { router, publicProcedure, protectedProcedure, userIdFilter } from "../trpc.js";
import { TRPCError } from "@trpc/server";

function serializeDoc(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { _id: _id.toHexString(), ...rest };
}

function generateShareToken(): string {
  return crypto.randomBytes(9).toString("base64url");
}

export const shareRouter = router({
  create: protectedProcedure
    .input(createShareSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify project ownership
      const project = await ctx.db
        .collection("projects")
        .findOne({ _id: new ObjectId(input.projectId), userId: userIdFilter(ctx.user.userId) });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      // Check if share already exists for this project
      const existing = await ctx.db
        .collection("shares")
        .findOne({ projectId: input.projectId, userId: userIdFilter(ctx.user.userId) });
      if (existing) {
        return serializeDoc(existing);
      }

      // Default to all chapters if not specified
      let includedChapterIds = input.includedChapterIds;
      if (!includedChapterIds) {
        const chapters = await ctx.db
          .collection("chapters")
          .find({ projectId: { $in: [input.projectId, new ObjectId(input.projectId)] }, userId: userIdFilter(ctx.user.userId) })
          .project({ _id: 1 })
          .toArray();
        includedChapterIds = chapters.map((c) => c._id.toHexString());
      }

      const now = new Date();
      const doc = {
        userId: ctx.user.userId,
        projectId: input.projectId,
        shareToken: generateShareToken(),
        includedChapterIds,
        theme: input.theme ?? "starfield",
        font: input.font ?? "default",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      const result = await ctx.db.collection("shares").insertOne(doc);
      return serializeDoc({ _id: result.insertedId, ...doc });
    }),

  update: protectedProcedure
    .input(z.object({ id: objectIdSchema, data: updateShareSchema }))
    .mutation(async ({ ctx, input }) => {
      const updateFields: Record<string, any> = { updatedAt: new Date() };
      if (input.data.includedChapterIds !== undefined) updateFields.includedChapterIds = input.data.includedChapterIds;
      if (input.data.theme !== undefined) updateFields.theme = input.data.theme;
      if (input.data.font !== undefined) updateFields.font = input.data.font;
      if (input.data.isActive !== undefined) updateFields.isActive = input.data.isActive;

      const result = await ctx.db
        .collection("shares")
        .findOneAndUpdate(
          { _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) },
          { $set: updateFields },
          { returnDocument: "after" },
        );
      return serializeDoc(result);
    }),

  delete: protectedProcedure
    .input(z.object({ id: objectIdSchema }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .collection("shares")
        .deleteOne({ _id: new ObjectId(input.id), userId: userIdFilter(ctx.user.userId) });
      return { success: true };
    }),

  getByProject: protectedProcedure
    .input(z.object({ projectId: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db
        .collection("shares")
        .findOne({ projectId: input.projectId, userId: userIdFilter(ctx.user.userId) });
      return serializeDoc(doc);
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const shares = await ctx.db
      .collection("shares")
      .find({ userId: userIdFilter(ctx.user.userId) })
      .sort({ updatedAt: -1 })
      .toArray();

    if (shares.length === 0) return [];

    // Fetch project names
    const projectIds = [...new Set(shares.map((s) => s.projectId))];
    const projects = await ctx.db
      .collection("projects")
      .find({ _id: { $in: projectIds.map((id: string) => new ObjectId(id)) } })
      .project({ _id: 1, name: 1 })
      .toArray();
    const projectMap = new Map(projects.map((p) => [p._id.toHexString(), p.name]));

    // Count total chapters per project
    const chapterCounts = await ctx.db
      .collection("chapters")
      .aggregate([
        { $match: { projectId: { $in: projectIds } } },
        { $group: { _id: "$projectId", count: { $sum: 1 } } },
      ])
      .toArray();
    const chapterCountMap = new Map(chapterCounts.map((c) => [c._id, c.count]));

    return shares.map((s) => ({
      ...serializeDoc(s),
      projectName: projectMap.get(s.projectId) ?? "",
      totalChapterCount: chapterCountMap.get(s.projectId) ?? 0,
    }));
  }),

  getPublic: publicProcedure
    .input(z.object({ shareToken: z.string() }))
    .query(async ({ ctx, input }) => {
      const share = await ctx.db
        .collection("shares")
        .findOne({ shareToken: input.shareToken, isActive: true });
      if (!share) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Share not found" });
      }

      const project = await ctx.db
        .collection("projects")
        .findOne({ _id: new ObjectId(share.projectId) });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      // Fetch only included chapters
      const chapterObjectIds = share.includedChapterIds.map((id: string) => new ObjectId(id));
      const chapters = await ctx.db
        .collection("chapters")
        .find({ _id: { $in: chapterObjectIds } })
        .project({ _id: 1, title: 1, order: 1, content: 1, wordCount: 1 })
        .sort({ order: 1 })
        .toArray();

      return {
        share: {
          theme: share.theme,
          font: share.font,
        },
        project: {
          name: project.name,
          description: project.description ?? "",
        },
        chapters: chapters.map((c) => ({
          _id: c._id.toHexString(),
          title: c.title,
          order: c.order,
          content: c.content,
          wordCount: c.wordCount ?? 0,
        })),
      };
    }),
});
