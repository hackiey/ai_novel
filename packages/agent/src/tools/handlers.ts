import { Db, ObjectId } from "mongodb";
import { computeChapterSynopsisSourceHash } from "../chapterSynopsis.js";
import { entityScopeFilter, userIdMatcher } from "../entityScope.js";

// Helper to convert string ID to ObjectId safely
function toObjectId(id: string): ObjectId {
  return new ObjectId(id);
}

/**
 * Build a `{ userId: ... }` clause for scoping a Mongo query to a tenant.
 * Returns an empty object when no userId is given, so callers can spread it
 * into existing filters unconditionally without changing behavior for the
 * (legacy) unauthenticated paths.
 */
function ownerClause(userId?: string): Record<string, unknown> {
  if (!userId) return {};
  return { userId: userIdMatcher(userId) };
}

// Fields that should never be sent to the LLM (large embedding vectors waste tokens)
const EXCLUDED_FIELDS = new Set(["embedding", "embeddingText", "embeddingUpdatedAt"]);

// Helper to serialize MongoDB documents (convert ObjectId to string, strip embedding fields)
function serialize(doc: unknown): unknown {
  if (doc === null || doc === undefined) return doc;
  if (doc instanceof ObjectId) return doc.toHexString();
  if (doc instanceof Date) return doc.toISOString();
  if (Array.isArray(doc)) return doc.map(serialize);
  if (typeof doc === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(doc as Record<string, unknown>)) {
      if (EXCLUDED_FIELDS.has(key)) continue;
      result[key] = serialize(value);
    }
    return result;
  }
  return doc;
}

// ============ Detail Formatters ============

function formatCharacterDetail(doc: any): string {
  const parts: string[] = [];
  if (doc.name) parts.push(`名称: ${doc.name}`);
  if (doc.aliases?.length) parts.push(`别名: ${doc.aliases.join(", ")}`);
  if (doc.importance) parts.push(`重要性: ${doc.importance}`);
  if (doc.content) parts.push(`描述:\n${doc.content}`);
  return parts.join("\n");
}

function formatWorldSettingDetail(doc: any): string {
  const parts: string[] = [];
  if (doc.category) parts.push(`分类: ${doc.category}`);
  if (doc.title) parts.push(`标题: ${doc.title}`);
  if (doc.importance) parts.push(`重要性: ${doc.importance}`);
  if (doc.tags?.length) parts.push(`标签: ${doc.tags.join(", ")}`);
  if (doc.content) parts.push(`内容: ${doc.content}`);
  return parts.join("\n");
}

// ============ Semantic Search ============

