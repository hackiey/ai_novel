import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { NovelAgentSession, getOrRefreshWorldSummary, resolveLocale, t } from "@ai-novel/agent";
import type { VectorSearchFn, Locale } from "@ai-novel/agent";
import { getDb } from "../db.js";
import { getEmbeddingService } from "../services/embeddingService.js";
import { verifyToken, type JwtPayload } from "../auth/jwt.js";
import mammoth from "mammoth";

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "openai:gpt-4o";

function parseModelSpec(spec: string): { provider: string; modelId: string } {
  const idx = spec.indexOf(":");
  if (idx === -1) {
    return { provider: "anthropic", modelId: spec };
  }
  return { provider: spec.slice(0, idx), modelId: spec.slice(idx + 1) };
}
const IMPORT_CHUNK_SIZE_CHARS = Number(process.env.IMPORT_CHUNK_SIZE_CHARS) || 10000;
const IMPORT_CHUNK_SIZE_WORDS = Number(process.env.IMPORT_CHUNK_SIZE_WORDS) || 10000;

function extractUser(request: { headers: { authorization?: string } }): JwtPayload | null {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    return verifyToken(auth.slice(7));
  } catch {
    return null;
  }
}

function isCJKText(text: string): boolean {
  const nonWhitespace = text.replace(/\s/g, "");
  if (nonWhitespace.length === 0) return false;
  const cjkChars = nonWhitespace.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g);
  return (cjkChars?.length ?? 0) / nonWhitespace.length > 0.3;
}

