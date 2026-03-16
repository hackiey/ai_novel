import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { NovelAgentSession } from "@ai-novel/agent";
import type { HistoryMessage, HistoryToolCall, VectorSearchFn } from "@ai-novel/agent";
import { getDb } from "../db.js";
import { getEmbeddingService } from "../services/embeddingService.js";

// Store active sessions in memory (shared with router)
export const sessions = new Map<string, NovelAgentSession>();

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "claude-sonnet-4-6-20250514";

export function registerAgentRoutes(fastify: FastifyInstance) {
  fastify.post("/api/agent/chat", async (request, reply) => {
    const { projectId, worldId, message, sessionId: inputSessionId, model } =
      request.body as {
        projectId: string;
        worldId?: string;
        message: string;
        sessionId?: string;
        model?: string;
      };

    if (!message) {
      return reply.status(400).send({ error: "message is required" });
    }
    if (!projectId && !worldId) {
      return reply.status(400).send({ error: "projectId or worldId is required" });
    }

    const db = getDb();
    const sessionId = inputSessionId || crypto.randomUUID();

    // Build vector search function if embedding service is available
    const embeddingService = getEmbeddingService();
    let vectorSearchFn: VectorSearchFn | undefined;
    if (embeddingService) {
      vectorSearchFn = async (args) => {
        const results = await embeddingService.vectorSearch(
          { projectId: args.projectId, worldId: args.worldId },
          args.query,
          { scope: args.scope, limit: args.limit }
        );
        return { results, total: results.length };
      };
    }

    // Get or create agent session
    let session = sessions.get(sessionId);
    if (!session) {
      session = new NovelAgentSession({
        apiKey: process.env.ANTHROPIC_API_KEY || "",
        baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
        model: model || DEFAULT_MODEL,
        db,
        projectId,
        worldId,
        vectorSearchFn,
      });
      sessions.set(sessionId, session);
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send sessionId as first event
    reply.raw.write(`data: ${JSON.stringify({ type: "session", sessionId })}\n\n`);

    // Save user message to DB
    const now = new Date();
    await db.collection("agent_messages").insertOne({
      sessionId,
      role: "user",
      content: message,
      createdAt: now,
    });

    // Load conversation history from DB (exclude the message we just inserted)
    const historyDocs = await db
      .collection("agent_messages")
      .find({ sessionId, createdAt: { $lt: now } })
      .sort({ createdAt: 1 })
      .toArray();

    const history: HistoryMessage[] = historyDocs.map((doc) => {
      const msg: HistoryMessage = {
        role: doc.role as "user" | "assistant",
        content: (doc.content as string) || "",
      };
      // Extract tool calls from stored events for assistant messages
      if (doc.role === "assistant" && Array.isArray(doc.events)) {
        const toolCalls: HistoryToolCall[] = doc.events
          .filter((e: any) => e.type === "tool_use" && e.toolName)
          .map((e: any) => ({ toolName: e.toolName, toolInput: e.toolInput }));
        if (toolCalls.length > 0) {
          msg.toolCalls = toolCalls;
        }
      }
      return msg;
    });

    // Load agent memory for this world
    let memoryContent: string | undefined;
    if (worldId) {
      const memoryDoc = await db.collection("agent_memory").findOne({ worldId: new ObjectId(worldId) });
      if (memoryDoc?.content) {
        memoryContent = memoryDoc.content as string;
      }
    }

    // Stream agent events
    const allEvents: any[] = [];
    let fullText = "";

    try {
      for await (const event of session.chat(message, history, memoryContent)) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        allEvents.push(event);

        if (event.type === "text") {
          fullText += event.text;
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      reply.raw.write(`data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`);
    }

    // Save assistant message to DB
    await db.collection("agent_messages").insertOne({
      sessionId,
      role: "assistant",
      content: fullText,
      events: allEvents,
      createdAt: new Date(),
    });

    // Create or update session document
    const title = message.slice(0, 30) + (message.length > 30 ? "..." : "");
    await db.collection("agent_sessions").updateOne(
      { sessionId },
      {
        $set: {
          worldId: worldId || "",
          model: model || DEFAULT_MODEL,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          sessionId,
          title,
          createdAt: now,
        },
      },
      { upsert: true },
    );

    // Send done signal and end
    reply.raw.write(`data: [DONE]\n\n`);
    reply.raw.end();
  });
}