export async function semanticSearch(
  args: { projectId?: string; worldId?: string; query: string; scope?: string[]; limit?: number },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const { query, limit = 5 } = args;
  const scope = args.scope ?? ["character", "world", "draft", "chapter"];
  // Split query by whitespace and join with | for OR matching, escape special regex chars
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.trim().split(/\s+/).join("|");
  const regex = { $regex: pattern, $options: "i" };
  const scopeFilter = entityScopeFilter({ projectId: args.projectId, worldId: args.worldId, userId });
  const projectFilter: Record<string, any> = { ...ownerClause(userId) };
  if (args.projectId) projectFilter.projectId = { $in: [args.projectId, new ObjectId(args.projectId)] };
  const results: Array<{ collection: string; title: string; excerpt: string; id: string }> = [];

  if (scope.includes("character")) {
    const characters = await db
      .collection("characters")
      .find({
        ...scopeFilter,
        $or: [
          { name: regex },
          { content: regex },
          { aliases: regex },
        ],
      })
      .limit(limit)
      .toArray();

    for (const c of characters) {
      results.push({
        collection: "character",
        title: c.name,
        excerpt: formatCharacterDetail(c),
        id: c._id.toHexString(),
      });
    }
  }

  if (scope.includes("world")) {
    const settings = await db
      .collection("world_settings")
      .find({
        ...scopeFilter,
        $or: [{ title: regex }, { content: regex }, { category: regex }, { tags: regex }],
      })
      .limit(limit)
      .toArray();

    for (const w of settings) {
      results.push({
        collection: "world",
        title: `[${w.category}] ${w.title}`,
        excerpt: formatWorldSettingDetail(w),
        id: w._id.toHexString(),
      });
    }
  }

  if (scope.includes("draft")) {
    const drafts = await db
      .collection("drafts")
      .find({
        ...scopeFilter,
        $or: [{ title: regex }, { content: regex }, { tags: regex }],
      })
      .limit(limit)
      .toArray();

    for (const d of drafts) {
      results.push({
        collection: "draft",
        title: d.title,
        excerpt: (d.content ?? "").slice(0, 200),
        id: d._id.toHexString(),
      });
    }
  }

  if (scope.includes("chapter")) {
    const chapters = await db
      .collection("chapters")
      .find({
        ...projectFilter,
        $or: [{ title: regex }, { content: regex }, { synopsis: regex }],
      })
      .limit(limit)
      .toArray();

    for (const ch of chapters) {
      results.push({
        collection: "chapter",
        title: `第${ch.order ?? "?"}章: ${ch.title}`,
        excerpt: (ch.synopsis || (ch.content ?? "").slice(0, 200)),
        id: ch._id.toHexString(),
      });
    }
  }

  return { results: results.slice(0, limit), total: results.length };
}

// ============ Character Handlers ============

export async function getCharacter(
  args: { id: string },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const character = await db
    .collection("characters")
    .findOne({ _id: toObjectId(args.id), ...ownerClause(userId) });
  if (!character) return { error: `Character not found: ${args.id}` };
  return serialize(character);
}

export async function createCharacter(
  args: { worldId?: string; projectId?: string; name: string; aliases?: string[]; tags?: string[]; content?: string; importance?: string; summary?: string },
  db: Db,
  userId?: string
): Promise<unknown> {
  const now = new Date();
  if (!args.worldId) return { error: "worldId is required" };
  const doc: Record<string, unknown> = {
    worldId: new ObjectId(args.worldId),
    // Explicit null for world-level so Atlas Vector Search can use $in: [pid, null].
    projectId: args.projectId ? new ObjectId(args.projectId) : null,
    name: args.name,
    aliases: args.aliases ?? [],
    tags: args.tags ?? [],
    importance: args.importance ?? "minor",
    summary: args.summary ?? "",
    content: args.content ?? "",
    createdAt: now,
    updatedAt: now,
  };
  if (userId) doc.userId = userId;
  const result = await db.collection("characters").insertOne(doc);
  return serialize({ ...doc, _id: result.insertedId });
}

export async function updateCharacter(
  args: { id: string; name?: string; aliases?: string[]; tags?: string[]; content?: string; importance?: string; summary?: string },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const { id, ...updates } = args;
  const setFields: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.name !== undefined) setFields.name = updates.name;
  if (updates.aliases !== undefined) setFields.aliases = updates.aliases;
  if (updates.tags !== undefined) setFields.tags = updates.tags;
  if (updates.importance !== undefined) setFields.importance = updates.importance;
  if (updates.summary !== undefined) setFields.summary = updates.summary;
  if (updates.content !== undefined) setFields.content = updates.content;

  const result = await db
    .collection("characters")
    .findOneAndUpdate(
      { _id: toObjectId(id), ...ownerClause(userId) },
      { $set: setFields },
      { returnDocument: "after" }
    );
  if (!result) return { error: `Character not found: ${id}` };
  return serialize(result);
}

export async function deleteCharacter(
  args: { id: string },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const result = await db
    .collection("characters")
    .findOneAndDelete({ _id: toObjectId(args.id), ...ownerClause(userId) });
  if (!result) return { error: `Character not found: ${args.id}` };
  // Also clean up embedding chunks
  await db.collection("embedding_chunks").deleteMany({
    sourceId: toObjectId(args.id),
    sourceCollection: "characters",
  });
  return { success: true, deleted: serialize(result) };
}

