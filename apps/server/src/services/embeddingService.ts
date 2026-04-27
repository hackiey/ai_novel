import { Db, ObjectId } from "mongodb";
import { EmbeddingService } from "@ai-creator/core";
import type { EmbeddingConfig } from "@ai-creator/core";

/**
 * Build a $vectorSearch.filter for world+project-scoped collections.
 *
 * Atlas Vector Search rejects `$in` arrays whose elements differ in BSON
 * type ("must have elements of the same type"), so we cannot reuse the
 * generic `entityScopeFilter` (which mixes string + ObjectId for legacy-data
 * compatibility on plain finds). Instead we coerce ids to ObjectId only.
 * This matches the storage convention enforced by handlers.ts (every entity
 * is written with `worldId`/`projectId` as ObjectId or explicit `null`).
 */
function vectorScopeFilter(ids: { projectId?: string; worldId?: string }): Record<string, unknown> {
  const { projectId, worldId } = ids;
  if (projectId && worldId) {
    return {
      worldId: new ObjectId(worldId),
      // ObjectId + null is allowed (Atlas treats null as a separate atomic
      // value, not a heterogeneous-array element) and lets world-level
      // entities (projectId === null) appear alongside the current project.
      projectId: { $in: [new ObjectId(projectId), null] },
    };
  }
  if (projectId) {
    return { projectId: new ObjectId(projectId) };
  }
  if (worldId) {
    return { worldId: new ObjectId(worldId), projectId: null };
  }
  return {};
}

/** Supported collections for embedding */
const EMBEDDABLE_COLLECTIONS = [
  "characters",
  "world_settings",
  "drafts",
  "chapters",
  "skills",
  "skill_drafts",
] as const;

type EmbeddableCollection = (typeof EMBEDDABLE_COLLECTIONS)[number];

/**
 * Builds the embeddingText field for each collection type.
 * This text is what gets embedded into vectors.
 */
function buildEmbeddingText(collection: string, doc: any): string {
  switch (collection) {
    case "characters":
      return [doc.name, doc.content].filter(Boolean).join("\n");

    case "world_settings":
      return [doc.title, doc.content].filter(Boolean).join("\n");

    case "drafts":
      return [doc.title, doc.content].filter(Boolean).join("\n");

    case "chapters": {
      // Title + synopsis + first/last 500 chars of content
      const contentSlice = doc.content
        ? doc.content.slice(0, 500) +
          (doc.content.length > 1000
            ? "\n...\n" + doc.content.slice(-500)
            : "")
        : "";
      return [doc.title, doc.synopsis, contentSlice].filter(Boolean).join("\n");
    }

    case "skills":
    case "skill_drafts": {
      const tagsStr = doc.tags?.length ? doc.tags.map((t: string) => `#${t}`).join(" ") : "";
      return [doc.name, doc.slug, tagsStr, doc.description].filter(Boolean).join("\n");
    }

    default:
      return "";
  }
}

/**
 * Extract a display title from a document depending on its collection.
 */
function extractTitle(collection: string, doc: any): string {
  switch (collection) {
    case "characters":
      return doc.name || "Untitled Character";
    case "skills":
    case "skill_drafts":
      return doc.name || doc.slug || "Untitled Skill";
    case "chapters":
      return doc.title || `Chapter ${doc.order ?? ""}`.trim();
    default:
      return doc.title || "Untitled";
  }
}

/**
 * Extract content from a document for display in search results.
 * For characters and world_settings, returns full detail.
 * For drafts and chapters, returns a short excerpt.
 */
function extractExcerpt(collection: string, doc: any, maxLen = 200): string {
  switch (collection) {
    case "characters": {
      const parts: string[] = [];
      if (doc.name) parts.push(`名称: ${doc.name}`);
      if (doc.aliases?.length) parts.push(`别名: ${doc.aliases.join(", ")}`);
      if (doc.importance) parts.push(`重要性: ${doc.importance}`);
      if (doc.tags?.length) parts.push(`标签: ${doc.tags.join(", ")}`);
      if (doc.content) parts.push(doc.content);
      return parts.join("\n");
    }
    case "world_settings": {
      const parts: string[] = [];
      if (doc.category) parts.push(`分类: ${doc.category}`);
      if (doc.title) parts.push(`标题: ${doc.title}`);
      if (doc.importance) parts.push(`重要性: ${doc.importance}`);
      if (doc.tags?.length) parts.push(`标签: ${doc.tags.join(", ")}`);
      if (doc.content) parts.push(`内容: ${doc.content}`);
      return parts.join("\n");
    }
    case "skills":
    case "skill_drafts": {
      const parts: string[] = [];
      if (doc.name) parts.push(`名称: ${doc.name}`);
      if (doc.slug) parts.push(`Slug: ${doc.slug}`);
      if (doc.tags?.length) parts.push(`标签: ${doc.tags.join(", ")}`);
      if (doc.description) parts.push(`描述: ${doc.description}`);
      return parts.join("\n");
    }
    default: {
      const text = collection === "chapters"
        ? (doc.synopsis || doc.content || "")
        : (doc.content || "");
      if (text.length > maxLen) {
        return text.slice(0, maxLen) + "...";
      }
      return text;
    }
  }
}