function chunkText(text: string, chunkChars: number, chunkWords: number): string[] {
  const cjkMode = isCJKText(text);
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  function measure(s: string): number {
    if (cjkMode) return s.length;
    return s.split(/\s+/).filter(Boolean).length;
  }

  const limit = cjkMode ? chunkChars : chunkWords;

  for (const para of paragraphs) {
    const paraSize = measure(para);
    const currentSize = measure(current);

    if (currentSize + paraSize <= limit) {
      current += (current ? "\n\n" : "") + para;
    } else if (currentSize > 0) {
      chunks.push(current);
      if (paraSize > limit) {
        const subChunks = splitLargeParagraph(para, limit, cjkMode);
        for (let i = 0; i < subChunks.length - 1; i++) {
          chunks.push(subChunks[i]);
        }
        current = subChunks[subChunks.length - 1];
      } else {
        current = para;
      }
    } else {
      if (paraSize > limit) {
        const subChunks = splitLargeParagraph(para, limit, cjkMode);
        for (let i = 0; i < subChunks.length - 1; i++) {
          chunks.push(subChunks[i]);
        }
        current = subChunks[subChunks.length - 1];
      } else {
        current = para;
      }
    }
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
}

function splitLargeParagraph(para: string, limit: number, cjkMode: boolean): string[] {
  const sentences = para.split(/(?<=[。！？.!?\n])\s*/);
  const chunks: string[] = [];
  let current = "";

  function measure(s: string): number {
    if (cjkMode) return s.length;
    return s.split(/\s+/).filter(Boolean).length;
  }

  for (const sentence of sentences) {
    if (measure(current) + measure(sentence) <= limit) {
      current += sentence;
    } else {
      if (current) chunks.push(current);
      if (measure(sentence) > limit) {
        if (cjkMode) {
          for (let i = 0; i < sentence.length; i += limit) {
            const slice = sentence.slice(i, i + limit);
            if (i + limit >= sentence.length) {
              current = slice;
            } else {
              chunks.push(slice);
            }
          }
        } else {
          const words = sentence.split(/\s+/);
          let acc = "";
          for (const word of words) {
            if (measure(acc) + 1 > limit) {
              chunks.push(acc);
              acc = word;
            } else {
              acc += (acc ? " " : "") + word;
            }
          }
          current = acc;
        }
      } else {
        current = sentence;
      }
    }
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
}

async function fileToText(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "txt":
    case "md":
      return buffer.toString("utf-8");
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "pdf": {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      await parser.destroy();
      return result.text;
    }
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}

const ALLOWED_EXTENSIONS = new Set(["txt", "md", "docx", "pdf"]);

async function handleImportStream(
  request: any,
  reply: any,
  user: JwtPayload,
  filename: string,
  text: string,
  worldId: string,
  locale: Locale,
  model: string | undefined,
) {
  const chunks = chunkText(text, IMPORT_CHUNK_SIZE_CHARS, IMPORT_CHUNK_SIZE_WORDS);
  const totalChunks = chunks.length;

  const send = (payload: unknown) => {
    reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  let cancelled = false;
  // Listen on the response socket, not request.raw — request.raw "close" fires
  // as soon as the multipart body is fully consumed, long before streaming ends.
  reply.raw.on("close", () => {
    if (!reply.raw.writableFinished) {
      cancelled = true;
    }
  });

  send({ type: "import_start", totalChunks, fileName: filename });

  const db = getDb();
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

  const i18n = t(locale);

  for (let i = 0; i < totalChunks; i++) {
    if (cancelled) break;

    send({ type: "chunk_start", chunkIndex: i, totalChunks });

    try {
      let worldSummary: string | undefined;
      try {
        worldSummary = await getOrRefreshWorldSummary(db, worldId, locale);
      } catch (err) {
        console.error("[FileImport] Failed to get world summary:", err);
      }

      const selectedModel = model || DEFAULT_MODEL;
      const { provider, modelId } = parseModelSpec(selectedModel);
      const providerEnvPrefix = provider.toUpperCase().replace(/-/g, "_");
      const apiKey = process.env[`${providerEnvPrefix}_API_KEY`]
        || process.env.LLM_API_KEY
        || "";
      const baseURL = process.env[`${providerEnvPrefix}_BASE_URL`] || undefined;

      const session = new NovelAgentSession({
        apiKey,
        provider,
        modelId,
        baseURL,
        db,
        projectId: worldId,
        worldId,
        userId: user.userId,
        vectorSearchFn,
        onDocumentChanged: embeddingService
          ? (collection, id) => embeddingService.enqueue(collection, id)
          : undefined,
        onWorldSummaryStale: (wId) => {
          db.collection("worlds").updateOne(
            { _id: new ObjectId(wId) },
            { $set: { summaryStale: true } }
          ).catch((err) => console.error("[WorldSummary] Failed to mark stale:", err));
        },
      });

      const prompt = i18n.fileImport.extractionPrompt(i, totalChunks);
      const chunkLabel = i18n.fileImport.chunkLabel(i, totalChunks);
      const message = `${prompt}\n\n${chunkLabel}\n\n---\n\n${chunks[i]}\n\n---`;

      console.log(`[FileImport] Chunk ${i}: starting chat, message length: ${message.length}`);
      let eventCount = 0;
      const chatGen = session.chat(message, { worldSummary, locale });
      try {
        for await (const event of chatGen) {
          if (cancelled) break;
          eventCount++;
          console.log(`[FileImport] Chunk ${i}: event #${eventCount} type=${event.type}`);
          if (event.type === "error") {
            console.error(`[FileImport] Chunk ${i}: agent error:`, (event as any).error);
          }
          send({ type: "chunk_event", chunkIndex: i, event });
        }
      } catch (chatErr) {
        console.error(`[FileImport] Chunk ${i}: chat iteration error:`, chatErr);
        send({ type: "chunk_event", chunkIndex: i, event: { type: "error", error: String(chatErr) } });
      }

      console.log(`[FileImport] Chunk ${i}: completed with ${eventCount} events`);
      session.close();
      send({ type: "chunk_done", chunkIndex: i });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[FileImport] Chunk ${i} error:`, err);
      send({ type: "chunk_error", chunkIndex: i, error: errorMsg });
    }
  }

  send({ type: "import_done" });
  reply.raw.write("data: [DONE]\n\n");
  reply.raw.end();
}

export function registerFileImportRoutes(fastify: FastifyInstance) {
  fastify.post("/api/world/import-file", async (request, reply) => {
    // Authenticate
    const user = extractUser(request);
    if (!user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // Parse multipart
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "No file uploaded" });
    }

    const worldId = (data.fields.worldId as any)?.value as string | undefined;
    const rawLocale = (data.fields.locale as any)?.value as string | undefined;
    const model = (data.fields.model as any)?.value as string | undefined;

    if (!worldId) {
      return reply.status(400).send({ error: "worldId is required" });
    }

    const locale: Locale = resolveLocale(rawLocale);
    const filename = data.filename;
    const ext = filename.toLowerCase().split(".").pop() || "";

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return reply.status(400).send({ error: `Unsupported file type: .${ext}. Allowed: .txt, .md, .docx, .pdf` });
    }

    // Read file into buffer
    const fileBuffer = await data.toBuffer();

    // Convert to text
    let text: string;
    try {
      text = await fileToText(fileBuffer, filename);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: `Failed to parse file: ${msg}` });
    }

    if (!text.trim()) {
      return reply.status(400).send({ error: "File is empty" });
    }

    // Set SSE headers (same pattern as agentStream.ts)
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Await the full stream — same pattern as agentStream.ts
    await handleImportStream(request, reply, user, filename, text, worldId, locale, model);
  });
}
