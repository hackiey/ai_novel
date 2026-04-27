import "dotenv/config";
import { readFile } from "fs/promises";
import { resolve, basename } from "path";
import { CreatorAgentSession, parseModelSpec, resolveLocale, t } from "@ai-creator/agent";
import type { VectorSearchFn, Locale } from "@ai-creator/agent";
import { connectDb, disconnectDb, getDb } from "../db.js";
import { initEmbeddingService, getEmbeddingService } from "../services/embeddingService.js";
import {
  chunkText,
  fileToText,
  ALLOWED_EXTENSIONS,
  DEFAULT_CHUNK_SIZE_CHARS,
  DEFAULT_CHUNK_SIZE_WORDS,
} from "../utils/textChunking.js";

function parseArgs(argv: string[]): { filePath: string; model?: string; locale: string; fromChunk: number } {
  const args = argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: tsx extractSkills.ts <file-path> [--model provider:modelId] [--locale zh|en] [--from <chunkNumber>]");
    process.exit(1);
  }

  let filePath: string | undefined;
  let model: string | undefined;
  let locale = "zh";
  let fromChunk = 1;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--model") {
      model = args[++i];
    } else if (a === "--locale") {
      locale = args[++i];
    } else if (a === "--from" || a === "--resume-from") {
      const n = Number(args[++i]);
      if (!Number.isInteger(n) || n < 1) {
        console.error(`--from must be an integer >= 1, got: ${args[i]}`);
        process.exit(1);
      }
      fromChunk = n;
    } else if (!a.startsWith("--")) {
      filePath = a;
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(1);
    }
  }

  if (!filePath) {
    console.error("File path is required");
    process.exit(1);
  }

  return { filePath: resolve(filePath), model, locale, fromChunk };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { filePath, model, locale: rawLocale, fromChunk } = parseArgs(process.argv);
  const locale: Locale = resolveLocale(rawLocale);

  const filename = basename(filePath);
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    console.error(`Unsupported file type: .${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`);
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI is required");
    process.exit(1);
  }

  const selectedModel = model || process.env.DEFAULT_MODEL || "openai:gpt-4o";
  const parsed = parseModelSpec(selectedModel);
  const provider = parsed.provider === "custom" ? "openai" : parsed.provider;
  const modelId = parsed.modelId;
  const reasoning = parsed.reasoning;
  const providerEnvPrefix = provider.toUpperCase().replace(/-/g, "_");
  const apiKey =
    process.env[`${providerEnvPrefix}_API_KEY`] ||
    process.env.LLM_API_KEY ||
    "";
  const baseURL = process.env[`${providerEnvPrefix}_BASE_URL`] || undefined;

  if (!apiKey) {
    console.error(`No API key found for provider "${provider}". Set ${providerEnvPrefix}_API_KEY or LLM_API_KEY.`);
    process.exit(1);
  }

  console.log(`[extract-skills] File: ${filePath}`);
  console.log(`[extract-skills] Model: ${provider}:${modelId}${reasoning ? ` (reasoning: ${reasoning})` : ""}`);
  console.log(`[extract-skills] Locale: ${locale}`);
  console.log(`[extract-skills] Output: skill_drafts collection (use exportBuiltinSkill to promote to .md)`);

  await connectDb(mongoUri);
  const db = getDb();

  // Init embedding service so create_skill / update_skill triggers embedding generation
  const embeddingApiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
  if (embeddingApiKey) {
    initEmbeddingService(db, {
      apiKey: embeddingApiKey,
      baseURL: process.env.EMBEDDING_BASE_URL,
      model: process.env.EMBEDDING_MODEL,
      dimensions: process.env.EMBEDDING_DIMENSIONS ? Number(process.env.EMBEDDING_DIMENSIONS) : undefined,
    });
    console.log(`[extract-skills] Embedding service initialized`);
  } else {
    console.log(`[extract-skills] No EMBEDDING_API_KEY set — skills will be created without embeddings`);
  }

  const embeddingService = getEmbeddingService();
  let vectorSearchFn: VectorSearchFn | undefined;
  if (embeddingService) {
    vectorSearchFn = async (args) => {
      const results = await embeddingService.vectorSearch(
        { projectId: args.projectId, worldId: args.worldId, userId: args.userId },
        args.query,
        { scope: args.scope, limit: args.limit }
      );
      return { results, total: results.length };
    };
  }

  // Ensure skill_drafts indexes exist (this script may run without the main server ever booting)
  await db.collection("skill_drafts").createIndex({ slug: 1 }, { unique: true });
  console.log(`[extract-skills] Ensured slug unique index on skill_drafts`);

  if (embeddingApiKey) {
    const dimensions = process.env.EMBEDDING_DIMENSIONS ? Number(process.env.EMBEDDING_DIMENSIONS) : 1536;
    try {
      const existing = await db.collection("skill_drafts").listSearchIndexes("vector_index").toArray();
      if (existing.length === 0) {
        await db.collection("skill_drafts").createSearchIndex({
          name: "vector_index",
          type: "vectorSearch",
          definition: {
            fields: [
              { type: "vector", path: "embedding", numDimensions: dimensions, similarity: "cosine" },
            ],
          },
        });
        console.log(`[extract-skills] Created vector_index on skill_drafts (dimensions=${dimensions})`);
        console.log(`[extract-skills] Note: Atlas Vector Search index build may take a few minutes to become queryable`);
      } else {
        console.log(`[extract-skills] vector_index on skill_drafts already exists`);
      }
    } catch (err: any) {
      if (!err.message?.includes("already exists")) {
        console.warn(`[extract-skills] Could not create vector_index on skill_drafts: ${err.message}`);
        console.warn(`[extract-skills] (search_skills will fall back to regex; only Atlas clusters support vector search)`);
      }
    }
  }

  try {
    const buffer = await readFile(filePath);
    const text = await fileToText(buffer, filename);
    if (!text.trim()) {
      console.error("File is empty");
      process.exit(1);
    }

    const chunks = chunkText(text, DEFAULT_CHUNK_SIZE_CHARS, DEFAULT_CHUNK_SIZE_WORDS);
    const totalChunks = chunks.length;
    console.log(`[extract-skills] Total chunks: ${totalChunks}`);

    if (fromChunk > totalChunks) {
      console.error(`[extract-skills] --from ${fromChunk} exceeds total chunks (${totalChunks}). Nothing to do.`);
      return;
    }
    if (fromChunk > 1) {
      console.log(`[extract-skills] Resuming from chunk ${fromChunk}/${totalChunks} (skipping ${fromChunk - 1})`);
    }

    const i18n = t(locale);

    // Aggregate usage across all chunks
    const totalUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costTotal: 0 };
    let lastModel = "";

    function fmtUsd(n: number): string {
      if (n === 0) return "$0";
      if (n < 0.01) return `$${n.toFixed(5)}`;
      return `$${n.toFixed(4)}`;
    }
    function fmtTok(n: number): string {
      if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
      return String(n);
    }

    for (let i = fromChunk - 1; i < totalChunks; i++) {
      console.log(`\n========== Chunk ${i + 1}/${totalChunks} ==========`);
      const chunkUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costTotal: 0 };

      const session = new CreatorAgentSession({
        apiKey,
        provider,
        modelId,
        baseURL,
        reasoning,
        db,
        projectId: "skill-extract",
        userId: undefined,
        vectorSearchFn,
        onDocumentChanged: embeddingService
          ? (collection, id) => embeddingService.enqueue(collection, id)
          : undefined,
        agentType: "skill-extract",
        skillCollection: "skill_drafts",
      });

      const chunkPrompt = i18n.skillExtract.chunkPrompt(i, totalChunks);
      const message = `${chunkPrompt}\n\n---\n\n${chunks[i]}\n\n---`;

      try {
        for await (const event of session.chat(message, { locale })) {
          switch (event.type) {
            case "text":
              process.stdout.write(event.text);
              break;
            case "tool_use":
              console.log(`\n[tool_use] ${event.toolName} ${JSON.stringify(event.toolInput)}`);
              break;
            case "tool_result": {
              const summary = JSON.stringify(event.result).slice(0, 300);
              console.log(`[tool_result] ${event.toolName ?? ""} ${summary}`);
              break;
            }
            case "error":
              console.error(`\n[error] ${event.error}`);
              break;
            case "usage": {
              // Skip aggregated summary events to avoid double counting per-turn entries
              if (event.usage.isSummary) break;
              chunkUsage.input += event.usage.input;
              chunkUsage.output += event.usage.output;
              chunkUsage.cacheRead += event.usage.cacheRead;
              chunkUsage.cacheWrite += event.usage.cacheWrite;
              chunkUsage.totalTokens += event.usage.totalTokens;
              chunkUsage.costTotal += event.usage.cost?.total ?? 0;
              if (event.usage.model && event.usage.model !== "unknown") lastModel = event.usage.model;
              break;
            }
            case "done":
              process.stdout.write("\n");
              break;
          }
        }
      } catch (err) {
        console.error(`\n[chunk ${i + 1}] error:`, err);
      } finally {
        session.close();
      }

      // Per-chunk usage summary
      console.log(
        `[usage] chunk ${i + 1}: in=${fmtTok(chunkUsage.input)} out=${fmtTok(chunkUsage.output)} ` +
        `cache(r/w)=${fmtTok(chunkUsage.cacheRead)}/${fmtTok(chunkUsage.cacheWrite)} ` +
        `total=${fmtTok(chunkUsage.totalTokens)} cost=${fmtUsd(chunkUsage.costTotal)}`
      );

      // Accumulate
      totalUsage.input += chunkUsage.input;
      totalUsage.output += chunkUsage.output;
      totalUsage.cacheRead += chunkUsage.cacheRead;
      totalUsage.cacheWrite += chunkUsage.cacheWrite;
      totalUsage.totalTokens += chunkUsage.totalTokens;
      totalUsage.costTotal += chunkUsage.costTotal;

      console.log(`========== Chunk ${i + 1}/${totalChunks} done ==========`);
    }

    // Grand total
    console.log(
      `\n[usage] TOTAL (${lastModel || "unknown"}): in=${fmtTok(totalUsage.input)} out=${fmtTok(totalUsage.output)} ` +
      `cache(r/w)=${fmtTok(totalUsage.cacheRead)}/${fmtTok(totalUsage.cacheWrite)} ` +
      `tokens=${fmtTok(totalUsage.totalTokens)} cost=${fmtUsd(totalUsage.costTotal)}`
    );

    // Wait for embedding queue to flush (debounced 3s + processing time)
    if (embeddingService) {
      console.log(`\n[extract-skills] Waiting for embedding queue to flush...`);
      await sleep(8000);
    }

    console.log(`\n[extract-skills] All done.`);
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