// ============ World Setting Handlers ============

export async function getWorldSetting(
  args: { id: string },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const ws = await db
    .collection("world_settings")
    .findOne({ _id: toObjectId(args.id), ...ownerClause(userId) });
  if (!ws) return { error: `World setting not found: ${args.id}` };
  return serialize(ws);
}

export async function createWorldSetting(
  args: { worldId?: string; projectId?: string; category: string; title: string; content?: string; tags?: string[]; importance?: string; summary?: string },
  db: Db,
  userId?: string
): Promise<unknown> {
  const now = new Date();
  if (!args.worldId) return { error: "worldId is required" };
  const doc: Record<string, unknown> = {
    worldId: new ObjectId(args.worldId),
    projectId: args.projectId ? new ObjectId(args.projectId) : null,
    category: args.category,
    title: args.title,
    content: args.content ?? "",
    tags: args.tags ?? [],
    importance: args.importance ?? "minor",
    summary: args.summary ?? "",
    createdAt: now,
    updatedAt: now,
  };
  if (userId) doc.userId = userId;
  const result = await db.collection("world_settings").insertOne(doc);
  return serialize({ ...doc, _id: result.insertedId });
}

export async function updateWorldSetting(
  args: { id: string; category?: string; title?: string; content?: string; tags?: string[]; importance?: string; summary?: string },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const { id, ...updates } = args;
  const setFields: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.category !== undefined) setFields.category = updates.category;
  if (updates.title !== undefined) setFields.title = updates.title;
  if (updates.content !== undefined) setFields.content = updates.content;
  if (updates.tags !== undefined) setFields.tags = updates.tags;
  if (updates.importance !== undefined) setFields.importance = updates.importance;
  if (updates.summary !== undefined) setFields.summary = updates.summary;

  const result = await db
    .collection("world_settings")
    .findOneAndUpdate(
      { _id: toObjectId(id), ...ownerClause(userId) },
      { $set: setFields },
      { returnDocument: "after" }
    );
  if (!result) return { error: `World setting not found: ${id}` };
  return serialize(result);
}

export async function deleteWorldSetting(
  args: { id: string },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const result = await db
    .collection("world_settings")
    .findOneAndDelete({ _id: toObjectId(args.id), ...ownerClause(userId) });
  if (!result) return { error: `World setting not found: ${args.id}` };
  await db.collection("embedding_chunks").deleteMany({
    sourceId: toObjectId(args.id),
    sourceCollection: "world_settings",
  });
  return { success: true, deleted: serialize(result) };
}

// ============ Chapter Handlers ============

const RECENT_CHAPTER_WORD_BUDGET = 50_000;

function countChapterWords(text: string): number {
  if (!text) return 0;
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g);
  const cjkCount = cjk ? cjk.length : 0;
  const stripped = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, " ");
  const words = stripped.split(/\s+/).filter(Boolean);
  return cjkCount + words.length;
}

async function markDependentChapterSynopsesPending(
  db: Db,
  args: { projectId: ObjectId; fromOrder?: number; excludeId?: ObjectId; all?: boolean },
): Promise<void> {
  const filter: Record<string, unknown> = {
    projectId: args.projectId,
  };

  if (!args.all && args.fromOrder !== undefined) {
    filter.order = { $gte: args.fromOrder };
  }

  if (args.excludeId) {
    filter._id = { $ne: args.excludeId };
  }

  await db.collection("chapters").updateMany(
    filter,
    {
      $set: { synopsisStatus: "pending" },
      $unset: {
        synopsisJobLockedAt: "",
        synopsisJobToken: "",
        synopsisError: "",
      },
    },
  );
}

export async function getChapter(
  args: { id: string },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const chapter = await db
    .collection("chapters")
    .findOne({ _id: toObjectId(args.id), ...ownerClause(userId) });
  if (!chapter) return { error: `Chapter not found: ${args.id}` };
  return serialize(chapter);
}

