import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { NovelAgentSession, getOrRefreshWorldSummary, resolveLocale } from "@ai-novel/agent";
import type { HistoryMessage, HistoryToolCall, VectorSearchFn, Locale } from "@ai-novel/agent";
import { getDb } from "../db.js";
import { getEmbeddingService } from "../services/embeddingService.js";
import { verifyToken, type JwtPayload } from "../auth/jwt.js";
import { getUserAllowedModels } from "../auth/permissionGroups.js";

// Store active sessions in memory (shared with router)
export const sessions = new Map<string, NovelAgentSession>();

// Model format: "provider:modelId" (e.g. "openai:gpt-4o", "anthropic:claude-sonnet-4-6-20250514")
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "openai:gpt-4o";
const AVAILABLE_MODELS = (process.env.AVAILABLE_MODELS || DEFAULT_MODEL)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function parseModelSpec(spec: string): { provider: string; modelId: string } {
  const idx = spec.indexOf(":");
  if (idx === -1) {
    // Legacy format: assume anthropic provider for bare model IDs
    return { provider: "anthropic", modelId: spec };
  }
  return { provider: spec.slice(0, idx), modelId: spec.slice(idx + 1) };
}

function extractUser(request: { headers: { authorization?: string } }): JwtPayload | null {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    return verifyToken(auth.slice(7));
  } catch {
    return null;
  }
}

export function registerAgentRoutes(fastify: FastifyInstance) {
  fastify.post("/api/agent/chat", async (request, reply) => {
    // Authenticate
    const user = extractUser(request);
    if (!user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const { projectId, worldId, message, sessionId: inputSessionId, model, locale: rawLocale, reasoning: rawReasoning } =
      request.body as {
        projectId: string;
        worldId?: string;
        message: string;
        sessionId?: string;
        model?: string;
        locale?: string;
        reasoning?: string;
      };
    const locale: Locale = resolveLocale(rawLocale);

    if (!message) {
      return reply.status(400).send({ error: "message is required" });
    }
    if (!projectId && !worldId) {
      return reply.status(400).send({ error: "projectId or worldId is required" });
    }

    const db = getDb();
    const sessionId = inputSessionId || crypto.randomUUID();
    const allowedModels = await getUserAllowedModels(db, user.userId, AVAILABLE_MODELS);

    if (allowedModels.length === 0) {
      return reply.status(403).send({ error: "AI access is disabled for your permission group" });
    }

    const selectedModel = model || allowedModels[0];

    // Validate model against user's permission group
    if (!allowedModels.includes(selectedModel)) {
      return reply.status(403).send({ error: "Model not allowed for your permission group" });
    }

    const { provider, modelId } = parseModelSpec(selectedModel);

    // Resolve API key and base URL per provider
    const providerEnvPrefix = provider.toUpperCase().replace(/-/g, "_");
    const apiKey = process.env[`${providerEnvPrefix}_API_KEY`]
      || process.env.LLM_API_KEY
      || "";
    const baseURL = process.env[`${providerEnvPrefix}_BASE_URL`] || undefined;

    // Resolve reasoning level: request > env var > undefined (let pi-ai decide)
    const VALID_REASONING = ["minimal", "low", "medium", "high", "xhigh"] as const;
    type ReasoningLevel = typeof VALID_REASONING[number];
    const reasoningRaw = rawReasoning || process.env.DEFAULT_REASONING || undefined;
    const reasoning = reasoningRaw && VALID_REASONING.includes(reasoningRaw as ReasoningLevel)
      ? (reasoningRaw as ReasoningLevel)
      : undefined;

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
      const embeddingSvc = getEmbeddingService();
      session = new NovelAgentSession({
        apiKey,
        provider,
        modelId,
        baseURL,
        reasoning,
        db,
        projectId,
        worldId,
        userId: user.userId,
        vectorSearchFn,
        onDocumentChanged: embeddingSvc
          ? (collection, id) => embeddingSvc.enqueue(collection, id)
          : undefined,
        onWorldSummaryStale: (wId) => {
          db.collection("worlds").updateOne(
            { _id: new ObjectId(wId) },
            { $set: { summaryStale: true } }
          ).catch((err) => console.error("[WorldSummary] Failed to mark stale:", err));
        },
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
      userId: user.userId,
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

    // Get world summary
    let worldSummary: string | undefined;
    if (worldId) {
      try {
        worldSummary = await getOrRefreshWorldSummary(db, worldId, locale);
      } catch (err) {
        console.error("[WorldSummary] Failed to get summary:", err);
      }
    }

    // Stream agent events
    const allEvents: any[] = [];
    let fullText = "";

    try {
      for await (const event of session.chat(message, history, memoryContent, worldSummary, locale)) {
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
      userId: user.userId,
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
          model: selectedModel,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          sessionId,
          userId: user.userId,
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
