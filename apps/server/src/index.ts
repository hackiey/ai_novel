import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin, FastifyTRPCPluginOptions } from "@trpc/server/adapters/fastify";
import { connectDb, disconnectDb } from "./db.js";
import { createContext } from "./trpc.js";
import { appRouter, AppRouter } from "./routers/index.js";
import { initEmbeddingService } from "./services/embeddingService.js";
import { registerAgentRoutes } from "./routes/agentStream.js";

const PORT = Number(process.env.PORT) || 3001;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/ai_novel";

async function main() {
  const fastify = Fastify({
    logger: true,
    maxParamLength: 5000,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
  });

  // Connect to MongoDB
  const db = await connectDb(MONGODB_URI);

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

  // Health check endpoint
  fastify.get("/health", async () => {
    return { status: "ok" };
  });

  // Graceful shutdown
  const shutdown = async () => {
    fastify.log.info("Shutting down...");
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
