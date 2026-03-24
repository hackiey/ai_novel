import { getModel, type Model, type Api, type UserMessage, type Message, type SimpleStreamOptions, type ThinkingLevel } from "@mariozechner/pi-ai";
import { runAgentLoop, type AgentContext, type AgentEvent as PiAgentEvent, type AgentLoopConfig, type AgentMessage } from "@mariozechner/pi-agent-core";
import type { Db } from "mongodb";
import { buildSystemPromptWithHistory } from "./systemPrompt.js";
import type { HistoryMessage } from "./systemPrompt.js";
import { createNovelTools } from "./tools/index.js";
import type { VectorSearchFn, OnDocumentChangedFn, OnWorldSummaryStaleFn } from "./tools/index.js";
import type { Locale } from "./i18n.js";

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; toolName: string; toolInput: unknown }
  | { type: "tool_result"; toolName?: string; result: unknown }
  | { type: "done"; fullResponse: string }
  | { type: "error"; error: string };

export interface SessionModelConfig {
  provider: string;
  modelId: string;
}

export class NovelAgentSession {
  private model: Model<any>;
  private db: Db;
  private projectId: string;
  private worldId?: string;
  private userId?: string;
  private apiKey: string;
  private reasoning?: "minimal" | "low" | "medium" | "high" | "xhigh";
  private abortController?: AbortController;
  private vectorSearchFn?: VectorSearchFn;
  private onDocumentChanged?: OnDocumentChangedFn;
  private onWorldSummaryStale?: OnWorldSummaryStaleFn;

  constructor(options: {
    apiKey: string;
    provider: string;
    modelId: string;
    baseURL?: string;
    reasoning?: "minimal" | "low" | "medium" | "high" | "xhigh";
    db: Db;
    projectId: string;
    worldId?: string;
    userId?: string;
    vectorSearchFn?: VectorSearchFn;
    onDocumentChanged?: OnDocumentChangedFn;
    onWorldSummaryStale?: OnWorldSummaryStaleFn;
  }) {
    this.apiKey = options.apiKey;
    const model = getModel(options.provider as any, options.modelId as any);
    if (options.baseURL) {
      model.baseUrl = options.baseURL;
    }
    this.model = model;
    this.reasoning = options.reasoning;
    this.db = options.db;
    this.projectId = options.projectId;
    this.worldId = options.worldId;
    this.userId = options.userId;
    this.vectorSearchFn = options.vectorSearchFn;
    this.onDocumentChanged = options.onDocumentChanged;
    this.onWorldSummaryStale = options.onWorldSummaryStale;
  }

  async *chat(userMessage: string, history?: HistoryMessage[], memory?: string, worldSummary?: string, locale: Locale = "zh", projectMemory?: string): AsyncGenerator<AgentEvent> {
    const systemPrompt = buildSystemPromptWithHistory(
      this.projectId,
      this.worldId,
      history,
      memory,
      worldSummary,
      locale,
      projectMemory,
    );

    const tools = createNovelTools(this.db, this.vectorSearchFn, this.onDocumentChanged, this.userId, this.onWorldSummaryStale, locale, this.worldId, this.projectId);

    const abortController = new AbortController();
    this.abortController = abortController;

    let fullResponse = "";

    // Collect events from the agent loop via the emit callback
    const eventQueue: PiAgentEvent[] = [];
    let resolveWaiting: (() => void) | null = null;
    let loopDone = false;
    let loopError: Error | null = null;

    const userMsg: UserMessage = {
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
    };

    const context: AgentContext = {
      systemPrompt,
      messages: [],
      tools,
    };

    const apiKey = this.apiKey;
    const config: AgentLoopConfig = {
      model: this.model,
      apiKey,
      maxTokens: 8192,
      reasoning: this.reasoning,
      convertToLlm: (messages: AgentMessage[]) => {
        return messages.filter((m): m is Message =>
          typeof m === "object" && m !== null && "role" in m &&
          (m.role === "user" || m.role === "assistant" || m.role === "toolResult")
        );
      },
    };

    const emit = (event: PiAgentEvent) => {
      eventQueue.push(event);
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    };

    // Start the agent loop in the background
    const loopPromise = runAgentLoop(
      [userMsg],
      context,
      config,
      emit,
      abortController.signal,
    ).then(() => {
      loopDone = true;
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    }).catch((err) => {
      loopError = err instanceof Error ? err : new Error(String(err));
      loopDone = true;
      if (resolveWaiting) {
        resolveWaiting();
        resolveWaiting = null;
      }
    });

    try {
      while (true) {
        // Process all queued events
        while (eventQueue.length > 0) {
          const event = eventQueue.shift()!;

          if (event.type === "message_update") {
            const ame = event.assistantMessageEvent;
            if (ame.type === "text_delta") {
              fullResponse += ame.delta;
              yield { type: "text", text: ame.delta };
            }
          } else if (event.type === "tool_execution_start") {
            yield {
              type: "tool_use",
              toolName: event.toolName,
              toolInput: event.args,
            };
          } else if (event.type === "tool_execution_end") {
            yield {
              type: "tool_result",
              toolName: event.toolName,
              result: event.result,
            };
          } else if (event.type === "agent_end") {
            // Agent loop completed
          }
        }

        if (loopDone) break;

        // Wait for more events
        await new Promise<void>((resolve) => {
          resolveWaiting = resolve;
        });
      }

      if (loopError) {
        const err = loopError as Error;
        console.error("[AgentSession] chat error:", err.message);
        yield { type: "error", error: err.message };
      }

      this.abortController = undefined;
      yield { type: "done", fullResponse };
    } catch (err) {
      this.abortController = undefined;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[AgentSession] chat error:", errorMessage);
      yield { type: "error", error: errorMessage };
    }
  }

  close(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
  }
}
