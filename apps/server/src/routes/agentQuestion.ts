import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getDb } from "../db.js";
import { getQuestionManager } from "../services/questionService.js";
import { getSessionHub } from "../services/sessionEventHub.js";
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

  // Submit answers for a pending question. After resolving the QuestionManager
  // promise, the agent loop continues — its next events (the question's
  // tool_result and the assistant's continuation) are streamed back as SSE so
  // the UI keeps updating even when the original /chat connection is gone
  // (e.g. the user reloaded the page during the question).
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

    return streamResolution(request, reply, sessionId, () =>
      getQuestionManager().reply(callId, normalized, sessionId),
    );
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

    return streamResolution(request, reply, sessionId, () =>
      getQuestionManager().reject(callId, sessionId),
    );
  });
}

/**
 * Shared SSE pipeline for /reply and /reject. Subscribes to the session hub
 * BEFORE invoking the QuestionManager so we don't miss the tool_result that
 * the agent loop emits the instant the promise resolves.
 */
async function streamResolution(
  request: FastifyRequest,
  reply: FastifyReply,
  sessionId: string,
  resolveQuestion: () => boolean,
): Promise<void> {
  const hub = getSessionHub(sessionId);

  // No live agent loop for this session: the question can't be resumed even
  // if it once existed. Return JSON so the client can surface the error.
  if (!hub) {
    const ok = resolveQuestion();
    if (!ok) {
      return reply.status(404).send({ error: "Question not found or already answered" });
    }
    return reply.send({ ok: true });
  }

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  let clientGone = false;
  request.raw.on("close", () => {
    clientGone = true;
  });
  const safeWrite = (payload: string) => {
    if (clientGone) return;
    try {
      reply.raw.write(payload);
    } catch {
      clientGone = true;
    }
  };

  const unsubscribe = hub.subscribe((event) => {
    if (event.type === "_done") return; // handled via waitForTermination
    safeWrite(`data: ${JSON.stringify(event)}\n\n`);
  });

  const ok = resolveQuestion();
  if (!ok) {
    safeWrite(`data: ${JSON.stringify({ type: "error", error: "Question not found or already answered" })}\n\n`);
    safeWrite(`data: [DONE]\n\n`);
    unsubscribe();
    if (!clientGone) {
      try { reply.raw.end(); } catch { /* socket already gone */ }
    }
    return;
  }

  await hub.waitForTermination();
  unsubscribe();
  safeWrite(`data: [DONE]\n\n`);
  if (!clientGone) {
    try { reply.raw.end(); } catch { /* socket already gone */ }
  }
}
