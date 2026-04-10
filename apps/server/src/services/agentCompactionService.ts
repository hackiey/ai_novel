import {
  DEFAULT_COMPACTION_PROTECTED_USER_TURNS,
  estimateTokens,
  isOverflow,
  pruneToolResults,
  type CreatorAgentSession,
  type Locale,
  type Message,
  type ModelInfo,
  type TokenUsageInfo,
} from "@ai-creator/agent";
import type { Db } from "mongodb";

const USER_ENTRY_CHAR_LIMIT = 4_000;
const ASSISTANT_ENTRY_CHAR_LIMIT = 6_000;
const TOOL_ENTRY_CHAR_LIMIT = 3_000;

type HistoryDoc = Record<string, any>;

interface StoredCompactionState {
  summary?: string;
  cutoffCreatedAt?: Date;
}

interface StoredUsageState {
  lastContextTokens?: number;
  maxContextTokens?: number;
  lastTotalTokens?: number;
  maxTotalTokens?: number;
  model?: string;
  contextWindow?: number;
  maxTokens?: number;
  inputLimit?: number;
  updatedAt?: Date;
}

function emptyUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function parseOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return undefined;
}

function buildCompactionMessage(locale: Locale, contextTokens: number, modelInfo: ModelInfo): string {
  return locale === "zh"
    ? `已自动压缩较早对话上下文（上一轮 token 用量 ${contextTokens}，模型上下文窗口 ${modelInfo.contextWindow}）。`
    : `Earlier conversation context was compacted automatically (previous turn token usage ${contextTokens}, model context window ${modelInfo.contextWindow}).`;
}

function isMessage(value: unknown): value is Message {
  return typeof value === "object"
    && value !== null
    && "role" in value
    && ((value as { role?: string }).role === "user"
      || (value as { role?: string }).role === "assistant"
      || (value as { role?: string }).role === "toolResult");
}

function truncateText(text: string, limit: number): string {
  const normalized = text.trim();
  if (!normalized || normalized.length <= limit) return normalized;

  const head = Math.ceil(limit * 0.6);
  const tail = Math.max(0, limit - head);
  return `${normalized.slice(0, head)}\n...\n${normalized.slice(-tail)}`;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const lines: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const typedPart = part as Record<string, unknown>;

    if (typedPart.type === "text" && typeof typedPart.text === "string") {
      lines.push(typedPart.text);
      continue;
    }

    if (typedPart.type === "toolCall") {
      const name = typeof typedPart.name === "string" ? typedPart.name : "tool";
      lines.push(`[tool:${name}] ${JSON.stringify(typedPart.arguments ?? {})}`);
    }
  }

  return lines.join("\n").trim();
}

function extractMessageEntries(message: Message): string[] {
  if (message.role === "user") {
    const text = truncateText(extractTextContent(message.content), USER_ENTRY_CHAR_LIMIT);
    return text ? [`User:\n${text}`] : [];
  }

  if (message.role === "assistant") {
    const text = truncateText(extractTextContent(message.content), ASSISTANT_ENTRY_CHAR_LIMIT);
    return text ? [`Assistant:\n${text}`] : [];
  }

  const text = truncateText(extractTextContent(message.content), TOOL_ENTRY_CHAR_LIMIT);
  return text ? [`Tool Result (${message.toolName}):\n${text}`] : [];
}

function buildTranscriptEntries(historyDocs: HistoryDoc[]): string[] {
  const entries: string[] = [];

  for (const doc of historyDocs) {
    if (doc.role === "user") {
      const text = truncateText(typeof doc.content === "string" ? doc.content : "", USER_ENTRY_CHAR_LIMIT);
      if (text) entries.push(`User:\n${text}`);
      continue;
    }

    if (doc.role !== "assistant") continue;

    if (Array.isArray(doc.messages)) {
      const structuredEntries = (doc.messages as unknown[])
        .filter(isMessage)
        .filter((message) => message.role === "assistant" || message.role === "toolResult")
        .flatMap(extractMessageEntries);
      if (structuredEntries.length > 0) {
        entries.push(structuredEntries.join("\n\n"));
        continue;
      }
    }

    const text = truncateText(typeof doc.content === "string" ? doc.content : "", ASSISTANT_ENTRY_CHAR_LIMIT);
    if (text) entries.push(`Assistant:\n${text}`);
  }

  return entries;
}

