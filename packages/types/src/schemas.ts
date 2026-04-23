import { z } from "zod";

// ============ Common ============

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId");

export const timestampsSchema = z.object({
  createdAt: z.date(),
  updatedAt: z.date(),
});

// ============ User Role ============

export const userRoleSchema = z.enum(["admin", "user"]);
export type UserRole = z.infer<typeof userRoleSchema>;

// ============ Permission Group (权限组) ============

export const permissionGroupSchema = z.object({
  _id: objectIdSchema,
  name: z.string().min(1).max(100),
  allowedModels: z.array(z.string()).default([]),
  ...timestampsSchema.shape,
});

export const createPermissionGroupSchema = z.object({
  name: z.string().min(1).max(100),
  allowedModels: z.array(z.string()).optional(),
});

export const updatePermissionGroupSchema = createPermissionGroupSchema.partial();

export type PermissionGroup = z.infer<typeof permissionGroupSchema>;
export type CreatePermissionGroup = z.infer<typeof createPermissionGroupSchema>;
export type UpdatePermissionGroup = z.infer<typeof updatePermissionGroupSchema>;

// ============ User (用户) ============

export const userSchema = z.object({
  _id: objectIdSchema,
  email: z.string().email(),
  passwordHash: z.string(),
  displayName: z.string().min(1).max(100),
  role: userRoleSchema.default("user"),
  permissionGroupId: objectIdSchema.optional(),
  ...timestampsSchema.shape,
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(100),
  displayName: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type User = z.infer<typeof userSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// ============ World (世界观) ============

export const worldSchema = z.object({
  _id: objectIdSchema,
  userId: objectIdSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  summary: z.string().default(""),
  summaryStale: z.boolean().default(true),
  summaryConfig: z.object({
    fullSummaryMaxItems: z.number().default(500),
  }).default({}),
  // Skill identifiers stored as slugs (stable across re-imports of builtin
  // skills, unlike Mongo ObjectIds which can change).
  enabledSkillSlugs: z.array(z.string()).default([]),
  ...timestampsSchema.shape,
});

export const createWorldSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export const updateWorldSchema = createWorldSchema.partial().extend({
  enabledSkillSlugs: z.array(z.string()).optional(),
});

export type World = z.infer<typeof worldSchema>;
export type CreateWorld = z.infer<typeof createWorldSchema>;
export type UpdateWorld = z.infer<typeof updateWorldSchema>;

// ============ Project ============

export const projectSchema = z.object({
  _id: objectIdSchema,
  userId: objectIdSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  worldId: objectIdSchema.optional(),
  settings: z.object({
    genre: z.string().max(100).default(""),
    targetLength: z.number().int().positive().optional(),
  }).default({}),
  // See worldSchema.enabledSkillSlugs note.
  enabledSkillSlugs: z.array(z.string()).default([]),
  // skillsInitialized / skillsRecommendEnabled were previously stored on the project;
  // both are now obsolete — initialization is implicit and recommendation toggling lives
  // in the browser's localStorage (see apps/web/src/lib/skillsRecommendPref.ts). Old
  // documents may still carry these fields; Zod strips them silently.
  ...timestampsSchema.shape,
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  worldId: objectIdSchema.optional(),
  settings: z.object({
    genre: z.string().max(100).optional(),
    targetLength: z.number().int().positive().optional(),
  }).optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  enabledSkillSlugs: z.array(z.string()).optional(),
});

export type Project = z.infer<typeof projectSchema>;
export type CreateProject = z.infer<typeof createProjectSchema>;
export type UpdateProject = z.infer<typeof updateProjectSchema>;

// ============ Character (角色人设) ============

export const importanceSchema = z.enum(["core", "major", "minor"]);

export const characterSchema = z.object({
  _id: objectIdSchema,
  userId: objectIdSchema,
  worldId: objectIdSchema,
  name: z.string().min(1).max(200),
  aliases: z.array(z.string().max(200)).default([]),
  tags: z.array(z.string().max(100)).default([]),
  importance: importanceSchema.default("minor"),
  summary: z.string().max(100).default(""),
  content: z.string().max(20000).default(""),
  embedding: z.array(z.number()).optional(),
  embeddingText: z.string().optional(),
  ...timestampsSchema.shape,
});

export const createCharacterSchema = z.object({
  worldId: objectIdSchema,
  name: z.string().min(1).max(200),
  aliases: z.array(z.string().max(200)).optional(),
  tags: z.array(z.string().max(100)).optional(),
  importance: importanceSchema.optional(),
  summary: z.string().max(100).optional(),
  content: z.string().max(20000).optional(),
});

export const updateCharacterSchema = createCharacterSchema.omit({ worldId: true }).partial();

export type Character = z.infer<typeof characterSchema>;
export type CreateCharacter = z.infer<typeof createCharacterSchema>;
export type UpdateCharacter = z.infer<typeof updateCharacterSchema>;

// ============ World Setting (世界观) ============

export const worldSettingSchema = z.object({
  _id: objectIdSchema,
  userId: objectIdSchema,
  worldId: objectIdSchema,
  category: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  content: z.string().max(50000).default(""),
  tags: z.array(z.string().max(100)).default([]),
  importance: importanceSchema.default("minor"),
  summary: z.string().max(100).default(""),
  embedding: z.array(z.number()).optional(),
  embeddingText: z.string().optional(),
  ...timestampsSchema.shape,
});

export const createWorldSettingSchema = z.object({
  worldId: objectIdSchema,
  category: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  content: z.string().max(50000).optional(),
  tags: z.array(z.string().max(100)).optional(),
  importance: importanceSchema.optional(),
  summary: z.string().max(100).optional(),
});

export const updateWorldSettingSchema = createWorldSettingSchema.omit({ worldId: true }).partial();

export type WorldSetting = z.infer<typeof worldSettingSchema>;
export type CreateWorldSetting = z.infer<typeof createWorldSettingSchema>;
export type UpdateWorldSetting = z.infer<typeof updateWorldSettingSchema>;

// ============ Draft (草稿) ============

export const draftSchema = z.object({
  _id: objectIdSchema,
  userId: objectIdSchema,
  projectId: objectIdSchema.optional(),
  worldId: objectIdSchema.optional(),
  title: z.string().min(1).max(200),
  content: z.string().max(50000).default(""),
  tags: z.array(z.string().max(100)).default([]),
  linkedCharacters: z.array(objectIdSchema).default([]),
  linkedWorldSettings: z.array(objectIdSchema).default([]),
  embedding: z.array(z.number()).optional(),
  embeddingText: z.string().optional(),
  ...timestampsSchema.shape,
});

export const createDraftSchema = z.object({
  projectId: objectIdSchema.optional(),
  worldId: objectIdSchema.optional(),
  title: z.string().min(1).max(200),
  content: z.string().max(50000).optional(),
  tags: z.array(z.string().max(100)).optional(),
  linkedCharacters: z.array(objectIdSchema).optional(),
  linkedWorldSettings: z.array(objectIdSchema).optional(),
});

export const updateDraftSchema = createDraftSchema.omit({ projectId: true }).partial();

export type Draft = z.infer<typeof draftSchema>;
export type CreateDraft = z.infer<typeof createDraftSchema>;
export type UpdateDraft = z.infer<typeof updateDraftSchema>;

// ============ Chapter (章节) ============

export const chapterStatusSchema = z.enum(["draft", "revision", "final"]);
export const synopsisStatusSchema = z.enum(["pending", "processing", "ready", "error"]);

export const chapterSchema = z.object({
  _id: objectIdSchema,
  userId: objectIdSchema,
  projectId: objectIdSchema,
  order: z.number().int().nonnegative(),
  title: z.string().min(1).max(200),
  content: z.string().default(""),
  synopsis: z.string().default(""),
  synopsisSourceHash: z.string().optional(),
  synopsisStatus: synopsisStatusSchema.optional(),
  synopsisUpdatedAt: z.date().optional(),
  synopsisLastAttemptAt: z.date().optional(),
  synopsisError: z.string().optional(),
  synopsisJobLockedAt: z.date().optional(),
  synopsisJobToken: z.string().optional(),
  wordCount: z.number().int().nonnegative().default(0),
  status: chapterStatusSchema.default("draft"),
  embedding: z.array(z.number()).optional(),
  embeddingText: z.string().optional(),
  ...timestampsSchema.shape,
});

export const createChapterSchema = z.object({
  projectId: objectIdSchema,
  order: z.number().int().nonnegative().optional(),
  title: z.string().min(1).max(200),
  content: z.string().optional(),
  synopsis: z.string().optional(),
  status: chapterStatusSchema.optional(),
});

export const updateChapterSchema = createChapterSchema.omit({ projectId: true }).partial();

export type Chapter = z.infer<typeof chapterSchema>;
export type CreateChapter = z.infer<typeof createChapterSchema>;
export type UpdateChapter = z.infer<typeof updateChapterSchema>;

// ============ Share (分享) ============

export const shareThemeSchema = z.enum(["rain", "starfield"]);
export const shareFontSchema = z.enum([
  "default", "longcang", "liujianmaocao", "zhimangxing", "mashanzheng",
  "zcoolkuaile", "zcoolqingkehuangyou", "zcoolxiaowei", "xiaolai", "neoxihei", "markergothic",
]);

export const shareSchema = z.object({
  _id: objectIdSchema,
  userId: objectIdSchema,
  projectId: objectIdSchema,
  shareToken: z.string().min(8).max(32),
  includedChapterIds: z.array(objectIdSchema).default([]),
  theme: shareThemeSchema.default("starfield"),
  font: shareFontSchema.default("default"),
  isActive: z.boolean().default(true),
  ...timestampsSchema.shape,
});

export const createShareSchema = z.object({
  projectId: objectIdSchema,
  includedChapterIds: z.array(objectIdSchema).optional(),
  theme: shareThemeSchema.optional(),
  font: shareFontSchema.optional(),
});

export const updateShareSchema = z.object({
  includedChapterIds: z.array(objectIdSchema).optional(),
  theme: shareThemeSchema.optional(),
  font: shareFontSchema.optional(),
  isActive: z.boolean().optional(),
});

export type Share = z.infer<typeof shareSchema>;
export type CreateShare = z.infer<typeof createShareSchema>;
export type UpdateShare = z.infer<typeof updateShareSchema>;

// ============ Embedding Chunks ============

export const embeddingChunkSchema = z.object({
  _id: objectIdSchema,
  sourceId: objectIdSchema,
  sourceCollection: z.enum(["characters", "world_settings", "drafts", "chapters"]),
  projectId: objectIdSchema.optional(),
  worldId: objectIdSchema.optional(),
  chunkIndex: z.number().int().nonnegative(),
  text: z.string(),
  embedding: z.array(z.number()),
});

export type EmbeddingChunk = z.infer<typeof embeddingChunkSchema>;

// ============ File Import (断点续传) ============

export const fileImportSchema = z.object({
  _id: objectIdSchema,
  userId: objectIdSchema,
  worldId: objectIdSchema,
  fileHash: z.string(),
  fileName: z.string(),
  fileSize: z.number().int(),
  totalChunks: z.number().int(),
  completedChunks: z.array(z.number().int()),
  status: z.enum(["in_progress", "completed"]),
  ...timestampsSchema.shape,
});

export type FileImport = z.infer<typeof fileImportSchema>;

// ============ Agent Session ============

export const agentSessionSchema = z.object({
  _id: objectIdSchema,
  userId: objectIdSchema,
  projectId: objectIdSchema,
  sessionId: z.string(),
  title: z.string().max(200).default(""),
  ...timestampsSchema.shape,
});

export const createAgentSessionSchema = z.object({
  projectId: objectIdSchema,
  title: z.string().max(200).optional(),
});

export type AgentSession = z.infer<typeof agentSessionSchema>;
export type CreateAgentSession = z.infer<typeof createAgentSessionSchema>;

// ============ Search ============

export const searchScopeSchema = z.enum(["character", "world", "draft", "chapter"]);

export const searchInputSchema = z.object({
  projectId: objectIdSchema.optional(),
  worldId: objectIdSchema.optional(),
  query: z.string().min(1),
  scope: z.array(searchScopeSchema).optional(),
  limit: z.number().int().min(1).max(50).default(5),
});

export const searchResultSchema = z.object({
  id: objectIdSchema,
  collection: searchScopeSchema,
  title: z.string(),
  excerpt: z.string(),
  score: z.number(),
});

export type SearchInput = z.infer<typeof searchInputSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;

// ============ Skill ============

export const skillSchema = z.object({
  _id: objectIdSchema,
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  description: z.string(),
  content: z.string(),
  tags: z.array(z.string().max(50)).default([]),
  isBuiltin: z.boolean().default(false),
  isPublished: z.boolean().default(false),
  authorId: objectIdSchema.optional(),
  builtinHash: z.string().optional(),
  ...timestampsSchema.shape,
});

export const createSkillSchema = z.object({
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  description: z.string(),
  content: z.string(),
  tags: z.array(z.string().max(50)).optional(),
});

export const updateSkillSchema = createSkillSchema.partial();

export type Skill = z.infer<typeof skillSchema>;
export type CreateSkill = z.infer<typeof createSkillSchema>;
export type UpdateSkill = z.infer<typeof updateSkillSchema>;