/**
 * Generic list dispatch by entity type.
 * - character / world_setting: filter by worldId
 * - chapter: delegate to listChapters (recent/historical word-budget split)
 * - draft: scope-isolated via entityScopeFilter (world-level + current project)
 * - character / world_setting: scope-isolated via entityScopeFilter
 *
 * `userId`, when provided, is enforced on every collection so the agent cannot
 * cross tenants by passing a fabricated projectId/worldId.
 */
export async function listEntities(
  args: {
    type: "character" | "world_setting" | "draft" | "chapter";
    projectId?: string;
    worldId?: string;
    limit?: number;
  },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

  if (args.type === "chapter") {
    if (!args.projectId) return { error: "projectId is required for type='chapter'" };
    return listChapters({ projectId: args.projectId }, db, userId);
  }

  if (args.type === "draft") {
    const filter = entityScopeFilter({ projectId: args.projectId, worldId: args.worldId, userId });
    // userId alone is not enough to constrain a list, so check the caller still
    // provided a project or world scope. ownerClause is appended below for parity.
    if (!args.projectId && !args.worldId) {
      return { error: "projectId or worldId is required for type='draft'" };
    }
    const docs = await db
      .collection("drafts")
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();
    return {
      total: docs.length,
      items: docs.map((d) => ({
        id: d._id.toHexString(),
        title: d.title,
        scope: d.projectId ? "project" : "world",
        tags: d.tags ?? [],
        excerpt: (d.content ?? "").slice(0, 160),
        updatedAt: d.updatedAt instanceof Date ? d.updatedAt.toISOString() : d.updatedAt,
      })),
    };
  }

  // character / world_setting — both honor the same scope-isolation rule as drafts.
  if (!args.worldId) return { error: `worldId is required for type='${args.type}'` };
  const collection = args.type === "character" ? "characters" : "world_settings";
  const filter = entityScopeFilter({ projectId: args.projectId, worldId: args.worldId, userId });
  const docs = await db
    .collection(collection)
    .find(filter)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();

  return {
    total: docs.length,
    items: docs.map((d) => {
      const scope = d.projectId ? "project" : "world";
      if (args.type === "character") {
        return {
          id: d._id.toHexString(),
          name: d.name,
          scope,
          importance: d.importance,
          summary: d.summary ?? "",
          aliases: d.aliases ?? [],
          tags: d.tags ?? [],
        };
      }
      return {
        id: d._id.toHexString(),
        title: d.title,
        scope,
        category: d.category,
        importance: d.importance,
        summary: d.summary ?? "",
        tags: d.tags ?? [],
      };
    }),
  };
}

export async function listChapters(
  args: { projectId: string },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const chapters = await db
    .collection("chapters")
    .find({
      projectId: { $in: [args.projectId, new ObjectId(args.projectId)] },
      ...ownerClause(userId),
    })
    .sort({ order: 1 })
    .toArray();

  let recentWordCount = 0;
  let recentStartIndex = chapters.length;

  for (let i = chapters.length - 1; i >= 0; i -= 1) {
    recentWordCount += countChapterWords(chapters[i].content ?? "");
    recentStartIndex = i;
    if (recentWordCount >= RECENT_CHAPTER_WORD_BUDGET) break;
  }

  const historicalChapters = chapters.slice(0, recentStartIndex).map((chapter) => ({
    id: chapter._id.toHexString(),
    order: chapter.order,
    title: chapter.title,
    wordCount: countChapterWords(chapter.content ?? ""),
    synopsis: chapter.synopsis || (chapter.content ?? "").slice(0, 200),
  }));

  const recentChapters = chapters.slice(recentStartIndex).map((chapter) => ({
    id: chapter._id.toHexString(),
    order: chapter.order,
    title: chapter.title,
    wordCount: countChapterWords(chapter.content ?? ""),
    synopsis: chapter.synopsis ?? "",
    content: chapter.content ?? "",
  }));

  return {
    recentWordBudget: RECENT_CHAPTER_WORD_BUDGET,
    recentWordCount,
    historicalChapters,
    recentChapters,
  };
}

