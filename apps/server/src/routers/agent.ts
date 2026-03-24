import { z } from "zod";
import { ObjectId } from "mongodb";
import { router, protectedProcedure, userIdFilter } from "../trpc.js";
import { objectIdSchema } from "@ai-novel/types";
import { sessions } from "../routes/agentStream.js";
import { getUserAllowedModels } from "../auth/permissionGroups.js";

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "claude-sonnet-4-6-20250514";
const AVAILABLE_MODELS = (process.env.AVAILABLE_MODELS || DEFAULT_MODEL)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export const agentRouter = router({
  getModels: protectedProcedure.query(async ({ ctx }) => {
    const allowed = await getUserAllowedModels(ctx.db, ctx.user.userId, AVAILABLE_MODELS);
    return { available: allowed, default: allowed[0] };
  }),

  listSessions: protectedProcedure
    .input(z.object({ worldId: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const docs = await ctx.db
        .collection("agent_sessions")
        .find({ worldId: input.worldId, userId: userIdFilter(ctx.user.userId) })
        .sort({ updatedAt: -1 })
        .toArray();
      return docs.map((doc) => {
        const { _id, ...rest } = doc;
        return { _id: _id.toHexString(), ...rest };
      });
    }),

  getHistory: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify session belongs to user
      const session = await ctx.db.collection("agent_sessions").findOne({
        sessionId: input.sessionId,
        userId: userIdFilter(ctx.user.userId),
      });
      if (!session) return [];

      const docs = await ctx.db
        .collection("agent_messages")
        .find({ sessionId: input.sessionId })
        .sort({ createdAt: 1 })
        .toArray();
      return docs.map((doc) => {
        const { _id, ...rest } = doc;
        return { _id: _id.toHexString(), ...rest };
      });
    }),

  truncateMessages: protectedProcedure
    .input(z.object({ sessionId: z.string(), afterCreatedAt: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify session belongs to user
      const session = await ctx.db.collection("agent_sessions").findOne({
        sessionId: input.sessionId,
        userId: userIdFilter(ctx.user.userId),
      });
      if (!session) throw new Error("Session not found");

      // Delete messages with createdAt >= afterCreatedAt
      await ctx.db.collection("agent_messages").deleteMany({
        sessionId: input.sessionId,
        createdAt: { $gte: new Date(input.afterCreatedAt) },
      });

      // Clear cached agent session since history changed
      const cached = sessions.get(input.sessionId);
      if (cached) {
        cached.close();
        sessions.delete(input.sessionId);
      }

      return { success: true };
    }),

  getMemory: protectedProcedure
    .input(z.object({
      worldId: objectIdSchema.optional(),
      projectId: objectIdSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      const result: { worldMemory?: string; projectMemory?: string } = {};
      if (input.worldId) {
        const doc = await ctx.db.collection("agent_memory").findOne({ worldId: new ObjectId(input.worldId) });
        if (doc?.content) result.worldMemory = doc.content as string;
      }
      if (input.projectId) {
        const doc = await ctx.db.collection("agent_memory").findOne({ projectId: new ObjectId(input.projectId) });
        if (doc?.content) result.projectMemory = doc.content as string;
      }
      return result;
    }),

  updateMemory: protectedProcedure
    .input(z.object({
      scope: z.enum(["world", "project"]),
      worldId: objectIdSchema.optional(),
      projectId: objectIdSchema.optional(),
      content: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      if (input.scope === "project" && input.projectId) {
        await ctx.db.collection("agent_memory").updateOne(
          { projectId: new ObjectId(input.projectId) },
          { $set: { content: input.content, updatedAt: now } },
          { upsert: true },
        );
      } else if (input.scope === "world" && input.worldId) {
        await ctx.db.collection("agent_memory").updateOne(
          { worldId: new ObjectId(input.worldId) },
          { $set: { content: input.content, updatedAt: now } },
          { upsert: true },
        );
      } else {
        throw new Error("Invalid scope or missing ID");
      }
      return { success: true };
    }),

  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = sessions.get(input.sessionId);
      if (session) {
        session.close();
        sessions.delete(input.sessionId);
      }
      await ctx.db.collection("agent_sessions").deleteOne({ sessionId: input.sessionId, userId: userIdFilter(ctx.user.userId) });
      await ctx.db.collection("agent_messages").deleteMany({ sessionId: input.sessionId });
      return { success: true };
    }),
});
