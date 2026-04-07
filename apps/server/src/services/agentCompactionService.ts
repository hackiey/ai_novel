import {
  DEFAULT_COMPACTION_PROTECTED_USER_TURNS,
  DEFAULT_CONTEXT_COMPACTION_THRESHOLD,
  estimateTokens,
  type CreatorAgentSession,
  type Locale,
  type Message,
} from "@ai-creator/agent";
import type { Db } from "mongodb";

const USER_ENTRY_CHAR_LIMIT = 4_000;
const ASSISTANT_ENTRY_CHAR_LIMIT = 6_000;
const TOOL_ENTRY_CHAR_LIMIT = 3_000;
const MAX_COMPACTION_ATTEMPTS = 3;

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

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
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

function buildCompactionMessage(locale: Locale, contextTokens: number, threshold: number): string {
  return locale === "zh"
    ? `已自动压缩较早对话上下文（上一轮最大上下文 ${contextTokens} tokens，阈值 ${threshold}）。`
    : `Earlier conversation context was compacted automatically (previous max context ${contextTokens} tokens, threshold ${threshold}).`;
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

function chunkTranscriptEntries(entries: string[], chunkBudgetTokens: number): string[][] {
  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const entry of entries) {
    const entryTokens = Math.max(1, estimateTokens(entry));

    if (currentChunk.length > 0 && currentTokens + entryTokens > chunkBudgetTokens) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(entry);
    currentTokens += entryTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
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
  threshold: number;
}): Promise<string> {
  const entries = buildTranscriptEntries(options.historyDocs);
  if (entries.length === 0) {
    return options.existingSummary?.trim() ?? "";
  }

  const chunkBudgetTokens = Math.max(8_000, Math.min(32_000, Math.floor(options.threshold * 0.25)));
  const chunks = chunkTranscriptEntries(entries, chunkBudgetTokens);
  let summary = options.existingSummary?.trim();

  for (const chunk of chunks) {
    summary = await options.session.compactHistory({
      transcript: chunk.join("\n\n"),
      existingSummary: summary,
      locale: options.locale,
    });
  }

  return summary?.trim() ?? "";
}

export function getConfiguredCompactionThreshold(): number {
  return parsePositiveInteger(
    process.env.CONTEXT_COMPACTION_THRESHOLD,
    DEFAULT_CONTEXT_COMPACTION_THRESHOLD,
  );
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
}): Promise<{
  historyDocs: HistoryDoc[];
  historyMessages: Message[];
  conversationSummary?: string;
  threshold: number;
  contextTokens?: number;
  compacted: boolean;
  compactionEvent?: {
    type: "compaction";
    message: string;
    threshold: number;
    contextTokens: number;
  };
}> {
  const stored = getStoredCompactionState(options.sessionDoc);
  const storedUsage = getStoredUsageState(options.sessionDoc);
  let historyDocs = [...options.historyDocs];
  let historyMessages = buildHistoryMessages(historyDocs);
  let conversationSummary = stored.summary;

  const configuredThreshold = getConfiguredCompactionThreshold();
  const threshold = options.session.getContextCompactionThreshold(configuredThreshold);
  const contextTokens = storedUsage.maxContextTokens ?? storedUsage.lastContextTokens;

  if (!contextTokens || contextTokens < threshold || historyDocs.length === 0) {
    return {
      historyDocs,
      historyMessages,
      conversationSummary,
      threshold,
      contextTokens,
      compacted: false,
    };
  }

  let compacted = false;
  let lastCutoffCreatedAt = stored.cutoffCreatedAt ?? options.currentTurnCreatedAt;
  let compactionEvent:
    | {
        type: "compaction";
        message: string;
        threshold: number;
        contextTokens: number;
      }
    | undefined;

  for (let attempt = 0; attempt < MAX_COMPACTION_ATTEMPTS && historyDocs.length > 0; attempt += 1) {
    const slice = selectCompactionSlice(
      historyDocs,
      DEFAULT_COMPACTION_PROTECTED_USER_TURNS,
      options.currentTurnCreatedAt,
    );
    if (!slice || slice.docsToCompact.length === 0) break;

    const nextSummary = await compactHistoryDocs({
      session: options.session,
      historyDocs: slice.docsToCompact,
      existingSummary: conversationSummary,
      locale: options.locale,
      threshold,
    });
    if (!nextSummary) break;

    compacted = true;
    conversationSummary = nextSummary;
    historyDocs = slice.docsToKeep;
    historyMessages = buildHistoryMessages(historyDocs);
    lastCutoffCreatedAt = slice.cutoffCreatedAt;

    compactionEvent = {
      type: "compaction",
      message: buildCompactionMessage(options.locale, contextTokens, threshold),
      threshold,
      contextTokens,
    };

    break;
  }

  if (compacted && conversationSummary) {
    console.log("[AgentCompaction] Compacted session history", {
      sessionId: options.sessionId,
      threshold,
      contextTokens,
      remainingHistoryDocs: historyDocs.length,
    });

    await options.db.collection("agent_sessions").updateOne(
      { sessionId: options.sessionId, userId: options.userId },
      {
        $set: {
          compaction: {
            summary: conversationSummary,
            cutoffCreatedAt: lastCutoffCreatedAt,
            threshold,
            contextTokens,
            modelContextWindow: options.session.getContextWindow(),
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
  }

  return {
    historyDocs,
    historyMessages,
    conversationSummary,
    threshold,
    contextTokens,
    compacted,
    compactionEvent,
  };
}