export async function createChapter(
  args: { projectId: string; title: string; content?: string; synopsis?: string; order?: number },
  db: Db,
  userId?: string
): Promise<unknown> {
  const now = new Date();
  const content = args.content ?? "";
  const sourceHash = computeChapterSynopsisSourceHash({ title: args.title, content });

  let order = args.order;
  if (order === undefined) {
    const lastChapter = await db
      .collection("chapters")
      .find({ projectId: { $in: [args.projectId, new ObjectId(args.projectId)] } })
      .sort({ order: -1 })
      .limit(1)
      .toArray();
    order = lastChapter.length > 0 ? (lastChapter[0].order as number) + 1 : 0;
  }

  const doc: Record<string, unknown> = {
    projectId: new ObjectId(args.projectId),
    order,
    title: args.title,
    content,
    synopsis: args.synopsis ?? "",
    ...(args.synopsis !== undefined || !content.trim()
      ? {
          synopsisSourceHash: sourceHash,
          synopsisStatus: "ready",
          synopsisUpdatedAt: now,
        }
      : {
          synopsisStatus: "pending",
        }),
    wordCount: countChapterWords(content),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  if (userId) doc.userId = userId;
  const result = await db.collection("chapters").insertOne(doc);
  if (args.order !== undefined) {
    await markDependentChapterSynopsesPending(db, {
      projectId: new ObjectId(args.projectId),
      fromOrder: order,
      excludeId: result.insertedId,
    });
  }
  return serialize({ ...doc, _id: result.insertedId });
}


const CHAPTER_EDITABLE_FIELDS = ["title", "content", "synopsis"];

export async function updateChapter(
  args: { id: string; old_string?: string; new_string: string; field?: string; append?: boolean; prepend?: boolean },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const { id, old_string, new_string, append, prepend } = args;
  const field = args.field ?? "content";

  if (!CHAPTER_EDITABLE_FIELDS.includes(field)) {
    return { error: `Invalid field "${field}" for chapter. Allowed: ${CHAPTER_EDITABLE_FIELDS.join(", ")}` };
  }

  const doc = await db.collection("chapters").findOne({ _id: toObjectId(id), ...ownerClause(userId) });
  if (!doc) return { error: `Chapter not found: ${id}` };

  const currentValue = typeof doc[field] === "string" ? doc[field] : "";
  const currentTitle = typeof doc.title === "string" ? doc.title : "";
  const currentContent = typeof doc.content === "string" ? doc.content : "";

  let newValue: string;

  if (append) {
    newValue = currentValue + new_string;
  } else if (prepend) {
    newValue = new_string + currentValue;
  } else {
    // Find-and-replace mode: old_string is required
    if (!old_string) {
      return { error: "old_string is required for find-and-replace mode. Use append or prepend to add content without old_string." };
    }
    if (!currentValue.includes(old_string)) {
      return { error: `old_string not found in field "${field}". Current value (first 200 chars): ${currentValue.slice(0, 200)}` };
    }
    newValue = currentValue.replace(old_string, new_string);
  }

  const fieldChanged = newValue !== currentValue;
  const setFields: Record<string, unknown> = { [field]: newValue, updatedAt: new Date() };
  const unsetFields: Record<string, ""> = {};
  if (fieldChanged && (field === "title" || field === "content" || field === "synopsis")) {
    unsetFields.synopsisJobLockedAt = "";
    unsetFields.synopsisJobToken = "";
    unsetFields.synopsisError = "";
  }

  if (field === "content") {
    const newSourceHash = computeChapterSynopsisSourceHash({ title: currentTitle, content: newValue });
    setFields.wordCount = countChapterWords(newValue);
    if (!newValue.trim()) {
      setFields.synopsis = "";
      setFields.synopsisStatus = "ready";
      setFields.synopsisSourceHash = newSourceHash;
      setFields.synopsisUpdatedAt = setFields.updatedAt;
    } else {
      setFields.synopsisStatus = "pending";
    }
  }
  if (field === "title") {
    const newSourceHash = computeChapterSynopsisSourceHash({ title: newValue, content: currentContent });
    if (!currentContent.trim()) {
      setFields.synopsis = "";
      setFields.synopsisSourceHash = newSourceHash;
      setFields.synopsisStatus = "ready";
      setFields.synopsisUpdatedAt = setFields.updatedAt;
    } else {
      setFields.synopsisStatus = "pending";
    }
  }
  if (field === "synopsis") {
    setFields.synopsisSourceHash = computeChapterSynopsisSourceHash({ title: currentTitle, content: currentContent });
    setFields.synopsisStatus = "ready";
    setFields.synopsisUpdatedAt = setFields.updatedAt;
  }
  const result = await db.collection("chapters").findOneAndUpdate(
    { _id: toObjectId(id), ...ownerClause(userId) },
    Object.keys(unsetFields).length > 0
      ? { $set: setFields, $unset: unsetFields }
      : { $set: setFields },
    { returnDocument: "after" }
  );
  if (result && fieldChanged && (field === "title" || field === "content" || field === "synopsis")) {
    await markDependentChapterSynopsesPending(db, {
      projectId: doc.projectId as ObjectId,
      fromOrder: typeof doc.order === "number" ? doc.order : 0,
      excludeId: doc._id as ObjectId,
    });
  }
  return serialize(result);
}

export async function deleteChapter(
  args: { id: string },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const result = await db
    .collection("chapters")
    .findOneAndDelete({ _id: toObjectId(args.id), ...ownerClause(userId) });
  if (!result) return { error: `Chapter not found: ${args.id}` };
  await markDependentChapterSynopsesPending(db, {
    projectId: result.projectId as ObjectId,
    fromOrder: typeof result.order === "number" ? result.order : 0,
  });
  await db.collection("embedding_chunks").deleteMany({
    sourceId: toObjectId(args.id),
    sourceCollection: "chapters",
  });
  return { success: true, deleted: serialize(result) };
}

// ============ Draft Handlers ============

export async function getDraft(
  args: { id: string },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const draft = await db
    .collection("drafts")
    .findOne({ _id: toObjectId(args.id), ...ownerClause(userId) });
  if (!draft) return { error: `Draft not found: ${args.id}` };
  return serialize(draft);
}

export async function createDraft(
  args: {
    projectId?: string;
    worldId?: string;
    title: string;
    content?: string;
    tags?: string[];
    linkedCharacters?: string[];
    linkedWorldSettings?: string[];
  },
  db: Db,
  userId?: string
): Promise<unknown> {
  const now = new Date();
  const doc: Record<string, any> = {
    title: args.title,
    content: args.content ?? "",
    tags: args.tags ?? [],
    linkedCharacters: (args.linkedCharacters ?? []).map((id) => new ObjectId(id)),
    linkedWorldSettings: (args.linkedWorldSettings ?? []).map((id) => new ObjectId(id)),
    // Explicit null for world-level so Atlas Vector Search filter ($in with null) works.
    projectId: args.projectId ? new ObjectId(args.projectId) : null,
    createdAt: now,
    updatedAt: now,
  };
  if (userId) doc.userId = userId;
  if (args.worldId) doc.worldId = new ObjectId(args.worldId);
  const result = await db.collection("drafts").insertOne(doc);
  return serialize({ ...doc, _id: result.insertedId });
}

export async function updateDraft(
  args: { id: string; title?: string; content?: string; tags?: string[]; linkedCharacters?: string[]; linkedWorldSettings?: string[] },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const { id, ...updates } = args;
  const setFields: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.title !== undefined) setFields.title = updates.title;
  if (updates.content !== undefined) setFields.content = updates.content;
  if (updates.tags !== undefined) setFields.tags = updates.tags;
  if (updates.linkedCharacters !== undefined) setFields.linkedCharacters = updates.linkedCharacters.map((cid) => new ObjectId(cid));
  if (updates.linkedWorldSettings !== undefined) setFields.linkedWorldSettings = updates.linkedWorldSettings.map((wid) => new ObjectId(wid));

  const result = await db
    .collection("drafts")
    .findOneAndUpdate(
      { _id: toObjectId(id), ...ownerClause(userId) },
      { $set: setFields },
      { returnDocument: "after" }
    );
  if (!result) return { error: `Draft not found: ${id}` };
  return serialize(result);
}

