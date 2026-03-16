import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { objectIdSchema } from "@ai-novel/types";
import { sessions } from "../routes/agentStream.js";

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "claude-sonnet-4-6-20250514";
const AVAILABLE_MODELS = (process.env.AVAILABLE_MODELS || DEFAULT_MODEL)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export const agentRouter = router({
  // Get available models
  getModels: publicProcedure.query(() => {
    return { available: AVAILABLE_MODELS, default: DEFAULT_MODEL };
  }),

  // List sessions for a world
  listSessions: publicProcedure
    .input(z.object({ worldId: objectIdSchema }))
    .query(async ({ ctx, input }) => {
      const docs = await ctx.db
        .collection("agent_sessions")
        .find({ worldId: input.worldId })
        .sort({ updatedAt: -1 })
        .toArray();
      return docs.map((doc) => {
        const { _id, ...rest } = doc;
        return { _id: _id.toHexString(), ...rest };
      });
    }),

  // Get message history for a session
  getHistory: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
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

  // Delete a session and its messages
  deleteSession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = sessions.get(input.sessionId);
      if (session) {
        session.close();
        sessions.delete(input.sessionId);
      }
      await ctx.db.collection("agent_sessions").deleteOne({ sessionId: input.sessionId });
      await ctx.db.collection("agent_messages").deleteMany({ sessionId: input.sessionId });
      return { success: true };
    }),
});