export function getUsageStateFromEvents(events: Array<Record<string, any>>): StoredUsageState | undefined {
  const usageEvents = events
    .filter((event) => event?.type === "usage" && event.usage && !event.usage.isSummary)
    .map((event) => {
      const usage = event.usage as Record<string, any>;
      const input = parseOptionalNumber(usage.input) ?? 0;
      const output = parseOptionalNumber(usage.output) ?? 0;
      const cacheRead = parseOptionalNumber(usage.cacheRead) ?? 0;
      const cacheWrite = parseOptionalNumber(usage.cacheWrite) ?? 0;
      const totalTokens = parseOptionalNumber(usage.totalTokens) ?? (input + output + cacheRead + cacheWrite);

      return {
        contextTokens: input + cacheRead + cacheWrite,
        totalTokens,
        model: typeof usage.model === "string" ? usage.model : undefined,
      };
    });

  if (usageEvents.length === 0) return undefined;

  const lastUsage = usageEvents[usageEvents.length - 1];
  return {
    lastContextTokens: lastUsage.contextTokens,
    maxContextTokens: usageEvents.reduce((max, item) => Math.max(max, item.contextTokens), 0),
    lastTotalTokens: lastUsage.totalTokens,
    maxTotalTokens: usageEvents.reduce((max, item) => Math.max(max, item.totalTokens), 0),
    model: lastUsage.model,
  };
}

function selectCompactionSlice(historyDocs: HistoryDoc[], protectedUserTurns: number, fallbackCutoff: Date): {
  docsToCompact: HistoryDoc[];
  docsToKeep: HistoryDoc[];
  cutoffCreatedAt: Date;
} | null {
  if (historyDocs.length === 0) return null;

  const userDocIndexes = historyDocs.reduce<number[]>((indexes, doc, index) => {
    if (doc.role === "user") indexes.push(index);
    return indexes;
  }, []);

  for (let keepTurns = protectedUserTurns; keepTurns >= 0; keepTurns -= 1) {
    if (keepTurns === 0) {
      return {
        docsToCompact: historyDocs,
        docsToKeep: [],
        cutoffCreatedAt: fallbackCutoff,
      };
    }

    if (userDocIndexes.length <= keepTurns) continue;

    const boundaryIndex = userDocIndexes[userDocIndexes.length - keepTurns];
    const docsToCompact = historyDocs.slice(0, boundaryIndex);
    if (docsToCompact.length === 0) continue;

    const docsToKeep = historyDocs.slice(boundaryIndex);
    const cutoffCreatedAt = toDate(docsToKeep[0]?.createdAt) ?? fallbackCutoff;
    return { docsToCompact, docsToKeep, cutoffCreatedAt };
  }

  return null;
}

async function compactHistoryDocs(options: {
  session: CreatorAgentSession;
  historyDocs: HistoryDoc[];
  existingSummary?: string;
  locale: Locale;
}): Promise<string> {
  const entries = buildTranscriptEntries(options.historyDocs);
  if (entries.length === 0) {
    return options.existingSummary?.trim() ?? "";
  }

  // Single-shot summarization (no chunking)
  const transcript = entries.join("\n\n");
  const summary = await options.session.compactHistory({
    transcript,
    existingSummary: options.existingSummary,
    locale: options.locale,
  });

  return summary?.trim() ?? "";
}

export function getStoredCompactionState(sessionDoc: Record<string, any> | null | undefined): StoredCompactionState {
  const compaction = sessionDoc?.compaction as Record<string, unknown> | undefined;
  if (!compaction) return {};

  const summary = typeof compaction.summary === "string" && compaction.summary.trim()
    ? compaction.summary.trim()
    : undefined;
  const cutoffCreatedAt = toDate(compaction.cutoffCreatedAt);

  return { summary, cutoffCreatedAt };
}

export function getStoredUsageState(sessionDoc: Record<string, any> | null | undefined): StoredUsageState {
  const usage = sessionDoc?.usage as Record<string, unknown> | undefined;
  if (!usage) return {};

  return {
    lastContextTokens: parseOptionalNumber(usage.lastContextTokens),
    maxContextTokens: parseOptionalNumber(usage.maxContextTokens),
    lastTotalTokens: parseOptionalNumber(usage.lastTotalTokens),
    maxTotalTokens: parseOptionalNumber(usage.maxTotalTokens),
    model: typeof usage.model === "string" ? usage.model : undefined,
    contextWindow: parseOptionalNumber(usage.contextWindow),
    maxTokens: parseOptionalNumber(usage.maxTokens),
    inputLimit: parseOptionalNumber(usage.inputLimit),
    updatedAt: toDate(usage.updatedAt),
  };
}

export function buildHistoryMessages(historyDocs: HistoryDoc[]): Message[] {
  const historyMessages: Message[] = [];

  for (const doc of historyDocs) {
    const createdAt = toDate(doc.createdAt)?.getTime() ?? Date.now();

    if (doc.role === "user") {
      historyMessages.push({
        role: "user",
        content: typeof doc.content === "string" ? doc.content : "",
        timestamp: createdAt,
      });
      continue;
    }

    if (doc.role === "assistant" && Array.isArray(doc.messages)) {
      historyMessages.push(
        ...(doc.messages as unknown[])
          .filter(isMessage)
          .filter((message) => message.role === "assistant" || message.role === "toolResult"),
      );
      continue;
    }

    if (doc.role === "assistant" && typeof doc.content === "string" && doc.content.trim()) {
      historyMessages.push({
        role: "assistant",
        content: [{ type: "text", text: doc.content }],
        api: "openai-completions",
        provider: "legacy",
        model: "legacy-history",
        usage: emptyUsage(),
        stopReason: "stop",
        timestamp: createdAt,
      });
    }
  }

  return historyMessages;
}