export async function deleteDraft(
  args: { id: string },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const result = await db
    .collection("drafts")
    .findOneAndDelete({ _id: toObjectId(args.id), ...ownerClause(userId) });
  if (!result) return { error: `Draft not found: ${args.id}` };
  await db.collection("embedding_chunks").deleteMany({
    sourceId: toObjectId(args.id),
    sourceCollection: "drafts",
  });
  return { success: true, deleted: serialize(result) };
}

// ============ Agent Memory ============

export async function getMemory(
  args: { worldId?: string; projectId?: string },
  db: Db,
  userId?: string,
): Promise<unknown> {
  if (args.projectId) {
    const doc = await db
      .collection("agent_memory")
      .findOne({ projectId: new ObjectId(args.projectId), ...ownerClause(userId) });
    if (!doc) return { content: "" };
    return { content: doc.content ?? "" };
  }
  if (args.worldId) {
    const doc = await db
      .collection("agent_memory")
      .findOne({ worldId: new ObjectId(args.worldId), ...ownerClause(userId) });
    if (!doc) return { content: "" };
    return { content: doc.content ?? "" };
  }
  return { content: "" };
}

export async function updateMemory(
  args: { worldId?: string; projectId?: string; content: string; scope?: "world" | "project" },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const now = new Date();
  // Memory documents are tenant-scoped: include userId in the upsert filter
  // and persist it on insert so future reads stay isolated.
  const ownerSet = userId ? { userId } : {};
  if (args.scope === "project" && args.projectId) {
    await db.collection("agent_memory").updateOne(
      { projectId: new ObjectId(args.projectId), ...ownerClause(userId) },
      { $set: { content: args.content, updatedAt: now }, $setOnInsert: ownerSet },
      { upsert: true }
    );
  } else if (args.worldId) {
    await db.collection("agent_memory").updateOne(
      { worldId: new ObjectId(args.worldId), ...ownerClause(userId) },
      { $set: { content: args.content, updatedAt: now }, $setOnInsert: ownerSet },
      { upsert: true }
    );
  } else {
    return { error: "worldId or projectId is required" };
  }
  return { success: true, scope: args.scope ?? "world", updatedAt: now.toISOString() };
}

