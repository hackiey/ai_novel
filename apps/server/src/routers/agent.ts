import { z } from "zod";
import { ObjectId } from "mongodb";
import { router, protectedProcedure } from "../trpc.js";
import { objectIdSchema } from "@ai-novel/types";
import { sessions } from "../routes/agentStream.js";

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "claude-sonnet-4-6-20250514";
const AVAILABLE_MODELS = (process.env.AVAILABLE_MODELS || DEFAULT_MODEL)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export const agentRouter = router({
  getModels: protectedProcedure.query(async ({ ctx }) => {
    // Filter models by user's permission group
    const user = await ctx.db.collection("users").findOne({ _id: new ObjectId(ctx.user.userId) });
    if (user?.permissionGroupId) {
      const group = await ctx.db.collection("permission_groups").findOne({
        _id: new ObjectId(user.permissionGroupId as string),
      });
      if (group?.allowedModels && (group.allowedModels as string[]).length > 0) {
        const allowed = AVAILABLE_MODELS.filter((m) => (group.allowedModels as string[]).includes(m));
        return { available: allowed.length > 0 ? allowed : AVAILABLE_MODELS, default: allowed[0] || DEFAULT_MODEL };
      }
    }
    return { available: AVAILABLE_MODELS, default: DEFAULT_MODEL };
  }),

  listSessions: protectedProcedure
    .input(z.object({ worldId: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const docs = await ctx.db
        .collection("agent_sessions")
        .find({ worldId: input.worldId, userId: ctx.user.userId })
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
        userId: ctx.user.userId,
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
        userId: ctx.user.userId,
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

  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = sessions.get(input.sessionId);
      if (session) {
        session.close();
        sessions.delete(input.sessionId);
      }
      await ctx.db.collection("agent_sessions").deleteOne({ sessionId: input.sessionId, userId: ctx.user.userId });
      await ctx.db.collection("agent_messages").deleteMany({ sessionId: input.sessionId });
      return { success: true };
    }),
});