interface QueueEntry {
  collection: string;
  id: string;
  timer: ReturnType<typeof setTimeout>;
}

export class ServerEmbeddingService {
  private embedder: EmbeddingService;
  private db: Db;
  private queue: Map<string, QueueEntry>;
  private debounceMs: number;

  constructor(db: Db, config: EmbeddingConfig, debounceMs = 3000) {
    this.embedder = new EmbeddingService(config);
    this.db = db;
    this.queue = new Map();
    this.debounceMs = debounceMs;
  }

  /**
   * Enqueue a document for embedding update (debounced).
   * Multiple rapid calls for the same doc will be collapsed into one.
   */
  enqueue(collection: string, id: string): void {
    const key = `${collection}:${id}`;

    // Clear existing timer if any
    const existing = this.queue.get(key);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(async () => {
      this.queue.delete(key);
      try {
        await this.processDocument(collection, id);
      } catch (err) {
        console.error(`[Embedding] Failed to process ${key}:`, err);
      }
    }, this.debounceMs);

    this.queue.set(key, { collection, id, timer });
  }

  /**
   * Process a single document: generate embedding and save.
   *
   * Steps:
   * 1. Fetch the document
   * 2. Build embeddingText
   * 3. Compare with existing embeddingText - skip if unchanged
   * 4. If needs chunking, split and create embedding_chunks
   * 5. Otherwise, embed directly and store in the document
   * 6. Clean up old chunks if text was shortened
   */
  async processDocument(collection: string, id: string): Promise<void> {
    const col = this.db.collection(collection);
    const doc = await col.findOne({ _id: new ObjectId(id) });

    if (!doc) {
      // Document deleted — remove any orphaned chunks
      await this.db
        .collection("embedding_chunks")
        .deleteMany({ sourceCollection: collection, sourceId: id });
      return;
    }

    const embeddingText = buildEmbeddingText(collection, doc);

    if (!embeddingText.trim()) {
      // Nothing to embed — clear any existing embedding data
      await col.updateOne(
        { _id: new ObjectId(id) },
        { $unset: { embedding: "", embeddingText: "" } }
      );
      await this.db
        .collection("embedding_chunks")
        .deleteMany({ sourceCollection: collection, sourceId: id });
      return;
    }

    // Skip if unchanged
    if (doc.embeddingText === embeddingText) {
      return;
    }

    if (EmbeddingService.needsChunking(embeddingText)) {
      // Chunk the text and embed each chunk
      const chunks = EmbeddingService.chunkText(embeddingText);
      const embeddings = await this.embedder.embedBatch(chunks);

      // Delete old chunks
      await this.db
        .collection("embedding_chunks")
        .deleteMany({ sourceCollection: collection, sourceId: id });

      // Insert new chunks
      const chunkDocs = chunks.map((text, i) => ({
        sourceCollection: collection,
        sourceId: id,
        projectId: doc.projectId,
        chunkIndex: i,
        text,
        embedding: embeddings[i],
        createdAt: new Date(),
      }));

      if (chunkDocs.length > 0) {
        await this.db.collection("embedding_chunks").insertMany(chunkDocs);
      }

      // Store a summary embedding on the main doc (average of chunk embeddings)
      const dims = embeddings[0]?.length ?? 1536;
      const avgEmbedding = new Array(dims).fill(0);
      for (const emb of embeddings) {
        for (let j = 0; j < dims; j++) {
          avgEmbedding[j] += emb[j] / embeddings.length;
        }
      }

      await col.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            embedding: avgEmbedding,
            embeddingText,
            embeddingUpdatedAt: new Date(),
          },
        }
      );
    } else {
      // Embed directly
      const embedding = await this.embedder.embed(embeddingText);

      await col.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            embedding,
            embeddingText,
            embeddingUpdatedAt: new Date(),
          },
        }
      );

      // Clean up any old chunks (text may have been shortened)
      await this.db
        .collection("embedding_chunks")
        .deleteMany({ sourceCollection: collection, sourceId: id });
    }

    console.log(`[Embedding] Processed ${collection}/${id}`);
  }

  /**
   * Process all documents in a collection (for initial indexing).
   * Returns the number of documents processed.
   */
  async reindexCollection(
    collection: string,
    projectId: string
  ): Promise<number> {
    const col = this.db.collection(collection);
    const docs = await col
      .find({ projectId })
      .project({ _id: 1 })
      .toArray();

    let processed = 0;
    for (const doc of docs) {
      try {
        await this.processDocument(collection, doc._id.toHexString());
        processed++;
      } catch (err) {
        console.error(
          `[Embedding] Reindex error for ${collection}/${doc._id}:`,
          err
        );
      }
    }

    console.log(
      `[Embedding] Reindexed ${processed}/${docs.length} docs in ${collection} for project ${projectId}`
    );
    return processed;
  }

  /**
   * Perform vector search using MongoDB Atlas Vector Search.
   */
  async vectorSearch(
    ids: { projectId?: string; worldId?: string; userId?: string },
    queryText: string,
    options: { scope?: string[]; limit?: number } = {}
  ): Promise<
    Array<{
      collection: string;
      id: string;
      title: string;
      excerpt: string;
      score: number;
    }>
  > {
    const { scope, limit = 10 } = options;
    const { userId } = ids;
    // Map agent tool scope names to MongoDB collection names
    const scopeToCollection: Record<string, EmbeddableCollection> = {
      character: "characters",
      characters: "characters",
      world: "world_settings",
      world_settings: "world_settings",
      draft: "drafts",
      drafts: "drafts",
      chapter: "chapters",
      chapters: "chapters",
      skill: "skills",
      skills: "skills",
      skill_draft: "skill_drafts",
      skill_drafts: "skill_drafts",
    };
    const collections: EmbeddableCollection[] =
      scope && scope.length > 0
        ? [...new Set(scope.map((s) => scopeToCollection[s]).filter((c): c is EmbeddableCollection => !!c))]
        : [...EMBEDDABLE_COLLECTIONS];

    // Generate query embedding
    const queryEmbedding = await this.embedder.embed(queryText);

    const results: Array<{
      collection: string;
      id: string;
      title: string;
      excerpt: string;
      score: number;
    }> = [];

    // Search each collection in parallel
    const searches = collections.map(async (collName) => {
      try {
        // characters / world_settings / drafts honor world+project scope isolation
        // (filter at the index level so the candidate pool isn't diluted by
        // sibling-project entries). Requires the Atlas vector index to include
        // `projectId` as a filter field and every doc to store an explicit
        // `projectId` (null for world-level). chapters belong to a single
        // project; skills and skill_drafts are global.
        //
        // userId enforcement: Atlas vector indexes typically don't include
        // userId as a filter field, so we apply the userId clause as a JS
        // post-filter on the returned candidates rather than at the index
        // stage. This is safe because the project/world filter already
        // narrows the candidate pool down to a small set.
        const filter: Record<string, any> = {};
        if (collName === "chapters") {
          if (ids.projectId) filter.projectId = new ObjectId(ids.projectId);
        } else if (collName === "skills" || collName === "skill_drafts") {
          // Global — no worldId/projectId filter, and no per-user filter
          // either (skills are intentionally cross-tenant for discovery).
        } else {
          Object.assign(filter, vectorScopeFilter({ projectId: ids.projectId, worldId: ids.worldId }));
        }

        const col = this.db.collection(collName);
        const pipeline = [
          {
            $vectorSearch: {
              index: "vector_index",
              path: "embedding",
              queryVector: queryEmbedding,
              numCandidates: 100,
              limit: limit,
              filter,
            },
          },
          {
            $project: {
              _id: 1,
              userId: 1,
              name: 1,
              slug: 1,
              title: 1,
              description: 1,
              order: 1,
              synopsis: 1,
              content: 1,
              profile: 1,
              role: 1,
              aliases: 1,
              importance: 1,
              category: 1,
              tags: 1,
              score: { $meta: "vectorSearchScore" },
            },
          },
        ];

        const rawDocs = await col.aggregate(pipeline).toArray();
        const isCrossUser = collName === "skills" || collName === "skill_drafts";
        const docs = userId && !isCrossUser
          ? rawDocs.filter((doc) => {
              const docUserId = doc.userId;
              if (docUserId === undefined || docUserId === null) return false;
              const asString = typeof docUserId === "string" ? docUserId : docUserId.toString();
              return asString === userId;
            })
          : rawDocs;

        return docs.map((doc) => ({
          collection: collName,
          id: doc._id.toHexString(),
          title: extractTitle(collName, doc),
          excerpt: extractExcerpt(collName, doc),
          score: doc.score as number,
        }));
      } catch (err) {
        console.error(
          `[Embedding] Vector search failed for ${collName}:`,
          err
        );
        return [];
      }
    });

    const allResults = await Promise.all(searches);
    for (const batch of allResults) {
      results.push(...batch);
    }

    // Sort by score descending and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}

/** Singleton reference for the embedding service */
let _embeddingService: ServerEmbeddingService | null = null;

export function initEmbeddingService(
  db: Db,
  config: EmbeddingConfig
): ServerEmbeddingService {
  _embeddingService = new ServerEmbeddingService(db, config);
  return _embeddingService;
}

export function getEmbeddingService(): ServerEmbeddingService | null {
  return _embeddingService;
}