// ============ Skill Search ============

export async function searchSkills(
  args: { query: string; limit?: number },
  db: Db,
  collection: string = "skills"
): Promise<unknown> {
  const { query, limit = 10 } = args;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.trim().split(/\s+/).join("|");
  const regex = { $regex: pattern, $options: "i" };

  const skills = await db
    .collection(collection)
    .find({
      $or: [{ name: regex }, { slug: regex }, { description: regex }, { tags: regex }],
    })
    .limit(limit)
    .toArray();

  const results = skills.map((s) => ({
    collection: "skill",
    title: s.name || s.slug,
    excerpt: [
      s.name ? `名称: ${s.name}` : "",
      s.slug ? `Slug: ${s.slug}` : "",
      s.tags?.length ? `标签: ${s.tags.join(", ")}` : "",
      s.description ? `描述: ${s.description}` : "",
    ].filter(Boolean).join("\n"),
    id: s._id.toHexString(),
  }));

  return { results, total: results.length };
}

// ============ Skill Handlers ============

export async function createSkill(
  args: {
    slug: string;
    name: string;
    description: string;
    content: string;
    tags?: string[];
  },
  db: Db,
  userId?: string,
  collection: string = "skills"
): Promise<unknown> {
  if (!/^[a-z0-9-]+$/.test(args.slug)) {
    return { error: `Invalid skill slug: "${args.slug}". Must match /^[a-z0-9-]+$/` };
  }
  const existing = await db.collection(collection).findOne({ slug: args.slug });
  if (existing) {
    return { error: `Skill with slug "${args.slug}" already exists (id: ${existing._id.toHexString()})` };
  }
  const now = new Date();
  const doc: Record<string, unknown> = {
    slug: args.slug,
    name: args.name,
    description: args.description,
    content: args.content,
    tags: args.tags ?? [],
    isBuiltin: false,
    isPublished: false,
    createdAt: now,
    updatedAt: now,
  };
  if (userId) doc.authorId = userId;
  const result = await db.collection(collection).insertOne(doc);
  return serialize({ ...doc, _id: result.insertedId });
}

