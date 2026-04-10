export { buildSystemPrompt, buildSystemPromptWithContext } from "./systemPrompt.js";
export {
  compactConversation,
  COMPACTION_BUFFER,
  DEFAULT_COMPACTION_PROTECTED_USER_TURNS,
  estimateContextTokens,
  estimateMessageTokens,
  estimateTokens,
  isOverflow,
  pruneToolResults,
} from "./compaction.js";
export type { ModelInfo, TokenUsageInfo } from "./compaction.js";
export { getModelContextWindowFromSpec, getModelInfoFromSpec, parseModelSpec } from "./modelSpec.js";
export { createNovelTools } from "./tools/index.js";
export type { VectorSearchFn, OnDocumentChangedFn, OnWorldSummaryStaleFn } from "./tools/index.js";
export { CreatorAgentSession } from "./session.js";
export type { AgentEvent, SessionModelConfig } from "./session.js";
export { buildWorldSummary, getOrRefreshWorldSummary } from "./worldSummary.js";
export { computeChapterContentHash, computeChapterSynopsisSourceHash, generateChapterSynopsis } from "./chapterSynopsis.js";
export type {
  ChapterSynopsisModelConfig,
  GenerateChapterSynopsisArgs,
  HistoricalChapterSynopsisContextItem,
  RecentChapterSynopsisContextItem,
} from "./chapterSynopsis.js";
export { resolveLocale, t } from "./i18n.js";
export type { Locale } from "./i18n.js";
export type { Message } from "@mariozechner/pi-ai";
