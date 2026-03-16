import { Db, ObjectId } from "mongodb";

// Helper to convert string ID to ObjectId safely
function toObjectId(id: string): ObjectId {
  return new ObjectId(id);
}

// Helper to serialize MongoDB documents (convert ObjectId to string)
function serialize(doc: unknown): unknown {
  if (doc === null || doc === undefined) return doc;
  if (doc instanceof ObjectId) return doc.toHexString();
  if (doc instanceof Date) return doc.toISOString();
  if (Array.isArray(doc)) return doc.map(serialize);
  if (typeof doc === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(doc as Record<string, unknown>)) {
      result[key] = serialize(value);
    }
    return result;
  }
  return doc;
}

// ============ Semantic Search ============

export async function semanticSearch(
  args: { projectId?: string; worldId?: string; query: string; scope?: string[]; limit?: number },
  db: Db
): Promise<unknown> {
  const { query, limit = 5 } = args;
  const scope = args.scope ?? ["character", "world", "draft", "chapter"];
  const regex = { $regex: query, $options: "i" };
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
          { "profile.appearance": regex },
          { "profile.personality": regex },
          { "profile.background": regex },
          { "profile.goals": regex },
          { aliases: regex },
        ],
      })
      .limit(limit)
      .toArray();

    for (const c of characters) {
      results.push({
        collection: "character",
        title: c.name,
        excerpt: [c.profile?.personality, c.profile?.background]
          .filter(Boolean)
          .join(" ")
          .slice(0, 200),
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
        excerpt: (w.content ?? "").slice(0, 200),
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

export async function listCharacters(
  args: { worldId?: string; projectId?: string },
  db: Db
): Promise<unknown> {
  const filter: Record<string, unknown> = {};
  if (args.worldId) filter.worldId = new ObjectId(args.worldId);
  else if (args.projectId) filter.projectId = new ObjectId(args.projectId);
  const characters = await db
    .collection("characters")
    .find(filter)
    .sort({ name: 1 })
    .toArray();
  return serialize(characters);
}

export async function createCharacter(
  args: { worldId?: string; projectId?: string; name: string; role?: string; aliases?: string[]; profile?: Record<string, unknown> },
  db: Db
): Promise<unknown> {
  const now = new Date();
  const ownerId = args.worldId || args.projectId;
  if (!ownerId) return { error: "worldId or projectId is required" };
  const ownerField = args.worldId ? "worldId" : "projectId";
  const doc: Record<string, unknown> = {
    [ownerField]: new ObjectId(ownerId),
    name: args.name,
    aliases: args.aliases ?? [],
    role: args.role ?? "other",
    profile: {
      appearance: "",
      personality: "",
      background: "",
      goals: "",
      relationships: [],
      customFields: {},
      ...(args.profile ?? {}),
    },
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection("characters").insertOne(doc);
  return serialize({ ...doc, _id: result.insertedId });
}

export async function updateCharacter(
  args: { id: string; name?: string; role?: string; aliases?: string[]; profile?: Record<string, unknown> },
  db: Db
): Promise<unknown> {
  const { id, ...updates } = args;
  const setFields: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.name !== undefined) setFields.name = updates.name;
  if (updates.role !== undefined) setFields.role = updates.role;
  if (updates.aliases !== undefined) setFields.aliases = updates.aliases;

  // For profile, merge subfields rather than replacing the whole profile
  if (updates.profile) {
    for (const [key, value] of Object.entries(updates.profile)) {
      setFields[`profile.${key}`] = value;
    }
  }

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
  const setting = await db
    .collection("world_settings")
    .findOne({ _id: toObjectId(args.id) });
  if (!setting) return { error: `World setting not found: ${args.id}` };
  return serialize(setting);
}

export async function listWorldSettings(
  args: { worldId?: string; projectId?: string; category?: string },
  db: Db
): Promise<unknown> {
  const filter: Record<string, unknown> = {};
  if (args.worldId) filter.worldId = new ObjectId(args.worldId);
  else if (args.projectId) filter.projectId = new ObjectId(args.projectId);
  if (args.category) filter.category = args.category;

  const settings = await db
    .collection("world_settings")
    .find(filter)
    .sort({ category: 1, title: 1 })
    .toArray();
  return serialize(settings);
}

export async function createWorldSetting(
  args: { worldId?: string; projectId?: string; category: string; title: string; content?: string; tags?: string[] },
  db: Db
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
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection("world_settings").insertOne(doc);
  return serialize({ ...doc, _id: result.insertedId });
}

export async function updateWorldSetting(
  args: { id: string; category?: string; title?: string; content?: string; tags?: string[] },
  db: Db
): Promise<unknown> {
  const { id, ...updates } = args;
  const setFields: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.category !== undefined) setFields.category = updates.category;
  if (updates.title !== undefined) setFields.title = updates.title;
  if (updates.content !== undefined) setFields.content = updates.content;
  if (updates.tags !== undefined) setFields.tags = updates.tags;

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
  return serialize(chapters);
}

export async function createChapter(
  args: { projectId: string; title: string; content?: string; synopsis?: string; order?: number },
  db: Db
): Promise<unknown> {
  const now = new Date();
  const content = args.content ?? "";

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

  const doc = {
    projectId: new ObjectId(args.projectId),
    order,
    title: args.title,
    content,
    synopsis: args.synopsis ?? "",
    wordCount: content.length,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection("chapters").insertOne(doc);
  return serialize({ ...doc, _id: result.insertedId });
}

export async function continueWriting(
  args: { chapterId: string; instructions?: string; wordCount?: number },
  db: Db
): Promise<unknown> {
  const { chapterId, instructions, wordCount = 500 } = args;

  // Get the target chapter
  const chapter = await db
    .collection("chapters")
    .findOne({ _id: toObjectId(chapterId) });
  if (!chapter) return { error: `Chapter not found: ${chapterId}` };

  // Get previous 2 chapters for context
  const prevChapters = await db
    .collection("chapters")
    .find({
      projectId: chapter.projectId,
      order: { $lt: chapter.order },
    })
    .sort({ order: -1 })
    .limit(2)
    .toArray();

  // Build context
  const context: Record<string, unknown> = {
    currentChapter: {
      id: chapter._id.toHexString(),
      title: chapter.title,
      order: chapter.order,
      content: chapter.content,
      wordCount: chapter.wordCount,
      status: chapter.status,
    },
    previousChapters: prevChapters.reverse().map((ch) => ({
      title: ch.title,
      order: ch.order,
      synopsis: ch.synopsis || (ch.content ?? "").slice(-1000),
    })),
    instructions: instructions ?? "请自然地续写下去",
    targetWordCount: wordCount,
  };

  return context;
}

export async function updateChapter(
  args: { id: string; title?: string; content?: string; synopsis?: string; status?: string; order?: number },
  db: Db
): Promise<unknown> {
  const { id, ...updates } = args;
  const setFields: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.title !== undefined) setFields.title = updates.title;
  if (updates.content !== undefined) {
    setFields.content = updates.content;
    setFields.wordCount = updates.content.length;
  }
  if (updates.synopsis !== undefined) setFields.synopsis = updates.synopsis;
  if (updates.status !== undefined) setFields.status = updates.status;
  if (updates.order !== undefined) setFields.order = updates.order;

  const result = await db
    .collection("chapters")
    .findOneAndUpdate(
      { _id: toObjectId(id) },
      { $set: setFields },
      { returnDocument: "after" }
    );
  if (!result) return { error: `Chapter not found: ${id}` };
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
  db: Db
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
  if (args.projectId) doc.projectId = new ObjectId(args.projectId);
  if (args.worldId) doc.worldId = new ObjectId(args.worldId);
  const result = await db.collection("drafts").insertOne(doc);
  return serialize({ ...doc, _id: result.insertedId });
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
  args: { worldId: string },
  db: Db
): Promise<unknown> {
  const doc = await db
    .collection("agent_memory")
    .findOne({ worldId: new ObjectId(args.worldId) });
  if (!doc) return { content: "" };
  return { content: doc.content ?? "" };
}

export async function updateMemory(
  args: { worldId: string; content: string },
  db: Db
): Promise<unknown> {
  const now = new Date();
  await db.collection("agent_memory").updateOne(
    { worldId: new ObjectId(args.worldId) },
    { $set: { content: args.content, updatedAt: now } },
    { upsert: true }
  );
  return { success: true, updatedAt: now.toISOString() };
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