function authorClause(userId?: string): Record<string, unknown> {
  if (!userId) return {};
  return { authorId: userIdMatcher(userId) };
}

export async function updateSkill(
  args: {
    id: string;
    slug?: string;
    name?: string;
    description?: string;
    content?: string;
    tags?: string[];
  },
  db: Db,
  collection: string = "skills",
  userId?: string,
): Promise<unknown> {
  const { id, ...updates } = args;
  if (updates.slug !== undefined && !/^[a-z0-9-]+$/.test(updates.slug)) {
    return { error: `Invalid skill slug: "${updates.slug}". Must match /^[a-z0-9-]+$/` };
  }
  if (updates.slug !== undefined) {
    const existing = await db.collection(collection).findOne({ slug: updates.slug, _id: { $ne: toObjectId(id) } });
    if (existing) {
      return { error: `Skill with slug "${updates.slug}" already exists (id: ${existing._id.toHexString()})` };
    }
  }
  const setFields: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.slug !== undefined) setFields.slug = updates.slug;
  if (updates.name !== undefined) setFields.name = updates.name;
  if (updates.description !== undefined) setFields.description = updates.description;
  if (updates.content !== undefined) setFields.content = updates.content;
  if (updates.tags !== undefined) setFields.tags = updates.tags;

  const result = await db
    .collection(collection)
    .findOneAndUpdate(
      { _id: toObjectId(id), ...authorClause(userId) },
      { $set: setFields },
      { returnDocument: "after" }
    );
  if (!result) return { error: `Skill not found or not owned by you: ${id}` };
  return serialize(result);
}

export async function deleteSkill(
  args: { id: string },
  db: Db,
  collection: string = "skills",
  userId?: string,
): Promise<unknown> {
  const skill = await db.collection(collection).findOne({ _id: toObjectId(args.id), ...authorClause(userId) });
  if (!skill) return { error: `Skill not found or not owned by you: ${args.id}` };
  if (skill.isBuiltin) return { error: `Cannot delete builtin skill: ${skill.name || skill.slug}` };
  await db.collection(collection).deleteOne({ _id: toObjectId(args.id), ...authorClause(userId) });
  return { success: true, deleted: serialize(skill) };
}

// ============ Generate Synopsis ============

export async function generateSynopsis(
  args: { chapterId: string },
  db: Db,
  userId?: string,
): Promise<unknown> {
  const chapter = await db
    .collection("chapters")
    .findOne({ _id: toObjectId(args.chapterId), ...ownerClause(userId) });
  if (!chapter) return { error: `Chapter not found: ${args.chapterId}` };
  return {
    chapterId: chapter._id.toHexString(),
    title: chapter.title,
    order: chapter.order,
    content: chapter.content,
    currentSynopsis: chapter.synopsis ?? "",
  };
}
