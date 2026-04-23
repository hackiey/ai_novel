import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { CreatorAgentSession, parseModelSpec, resolveLocale } from "@ai-creator/agent";
import type { VectorSearchFn, Locale } from "@ai-creator/agent";
import { getDb } from "../db.js";
import { getEmbeddingService } from "../services/embeddingService.js";
import { verifyToken, type JwtPayload } from "../auth/jwt.js";
import { getUserAllowedModels } from "../auth/permissionGroups.js";
import { resolveEnabledSkillSlugs } from "../utils/enabledSkills.js";

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

interface RecentMessage {
  role: "user" | "assistant";
  content: string;
}

export function registerRecommendSkillsRoutes(fastify: FastifyInstance) {
  fastify.post("/api/agent/recommend-skills", async (request, reply) => {
    const user = extractUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    const {
      projectId,
      worldId,
      recentMessages,
      customQuery,
      model,
      locale: rawLocale,
      apiKey: userApiKey,
      baseURL: userBaseURL,
    } = request.body as {
      projectId: string;
      worldId?: string;
      recentMessages?: RecentMessage[];
      customQuery?: string;
      model?: string;
      locale?: string;
      apiKey?: string;
      baseURL?: string;
    };

    if (!projectId) return reply.status(400).send({ error: "projectId is required" });
    if (!recentMessages?.length && !customQuery) {
      return reply.status(400).send({ error: "recentMessages or customQuery is required" });
    }

    const locale: Locale = resolveLocale(rawLocale);
    const isBYOK = !!userApiKey;
    const db = getDb();

    // Fetch project to validate ownership and read currently enabled skills
    const projectDoc = await db.collection("projects").findOne(
      { _id: new ObjectId(projectId), userId: user.userId },
      { projection: { enabledSkillSlugs: 1 } },
    );
    if (!projectDoc) return reply.status(404).send({ error: "Project not found" });

    let selectedModel: string;
    if (isBYOK) {
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
    const provider = parsed.provider === "custom" ? "openai" : parsed.provider;
    const modelId = parsed.modelId;
    const modelReasoning = parsed.reasoning;

    let apiKey: string;
    let baseURL: string | undefined;
    if (isBYOK) {
      apiKey = userApiKey;
      baseURL = userBaseURL || undefined;
    } else {
      const providerEnvPrefix = provider.toUpperCase().replace(/-/g, "_");
      apiKey = process.env[`${providerEnvPrefix}_API_KEY`] || process.env.LLM_API_KEY || "";
      baseURL = process.env[`${providerEnvPrefix}_BASE_URL`] || undefined;
    }

    const defaultReasoningRaw = process.env.DEFAULT_REASONING;
    const defaultReasoning = defaultReasoningRaw && VALID_REASONING.includes(defaultReasoningRaw as ReasoningLevel)
      ? (defaultReasoningRaw as ReasoningLevel)
      : undefined;
    const reasoning = modelReasoning ?? defaultReasoning;

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

    // Build the synthetic user prompt: either recent transcript or a one-off query
    const enabledSlugs: string[] = resolveEnabledSkillSlugs(projectDoc);

    const enabledLine = locale === "zh"
      ? `已启用 Skill（不要再推荐这些 slug）：${enabledSlugs.length ? enabledSlugs.join(", ") : "（无）"}`
      : `Currently enabled skills (do NOT re-recommend these slugs): ${enabledSlugs.length ? enabledSlugs.join(", ") : "(none)"}`;

    let userPrompt: string;
    if (customQuery) {
      userPrompt = locale === "zh"
        ? `${enabledLine}\n\n用户描述：\n${customQuery}\n\n请基于以上需求推荐合适的 Skill。`
        : `${enabledLine}\n\nUser request:\n${customQuery}\n\nRecommend suitable skills based on the request above.`;
    } else {
      const transcript = (recentMessages ?? [])
        .slice(-6)
        .map((m) => `[${m.role}] ${m.content.slice(0, 800)}`)
        .join("\n\n");
      userPrompt = locale === "zh"
        ? `${enabledLine}\n\n最近对话：\n${transcript}\n\n请基于这段对话推荐 Skill。`
        : `${enabledLine}\n\nRecent conversation:\n${transcript}\n\nRecommend skills based on this conversation.`;
    }

    let session: CreatorAgentSession;
    try {
      session = new CreatorAgentSession({
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
        agentType: "skill-recommend",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: msg });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    try {
      for await (const event of session.chat(userPrompt, { locale })) {
        if (event.type === "messages") continue;
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      reply.raw.write(`data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`);
    } finally {
      session.close();
    }

    reply.raw.write(`data: [DONE]\n\n`);
    reply.raw.end();
  });
}
