import type { FastifyInstance } from "fastify";
import { getDb } from "../db.js";
import { getQuestionManager } from "../services/questionService.js";
import { verifyToken, type JwtPayload } from "../auth/jwt.js";

function extractUser(request: { headers: { authorization?: string } }): JwtPayload | null {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    return verifyToken(auth.slice(7));
  } catch {
    return null;
  }
}

/**
 * Verify the requesting user owns the given chat sessionId by looking up the
 * agent_sessions document. Returns true if the user owns it OR if no session
 * doc has been persisted yet (first turn — only the in-memory session exists).
 * In the latter case, the QuestionManager's own sessionId guard provides the
 * remaining isolation.
 */
async function userOwnsSession(userId: string, sessionId: string): Promise<boolean> {
  const db = getDb();
  const doc = await db.collection("agent_sessions").findOne(
    { sessionId },
    { projection: { userId: 1 } },
  );
  if (!doc) return true;
  return String(doc.userId) === String(userId);
}

export function registerQuestionRoutes(fastify: FastifyInstance) {
  // List pending questions for a session (debugging / recovery on reload).
  fastify.get("/api/agent/question", async (request, reply) => {
    const user = extractUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    const { sessionId } = request.query as { sessionId?: string };
    if (!sessionId) return reply.status(400).send({ error: "sessionId is required" });

    if (!(await userOwnsSession(user.userId, sessionId))) {
      return reply.status(404).send({ error: "Session not found" });
    }

    const pending = getQuestionManager().list(sessionId);
    return reply.send({ pending });
  });

  // Submit answers for a pending question.
  fastify.post("/api/agent/question/:callId/reply", async (request, reply) => {
    const user = extractUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    const { callId } = request.params as { callId: string };
    const { sessionId, answers } = (request.body ?? {}) as {
      sessionId?: string;
      answers?: unknown;
    };

    if (!callId) return reply.status(400).send({ error: "callId is required" });
    if (!sessionId) return reply.status(400).send({ error: "sessionId is required" });
    if (!Array.isArray(answers)) {
      return reply.status(400).send({ error: "answers must be an array of string arrays" });
    }
    const normalized: string[][] = [];
    for (const a of answers) {
      if (!Array.isArray(a) || !a.every((s) => typeof s === "string")) {
        return reply.status(400).send({ error: "each answer must be an array of strings" });
      }
      normalized.push(a as string[]);
    }

    if (!(await userOwnsSession(user.userId, sessionId))) {
      return reply.status(404).send({ error: "Session not found" });
    }

    const ok = getQuestionManager().reply(callId, normalized, sessionId);
    if (!ok) return reply.status(404).send({ error: "Question not found or already answered" });
    return reply.send({ ok: true });
  });

  // Reject a pending question (user dismissed it).
  fastify.post("/api/agent/question/:callId/reject", async (request, reply) => {
    const user = extractUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    const { callId } = request.params as { callId: string };
    const { sessionId } = (request.body ?? {}) as { sessionId?: string };

    if (!callId) return reply.status(400).send({ error: "callId is required" });
    if (!sessionId) return reply.status(400).send({ error: "sessionId is required" });

    if (!(await userOwnsSession(user.userId, sessionId))) {
      return reply.status(404).send({ error: "Session not found" });
    }

    const ok = getQuestionManager().reject(callId, sessionId);
    if (!ok) return reply.status(404).send({ error: "Question not found or already answered" });
    return reply.send({ ok: true });
  });
}