export async function maybeCompactHistory(options: {
  db: Db;
  sessionId: string;
  userId: string;
  selectedModel: string;
  session: CreatorAgentSession;
  sessionDoc?: Record<string, any> | null;
  historyDocs: HistoryDoc[];
  currentTurnCreatedAt: Date;
  worldId?: string;
  message: string;
  locale: Locale;
  compactionThreshold?: number;
}): Promise<{
  historyDocs: HistoryDoc[];
  historyMessages: Message[];
  conversationSummary?: string;
  compacted: boolean;
  compactionEvent?: {
    type: "compaction";
    message: string;
    contextTokens: number;
  };
}> {
  const stored = getStoredCompactionState(options.sessionDoc);
  const storedUsage = getStoredUsageState(options.sessionDoc);
  let historyDocs = [...options.historyDocs];
  let historyMessages = buildHistoryMessages(historyDocs);
  let conversationSummary = stored.summary;

  // Get model info for overflow detection
  const modelInfo = options.session.getModelInfo();

  // Build token usage from stored stats (use last turn's total tokens)
  const lastTotalTokens = storedUsage.maxTotalTokens ?? storedUsage.lastTotalTokens;
  if (!lastTotalTokens || historyDocs.length === 0) {
    return {
      historyDocs,
      historyMessages,
      conversationSummary,
      compacted: false,
    };
  }

  // Check overflow: user-configured threshold takes priority, otherwise use model-based detection
  let needsCompaction = false;
  if (options.compactionThreshold && options.compactionThreshold > 0) {
    needsCompaction = lastTotalTokens >= options.compactionThreshold;
  } else {
    const tokenUsage: TokenUsageInfo = {
      input: storedUsage.lastContextTokens ?? 0,
      output: (storedUsage.lastTotalTokens ?? 0) - (storedUsage.lastContextTokens ?? 0),
      cacheRead: 0,
      cacheWrite: 0,
      total: lastTotalTokens,
    };
    needsCompaction = isOverflow(tokenUsage, modelInfo);
  }

  if (!needsCompaction) {
    return {
      historyDocs,
      historyMessages,
      conversationSummary,
      compacted: false,
    };
  }

  // Stage 1: Prune old tool results in-memory
  const pruneResult = pruneToolResults(historyMessages);
  if (pruneResult.prunedTokens > 0) {
    historyMessages = pruneResult.messages;
    console.log("[AgentCompaction] Pruned tool results", {
      sessionId: options.sessionId,
      prunedTokens: pruneResult.prunedTokens,
    });
  }

  // Stage 2: Full compaction — summarize older messages
  const slice = selectCompactionSlice(
    historyDocs,
    DEFAULT_COMPACTION_PROTECTED_USER_TURNS,
    options.currentTurnCreatedAt,
  );
  if (!slice || slice.docsToCompact.length === 0) {
    return {
      historyDocs,
      historyMessages,
      conversationSummary,
      compacted: false,
    };
  }

  const nextSummary = await compactHistoryDocs({
    session: options.session,
    historyDocs: slice.docsToCompact,
    existingSummary: conversationSummary,
    locale: options.locale,
  });
  if (!nextSummary) {
    return {
      historyDocs,
      historyMessages,
      conversationSummary,
      compacted: false,
    };
  }

  conversationSummary = nextSummary;
  historyDocs = slice.docsToKeep;
  // Rebuild messages from remaining docs, then prune again
  historyMessages = buildHistoryMessages(historyDocs);
  const rePrune = pruneToolResults(historyMessages);
  if (rePrune.prunedTokens > 0) {
    historyMessages = rePrune.messages;
  }

  const lastCutoffCreatedAt = slice.cutoffCreatedAt;

  console.log("[AgentCompaction] Compacted session history", {
    sessionId: options.sessionId,
    tokenUsage: lastTotalTokens,
    modelContextWindow: modelInfo.contextWindow,
    remainingHistoryDocs: historyDocs.length,
  });

  await options.db.collection("agent_sessions").updateOne(
    { sessionId: options.sessionId, userId: options.userId },
    {
      $set: {
        compaction: {
          summary: conversationSummary,
          cutoffCreatedAt: lastCutoffCreatedAt,
          tokenUsage: lastTotalTokens,
          modelContextWindow: modelInfo.contextWindow,
          updatedAt: new Date(),
        },
        updatedAt: new Date(),
      },
      $setOnInsert: {
        sessionId: options.sessionId,
        userId: options.userId,
        title: options.message.slice(0, 30) + (options.message.length > 30 ? "..." : ""),
        worldId: options.worldId || "",
        model: options.selectedModel,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );

  const compactionEvent = {
    type: "compaction" as const,
    message: buildCompactionMessage(options.locale, lastTotalTokens, modelInfo),
    contextTokens: lastTotalTokens,
  };

  return {
    historyDocs,
    historyMessages,
    conversationSummary,
    compacted: true,
    compactionEvent,
  };
}
