import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { CreatorAgentSession, getOrRefreshWorldSummary, parseModelSpec, resolveLocale } from "@ai-creator/agent";
import type { VectorSearchFn, Locale, Message, SkillData } from "@ai-creator/agent";
import { getDb } from "../db.js";
import { getEmbeddingService } from "../services/embeddingService.js";
import { resolveEnabledSkillSlugs } from "../utils/enabledSkills.js";
import { getStoredCompactionState, getUsageStateFromEvents, maybeCompactHistory } from "../services/agentCompactionService.js";
import { verifyToken, type JwtPayload } from "../auth/jwt.js";
import { getUserAllowedModels } from "../auth/permissionGroups.js";

// Store active sessions in memory (shared with router)
export const sessions = new Map<string, CreatorAgentSession>();
// Track key mode per session to detect BYOK↔server switches
export const sessionKeyMode = new Map<string, string>();

// Model format: "provider:modelId" (e.g. "openai:gpt-4o", "anthropic:claude-sonnet-4-6-20250514")
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "openai:gpt-4o";
const AVAILABLE_MODELS = (process.env.AVAILABLE_MODELS || DEFAULT_MODEL)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const VALID_REASONING = ["minimal", "low", "medium", "high", "xhigh"] as const;
type ReasoningLevel = typeof VALID_REASONING[number];

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

    // SECURITY: userApiKey is never logged, persisted, or included in DB records
    const { projectId, worldId, message, sessionId: inputSessionId, model, locale: rawLocale, currentChapterId,
            apiKey: userApiKey, baseURL: userBaseURL, compactionThreshold: rawCompactionThreshold,
            contextWindow: rawContextWindow } =
      request.body as {
        projectId: string;
        worldId?: string;
        message: string;
        sessionId?: string;
        model?: string;
        locale?: string;
        currentChapterId?: string;
        apiKey?: string;
        baseURL?: string;
        compactionThreshold?: number;
        contextWindow?: number;
      };
    const compactionThreshold = typeof rawCompactionThreshold === "number" && rawCompactionThreshold > 0
      ? Math.floor(rawCompactionThreshold)
      : undefined;
    const isBYOK = !!userApiKey;
    const locale: Locale = resolveLocale(rawLocale);

    if (!message) {
      return reply.status(400).send({ error: "message is required" });
    }
    if (!projectId && !worldId) {
      return reply.status(400).send({ error: "projectId or worldId is required" });
    }

    const db = getDb();
    const sessionId = inputSessionId || crypto.randomUUID();

    let selectedModel: string;
    if (isBYOK) {
      // BYOK: user provides their own key, skip permission group check
      selectedModel = model || AVAILABLE_MODELS[0] || "openai:gpt-4o";
    } else {
      const allowedModels = await getUserAllowedModels(db, user.userId, AVAILABLE_MODELS);
      if (allowedModels.length === 0) {
        return reply.status(403).send({ error: "AI access is disabled for your permission group" });
      }
      selectedModel = model || allowedModels[0];
      if (!allowedModels.includes(selectedModel)) {
        return reply.status(403).send({ error: "Model not allowed for your permission group" });
      }
    }

    const parsed = parseModelSpec(selectedModel);
    const modelReasoning = parsed.reasoning;
    const modelId = parsed.modelId;
    // "custom" provider maps to "openai" (OpenAI-compatible API with custom baseURL)
    const provider = parsed.provider === "custom" ? "openai" : parsed.provider;

    // Resolve API key and base URL: BYOK uses user-provided key, otherwise env vars
    let apiKey: string;
    let baseURL: string | undefined;
    if (isBYOK) {
      apiKey = userApiKey;
      baseURL = userBaseURL || undefined;
    } else {
      const providerEnvPrefix = provider.toUpperCase().replace(/-/g, "_");
      apiKey = process.env[`${providerEnvPrefix}_API_KEY`]
        || process.env.LLM_API_KEY
        || "";
      baseURL = process.env[`${providerEnvPrefix}_BASE_URL`] || undefined;
    }

    // Resolve reasoning level: model spec > env var > undefined (let pi-ai decide)
    const defaultReasoningRaw = process.env.DEFAULT_REASONING;
    const defaultReasoning = defaultReasoningRaw && VALID_REASONING.includes(defaultReasoningRaw as ReasoningLevel)
      ? (defaultReasoningRaw as ReasoningLevel)
      : undefined;
    const reasoning = modelReasoning ?? defaultReasoning;

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
    // BYOK: always recreate to pick up config changes (key, baseURL, model)
    const keyMode = isBYOK ? "byok" : "server";
    let session = sessions.get(sessionId);
    if (session && (isBYOK || sessionKeyMode.get(sessionId) !== keyMode)) {
      session.close();
      sessions.delete(sessionId);
      sessionKeyMode.delete(sessionId);
      session = undefined;
    }
    if (!session) {
      const embeddingSvc = getEmbeddingService();
      try {
        const userContextWindow = typeof rawContextWindow === "number" && rawContextWindow > 0
          ? Math.floor(rawContextWindow)
          : undefined;
        session = new CreatorAgentSession({
          apiKey,
          provider,
          modelId,
          baseURL,
          reasoning,
          contextWindow: userContextWindow,
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: msg });
      }
      sessions.set(sessionId, session);
      sessionKeyMode.set(sessionId, keyMode);
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

    const sessionDoc = await db.collection("agent_sessions").findOne({
      sessionId,
      userId: user.userId,
    });
    const storedCompaction = getStoredCompactionState(sessionDoc as Record<string, any> | null | undefined);

    // Save user message to DB
    const now = new Date();
    await db.collection("agent_messages").insertOne({
      sessionId,
      userId: user.userId,
      role: "user",
      content: message,
      createdAt: now,
    });

    // Load conversation history as structured Message[] from DB
    const historyFilter: Record<string, unknown> = { sessionId };
    historyFilter.createdAt = storedCompaction.cutoffCreatedAt
      ? { $gte: storedCompaction.cutoffCreatedAt, $lt: now }
      : { $lt: now };

    const historyDocs = await db
      .collection("agent_messages")
      .find(historyFilter)
      .sort({ createdAt: 1 })
      .toArray();

    // Load agent memory for this world
    let memoryContent: string | undefined;
    if (worldId) {
      const memoryDoc = await db.collection("agent_memory").findOne({ worldId: new ObjectId(worldId) });
      if (memoryDoc?.content) {
        memoryContent = memoryDoc.content as string;
      }
    }

    // Load project-level memory
    let projectMemoryContent: string | undefined;
    if (projectId) {
      const projectMemoryDoc = await db.collection("agent_memory").findOne({ projectId: new ObjectId(projectId) });
      if (projectMemoryDoc?.content) {
        projectMemoryContent = projectMemoryDoc.content as string;
      }
    }

    // Get world summary
    let worldSummary: string | undefined;
    if (worldId) {
      try {
        worldSummary = await getOrRefreshWorldSummary(db, worldId, locale, projectId);
      } catch (err) {
        console.error("[WorldSummary] Failed to get summary:", err);
      }
    }

    // Build working environment context
    let workingEnvironment: string | undefined;
    try {
      const envParts: string[] = [];

      if (projectId) {
        // Load chapter list for current project
        const chapters = await db.collection("chapters")
          .find({ projectId: { $in: [projectId, new ObjectId(projectId)] } })
          .sort({ order: 1 })
          .project({ _id: 1, title: 1, order: 1, wordCount: 1 })
          .toArray();

        if (chapters.length > 0) {
          const chapterLines = chapters.map((ch) => {
            const isCurrent = currentChapterId && ch._id.toHexString() === currentChapterId;
            const marker = isCurrent ? " ← 当前编辑" : "";
            return `- ${ch.title} (id: ${ch._id.toHexString()}, ${ch.wordCount ?? 0}字)${marker}`;
          });
          envParts.push(`章节列表:\n${chapterLines.join("\n")}`);
        }

        if (currentChapterId) {
          envParts.push(`用户当前正在编辑的章节ID: ${currentChapterId}`);
        }
      }

      if (envParts.length > 0) {
        workingEnvironment = envParts.join("\n\n");
      }
    } catch (err) {
      console.error("[WorkingEnvironment] Failed to build:", err);
    }

    // Resolve enabled skill slugs. Project scope wins when present; otherwise fall back
    // to world scope. The main agent never proposes new skills — that's the recommend
    // agent's job — so an empty list yields zero loaded skills.
    let allowedSlugs: string[] = [];
    if (projectId) {
      const projectDoc = await db.collection("projects").findOne(
        { _id: new ObjectId(projectId) },
        { projection: { enabledSkillSlugs: 1 } },
      );
      allowedSlugs = resolveEnabledSkillSlugs(projectDoc);
    } else if (worldId) {
      const worldDoc = await db.collection("worlds").findOne(
        { _id: new ObjectId(worldId) },
        { projection: { enabledSkillSlugs: 1 } },
      );
      allowedSlugs = resolveEnabledSkillSlugs(worldDoc);
    }

    const skillDocs = allowedSlugs.length === 0
      ? []
      : await db.collection("skills").find({
          slug: { $in: allowedSlugs },
          $or: [
            { isBuiltin: true },
            { isPublished: true },
            { authorId: user.userId },
          ],
        }).toArray();

    console.log(
      "[agentStream] skills loaded: %d (allowed=%d, projectId=%s)",
      skillDocs.length,
      allowedSlugs.length,
      projectId,
    );
    if (skillDocs.length > 0 && skillDocs.length <= 20) {
      console.log("[agentStream] skill slugs: %s", skillDocs.map((d) => d.slug).join(", "));
    }

    const skills: SkillData[] = skillDocs.map(doc => ({
      slug: doc.slug,
      name: doc.name,
      description: doc.description ?? "",
      content: doc.content ?? "",
    }));

    // Stream agent events
    const allEvents: any[] = [];
    let fullText = "";
    let turnMessages: Message[] = [];

    const compactionState = await maybeCompactHistory({
      db,
      sessionId,
      userId: user.userId,
      selectedModel,
      session,
      sessionDoc: sessionDoc as Record<string, any> | null | undefined,
      historyDocs,
      currentTurnCreatedAt: now,
      worldId,
      message,
      locale,
      compactionThreshold,
    });

    if (compactionState.compactionEvent) {
      reply.raw.write(`data: ${JSON.stringify(compactionState.compactionEvent)}\n\n`);
      allEvents.push(compactionState.compactionEvent);
    }

    try {
      for await (const event of session.chat(message, {
        historyMessages: compactionState.historyMessages,
        memory: memoryContent,
        worldSummary,
        locale,
        projectMemory: projectMemoryContent,
        workingEnvironment,
        conversationSummary: compactionState.conversationSummary,
        skills,
      })) {
        if (event.type === "messages") {
          // Capture structured messages but don't send to client
          turnMessages = event.messages;
          continue;
        }

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

    // Save assistant message to DB with structured messages for history replay
    await db.collection("agent_messages").insertOne({
      sessionId,
      userId: user.userId,
      role: "assistant",
      content: fullText,
      events: allEvents,
      messages: turnMessages,
      createdAt: new Date(),
    });

    const usageState = getUsageStateFromEvents(allEvents);

    // Create or update session document
    const title = message.slice(0, 30) + (message.length > 30 ? "..." : "");
    const sessionSetFields: Record<string, unknown> = {
      worldId: worldId || "",
      model: selectedModel,
      updatedAt: new Date(),
    };
    if (usageState) {
      const modelInfo = session.getModelInfo();
      sessionSetFields.usage = {
        ...usageState,
        contextWindow: modelInfo.contextWindow,
        maxTokens: modelInfo.maxTokens,
        inputLimit: modelInfo.inputLimit,
        modelContextWindow: modelInfo.contextWindow,
        updatedAt: new Date(),
      };
    }

    await db.collection("agent_sessions").updateOne(
      { sessionId },
      {
        $set: sessionSetFields,
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
