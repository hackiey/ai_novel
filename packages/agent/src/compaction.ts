import type { Api, Message, Model, ThinkingLevel, UserMessage } from "@mariozechner/pi-ai";
import { runAgentLoop, type AgentContext, type AgentEvent as PiAgentEvent, type AgentLoopConfig, type AgentMessage } from "@mariozechner/pi-agent-core";
import { t, type Locale } from "./i18n.js";

export const DEFAULT_COMPACTION_PROTECTED_USER_TURNS = 2;
export const COMPACTION_BUFFER = 20_000;
export const PRUNE_MINIMUM = 20_000;
export const PRUNE_PROTECT = 40_000;

const DEFAULT_COMPACTION_MAX_TOKENS = 4_000;
const MESSAGE_OVERHEAD_TOKENS = 12;
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/g;

export interface ModelInfo {
  contextWindow: number;
  maxTokens: number;
  inputLimit?: number;
}

export interface TokenUsageInfo {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total?: number;
}

/**
 * Check if token usage indicates context overflow.
 * Based on OpenCode's approach: compare actual token count against usable context.
 */
export function isOverflow(tokens: TokenUsageInfo, model: ModelInfo): boolean {
  if (model.contextWindow === 0) return false;

  const count = tokens.total
    || (tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite);

  const reserved = Math.min(COMPACTION_BUFFER, model.maxTokens);
  const usable = model.inputLimit
    ? model.inputLimit - reserved
    : model.contextWindow - model.maxTokens;

  return count >= usable;
}

/**
 * Prune old tool result content from message history to reduce context size.
 * Walks backwards through messages, skips last N user turns, then replaces
 * old tool result content with a placeholder once the protection threshold is exceeded.
 */
export function pruneToolResults(
  messages: Message[],
  protectedUserTurns: number = DEFAULT_COMPACTION_PROTECTED_USER_TURNS,
): { messages: Message[]; prunedTokens: number } {
  const result = messages.map((m) => ({ ...m }));
  let userTurns = 0;
  let totalToolTokens = 0;
  let prunedTokens = 0;
  const toPrune: number[] = [];

  // Walk backwards to find tool results beyond protection threshold
  for (let i = result.length - 1; i >= 0; i--) {
    const msg = result[i];
    if (msg.role === "user") userTurns++;
    if (userTurns < protectedUserTurns) continue;

    if (msg.role === "toolResult") {
      const estimate = estimateContentTokens(msg.content);
      totalToolTokens += estimate;
      if (totalToolTokens > PRUNE_PROTECT) {
        prunedTokens += estimate;
        toPrune.push(i);
      }
    }
  }

  if (prunedTokens < PRUNE_MINIMUM) {
    return { messages, prunedTokens: 0 };
  }

  for (const idx of toPrune) {
    const msg = result[idx];
    if (msg.role === "toolResult") {
      result[idx] = {
        ...msg,
        content: [{ type: "text", text: "[Old tool result content cleared]" }],
      };
    }
  }

  return { messages: result, prunedTokens };
}

function estimateContentTokens(content: unknown): number {
  if (typeof content === "string") return estimateTokens(content);
  if (!Array.isArray(content)) return estimateTokens(JSON.stringify(content));

  let total = 0;
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const typedPart = part as Record<string, unknown>;

    switch (typedPart.type) {
      case "text":
        total += estimateTokens(typeof typedPart.text === "string" ? typedPart.text : "");
        break;
      case "thinking":
        total += estimateTokens(typeof typedPart.thinking === "string" ? typedPart.thinking : "");
        break;
      case "toolCall": {
        const name = typeof typedPart.name === "string" ? typedPart.name : "tool";
        total += estimateTokens(`${name}\n${JSON.stringify(typedPart.arguments ?? {})}`);
        break;
      }
      default:
        total += estimateTokens(JSON.stringify(part));
        break;
    }
  }

  return total;
}

function extractAssistantText(message: Message): string {
  if (message.role !== "assistant") return "";

  const lines: string[] = [];
  for (const part of message.content) {
    if (part.type === "text" && part.text) {
      lines.push(part.text);
      continue;
    }

    if (part.type === "toolCall") {
      lines.push(`[tool:${part.name}] ${JSON.stringify(part.arguments)}`);
    }
  }

  return lines.join("\n").trim();
}

