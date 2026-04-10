import { Db, ObjectId } from "mongodb";
import { computeChapterSynopsisSourceHash } from "../chapterSynopsis.js";

// Helper to convert string ID to ObjectId safely
function toObjectId(id: string): ObjectId {
  return new ObjectId(id);
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
  db: Db
): Promise<unknown> {
  const { query, limit = 5 } = args;
  const scope = args.scope ?? ["character", "world", "draft", "chapter"];
  // Split query by whitespace and join with | for OR matching, escape special regex chars
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.trim().split(/\s+/).join("|");
  const regex = { $regex: pattern, $options: "i" };
  const worldFilter: Record<string, any> = {};
  if (args.worldId) worldFilter.worldId = new ObjectId(args.worldId);
  const projectFilter: Record<string, any> = {};
  if (args.projectId) projectFilter.projectId = new ObjectId(args.projectId);
  const results: Array<{ collection: string; title: string; excerpt: string; id: string }> = [];

  if (scope.includes("character")) {
    const characters = await db
      .collection("characters")
      .find({
        ...worldFilter,
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
        ...worldFilter,
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
    const draftFilter: Record<string, any> = {};
    if (args.projectId && args.worldId) {
      draftFilter.$or = [
        { projectId: new ObjectId(args.projectId) },
        { worldId: new ObjectId(args.worldId) },
      ];
    } else if (args.projectId) {
      draftFilter.projectId = new ObjectId(args.projectId);
    } else if (args.worldId) {
      draftFilter.worldId = new ObjectId(args.worldId);
    }
    const textMatch = { $or: [{ title: regex }, { content: regex }, { tags: regex }] };
    const draftQuery = draftFilter.$or
      ? { $and: [draftFilter, textMatch] }
      : { ...draftFilter, ...textMatch };
    const drafts = await db
      .collection("drafts")
      .find(draftQuery)
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
  db: Db
): Promise<unknown> {
  const character = await db
    .collection("characters")
    .findOne({ _id: toObjectId(args.id) });
  if (!character) return { error: `Character not found: ${args.id}` };
  return serialize(character);
}

export async function createCharacter(
  args: { worldId?: string; projectId?: string; name: string; aliases?: string[]; tags?: string[]; content?: string; importance?: string; summary?: string },
  db: Db,
  userId?: string
): Promise<unknown> {
  const now = new Date();
  const ownerId = args.worldId || args.projectId;
  if (!ownerId) return { error: "worldId or projectId is required" };
  const ownerField = args.worldId ? "worldId" : "projectId";
  const doc: Record<string, unknown> = {
    [ownerField]: new ObjectId(ownerId),
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
  db: Db
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
      { _id: toObjectId(id) },
      { $set: setFields },
      { returnDocument: "after" }
    );
  if (!result) return { error: `Character not found: ${id}` };
  return serialize(result);
}

export async function deleteCharacter(
  args: { id: string },
  db: Db
): Promise<unknown> {
  const result = await db
    .collection("characters")
    .findOneAndDelete({ _id: toObjectId(args.id) });
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
  db: Db
): Promise<unknown> {
  const ws = await db
    .collection("world_settings")
    .findOne({ _id: toObjectId(args.id) });
  if (!ws) return { error: `World setting not found: ${args.id}` };
  return serialize(ws);
}

export async function createWorldSetting(
  args: { worldId?: string; projectId?: string; category: string; title: string; content?: string; tags?: string[]; importance?: string; summary?: string },
  db: Db,
  userId?: string
): Promise<unknown> {
  const now = new Date();
  const ownerId = args.worldId || args.projectId;
  if (!ownerId) return { error: "worldId or projectId is required" };
  const ownerField = args.worldId ? "worldId" : "projectId";
  const doc: Record<string, unknown> = {
    [ownerField]: new ObjectId(ownerId),
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
  db: Db
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
      { _id: toObjectId(id) },
      { $set: setFields },
      { returnDocument: "after" }
    );
  if (!result) return { error: `World setting not found: ${id}` };
  return serialize(result);
}

export async function deleteWorldSetting(
  args: { id: string },
  db: Db
): Promise<unknown> {
  const result = await db
    .collection("world_settings")
    .findOneAndDelete({ _id: toObjectId(args.id) });
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
  db: Db
): Promise<unknown> {
  const chapter = await db
    .collection("chapters")
    .findOne({ _id: toObjectId(args.id) });
  if (!chapter) return { error: `Chapter not found: ${args.id}` };
  return serialize(chapter);
}

export async function listChapters(
  args: { projectId: string },
  db: Db
): Promise<unknown> {
  const chapters = await db
    .collection("chapters")
    .find({ projectId: new ObjectId(args.projectId) })
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
      .find({ projectId: new ObjectId(args.projectId) })
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
  db: Db
): Promise<unknown> {
  const { id, old_string, new_string, append, prepend } = args;
  const field = args.field ?? "content";

  if (!CHAPTER_EDITABLE_FIELDS.includes(field)) {
    return { error: `Invalid field "${field}" for chapter. Allowed: ${CHAPTER_EDITABLE_FIELDS.join(", ")}` };
  }

  const doc = await db.collection("chapters").findOne({ _id: toObjectId(id) });
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
    { _id: toObjectId(id) },
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
  db: Db
): Promise<unknown> {
  const result = await db
    .collection("chapters")
    .findOneAndDelete({ _id: toObjectId(args.id) });
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
  db: Db
): Promise<unknown> {
  const draft = await db
    .collection("drafts")
    .findOne({ _id: toObjectId(args.id) });
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
    createdAt: now,
    updatedAt: now,
  };
  if (userId) doc.userId = userId;
  if (args.projectId) doc.projectId = new ObjectId(args.projectId);
  if (args.worldId) doc.worldId = new ObjectId(args.worldId);
  const result = await db.collection("drafts").insertOne(doc);
  return serialize({ ...doc, _id: result.insertedId });
}

export async function updateDraft(
  args: { id: string; title?: string; content?: string; tags?: string[]; linkedCharacters?: string[]; linkedWorldSettings?: string[] },
  db: Db
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
      { _id: toObjectId(id) },
      { $set: setFields },
      { returnDocument: "after" }
    );
  if (!result) return { error: `Draft not found: ${id}` };
  return serialize(result);
}

export async function deleteDraft(
  args: { id: string },
  db: Db
): Promise<unknown> {
  const result = await db
    .collection("drafts")
    .findOneAndDelete({ _id: toObjectId(args.id) });
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
  db: Db
): Promise<unknown> {
  if (args.projectId) {
    const doc = await db
      .collection("agent_memory")
      .findOne({ projectId: new ObjectId(args.projectId) });
    if (!doc) return { content: "" };
    return { content: doc.content ?? "" };
  }
  if (args.worldId) {
    const doc = await db
      .collection("agent_memory")
      .findOne({ worldId: new ObjectId(args.worldId) });
    if (!doc) return { content: "" };
    return { content: doc.content ?? "" };
  }
  return { content: "" };
}

export async function updateMemory(
  args: { worldId?: string; projectId?: string; content: string; scope?: "world" | "project" },
  db: Db
): Promise<unknown> {
  const now = new Date();
  if (args.scope === "project" && args.projectId) {
    await db.collection("agent_memory").updateOne(
      { projectId: new ObjectId(args.projectId) },
      { $set: { content: args.content, updatedAt: now } },
      { upsert: true }
    );
  } else if (args.worldId) {
    await db.collection("agent_memory").updateOne(
      { worldId: new ObjectId(args.worldId) },
      { $set: { content: args.content, updatedAt: now } },
      { upsert: true }
    );
  } else {
    return { error: "worldId or projectId is required" };
  }
  return { success: true, scope: args.scope ?? "world", updatedAt: now.toISOString() };
}

// ============ Generate Synopsis ============

export async function generateSynopsis(
  args: { chapterId: string },
  db: Db
): Promise<unknown> {
  const chapter = await db
    .collection("chapters")
    .findOne({ _id: toObjectId(args.chapterId) });
  if (!chapter) return { error: `Chapter not found: ${args.chapterId}` };
  return {
    chapterId: chapter._id.toHexString(),
    title: chapter.title,
    order: chapter.order,
    content: chapter.content,
    currentSynopsis: chapter.synopsis ?? "",
  };
}
