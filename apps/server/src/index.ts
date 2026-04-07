import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { fastifyTRPCPlugin, FastifyTRPCPluginOptions } from "@trpc/server/adapters/fastify";
import { connectDb, disconnectDb } from "./db.js";
import { createContext } from "./trpc.js";
import { appRouter, AppRouter } from "./routers/index.js";
import { initEmbeddingService } from "./services/embeddingService.js";
import { ChapterSynopsisService } from "./services/chapterSynopsisService.js";
import { registerAgentRoutes } from "./routes/agentStream.js";
import { registerFileImportRoutes } from "./routes/fileImport.js";

const PORT = Number(process.env.PORT) || 3001;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/ai_creator";

async function main() {
  const fastify = Fastify({
    logger: true,
    maxParamLength: 5000,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
  });

  // Register multipart for file uploads (50MB limit)
  await fastify.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  // Connect to MongoDB
  const db = await connectDb(MONGODB_URI);
  const chapterSynopsisService = new ChapterSynopsisService(db);

  // Initialize embedding service (optional — requires EMBEDDING_API_KEY or OPENAI_API_KEY)
  const embeddingApiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
  if (embeddingApiKey) {
    initEmbeddingService(db, {
      apiKey: embeddingApiKey,
      baseURL: process.env.EMBEDDING_BASE_URL,
      model: process.env.EMBEDDING_MODEL,
      dimensions: process.env.EMBEDDING_DIMENSIONS ? Number(process.env.EMBEDDING_DIMENSIONS) : undefined,
    });
    console.log(`Embedding service initialized (model: ${process.env.EMBEDDING_MODEL || "default"})`);
  } else {
    console.log("EMBEDDING_API_KEY not set — embedding service disabled, search will use regex fallback");
  }

  // Ensure indexes
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("permission_groups").createIndex({ name: 1 }, { unique: true });
  for (const col of ["worlds", "projects", "characters", "world_settings",
    "drafts", "chapters", "agent_sessions", "agent_messages"]) {
    await db.collection(col).createIndex({ userId: 1 });
  }
  await db.collection("file_imports").createIndex({ userId: 1, worldId: 1, fileHash: 1 });
  await db.collection("shares").createIndex({ userId: 1 });
  await db.collection("shares").createIndex({ shareToken: 1 }, { unique: true });
  await db.collection("shares").createIndex({ projectId: 1, userId: 1 }, { unique: true });

  // Ensure vector search indexes (Atlas Search)
  if (embeddingApiKey) {
    const dimensions = process.env.EMBEDDING_DIMENSIONS ? Number(process.env.EMBEDDING_DIMENSIONS) : 1536;
    const vectorCollections = [
      { name: "characters", filters: ["worldId"] },
      { name: "world_settings", filters: ["worldId"] },
      { name: "drafts", filters: ["worldId", "projectId"] },
      { name: "chapters", filters: ["projectId"] },
    ];
    for (const { name, filters } of vectorCollections) {
      try {
        const col = db.collection(name);
        const existing = await col.listSearchIndexes("vector_index").toArray();
        if (existing.length === 0) {
          await col.createSearchIndex({
            name: "vector_index",
            type: "vectorSearch",
            definition: {
              fields: [
                { type: "vector", path: "embedding", numDimensions: dimensions, similarity: "cosine" },
                ...filters.map((f) => ({ type: "filter" as const, path: f })),
              ],
            },
          });
          console.log(`Created vector_index on ${name}`);
        }
      } catch (err: any) {
        // Not on Atlas or index already exists — skip silently
        if (!err.message?.includes("already exists")) {
          console.warn(`Could not create vector_index on ${name}: ${err.message}`);
        }
      }
    }
  }

  // Register tRPC
  await fastify.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  });

  // Register Agent SSE routes (outside tRPC)
  registerAgentRoutes(fastify);

  // Register file import routes
  registerFileImportRoutes(fastify);

  // Start background chapter synopsis generation
  chapterSynopsisService.start();

  // Health check endpoint
  fastify.get("/health", async () => {
    return { status: "ok" };
  });

  // Graceful shutdown
  const shutdown = async () => {
    fastify.log.info("Shutting down...");
    chapterSynopsisService.stop();
    await fastify.close();
    await disconnectDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start server
  await fastify.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`Server listening on http://localhost:${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