export function estimateTokens(text: string): number {
  if (!text) return 0;

  const cjkCount = (text.match(CJK_REGEX) ?? []).length;
  const nonCjk = text.replace(CJK_REGEX, "");

  return Math.ceil(nonCjk.length / 4) + Math.ceil(cjkCount / 2);
}

export function estimateMessageTokens(messages: Message[]): number {
  return messages.reduce((total, message) => {
    if (message.role === "user") {
      return total + estimateContentTokens(message.content) + MESSAGE_OVERHEAD_TOKENS;
    }

    if (message.role === "assistant") {
      return total + estimateContentTokens(message.content) + MESSAGE_OVERHEAD_TOKENS;
    }

    return total + estimateTokens(`${message.toolName}\n`) + estimateContentTokens(message.content) + MESSAGE_OVERHEAD_TOKENS;
  }, 0);
}

export function estimateContextTokens(input: {
  systemPrompt?: string;
  messages?: Message[];
  userMessage?: string;
  extras?: string[];
}): number {
  return estimateTokens(input.systemPrompt ?? "")
    + estimateTokens(input.userMessage ?? "")
    + estimateMessageTokens(input.messages ?? [])
    + (input.extras ?? []).reduce((total, item) => total + estimateTokens(item), 0);
}

function assistantTextFromMessages(messages: Message[]): string {
  const assistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  return assistantMessage ? extractAssistantText(assistantMessage) : "";
}

export async function compactConversation(options: {
  apiKey: string;
  model: Model<Api>;
  reasoning?: ThinkingLevel;
  transcript: string;
  existingSummary?: string;
  locale?: Locale;
}): Promise<string> {
  const locale = options.locale ?? "zh";
  const texts = t(locale);
  const userMessage: UserMessage = {
    role: "user",
    content: texts.compactionUserPrompt(options.transcript, options.existingSummary),
    timestamp: Date.now(),
  };

  const context: AgentContext = {
    systemPrompt: texts.compactionSystemPrompt,
    messages: [],
    tools: [],
  };

  const eventQueue: PiAgentEvent[] = [];
  let resolveWaiting: (() => void) | null = null;
  let loopDone = false;
  let loopError: Error | null = null;
  let fullResponse = "";
  let finalMessages: Message[] = [];

  const config: AgentLoopConfig = {
    model: options.model,
    apiKey: options.apiKey,
    maxTokens: Math.min(
      DEFAULT_COMPACTION_MAX_TOKENS,
      Math.max(512, options.model.maxTokens || DEFAULT_COMPACTION_MAX_TOKENS),
    ),
    reasoning: options.reasoning,
    convertToLlm: (messages: AgentMessage[]) => messages.filter((message): message is Message =>
      typeof message === "object"
        && message !== null
        && "role" in message
        && (message.role === "user" || message.role === "assistant" || message.role === "toolResult")
    ),
  };

  const emit = (event: PiAgentEvent) => {
    eventQueue.push(event);
    if (resolveWaiting) {
      resolveWaiting();
      resolveWaiting = null;
    }
  };

  runAgentLoop([userMessage], context, config, emit, new AbortController().signal)
    .then(() => {
      loopDone = true;
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    })
    .catch((error) => {
      loopError = error instanceof Error ? error : new Error(String(error));
      loopDone = true;
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    });

  while (true) {
    while (eventQueue.length > 0) {
      const event = eventQueue.shift()!;

      if (event.type === "message_update") {
        const assistantEvent = event.assistantMessageEvent;
        if (assistantEvent.type === "text_delta") {
          fullResponse += assistantEvent.delta;
        }
        continue;
      }

      if (event.type === "agent_end") {
        finalMessages = event.messages.filter((message): message is Message =>
          typeof message === "object"
            && message !== null
            && "role" in message
            && (message.role === "user" || message.role === "assistant" || message.role === "toolResult")
        );
      }
    }

    if (loopDone) break;

    await new Promise<void>((resolve) => {
      resolveWaiting = resolve;
    });
  }

  if (loopError) throw loopError;

  const summary = fullResponse.trim() || assistantTextFromMessages(finalMessages).trim();
  if (!summary) throw new Error("Compaction agent returned an empty summary");
  return summary;
}
