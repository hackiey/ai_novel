import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Db } from "mongodb";
import { buildSystemPromptWithHistory } from "./systemPrompt.js";
import type { HistoryMessage } from "./systemPrompt.js";
import { createNovelToolsServer } from "./tools/index.js";
import type { VectorSearchFn, OnDocumentChangedFn, OnWorldSummaryStaleFn } from "./tools/index.js";
import type { Locale } from "./i18n.js";

const DEFAULT_MODEL = "claude-sonnet-4-6-20250514";

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; toolName: string; toolInput: unknown }
  | { type: "tool_result"; toolName?: string; result: unknown }
  | { type: "done"; fullResponse: string }
  | { type: "error"; error: string };

export class NovelAgentSession {
  private model: string;
  private db: Db;
  private projectId: string;
  private worldId?: string;
  private userId?: string;
  private apiKey: string;
  private baseURL?: string;
  private abortController?: AbortController;
  private vectorSearchFn?: VectorSearchFn;
  private onDocumentChanged?: OnDocumentChangedFn;
  private onWorldSummaryStale?: OnWorldSummaryStaleFn;

  constructor(options: {
    apiKey: string;
    baseURL?: string;
    model?: string;
    db: Db;
    projectId: string;
    worldId?: string;
    userId?: string;
    vectorSearchFn?: VectorSearchFn;
    onDocumentChanged?: OnDocumentChangedFn;
    onWorldSummaryStale?: OnWorldSummaryStaleFn;
  }) {
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL;
    this.model = options.model || DEFAULT_MODEL;
    this.db = options.db;
    this.projectId = options.projectId;
    this.worldId = options.worldId;
    this.userId = options.userId;
    this.vectorSearchFn = options.vectorSearchFn;
    this.onDocumentChanged = options.onDocumentChanged;
    this.onWorldSummaryStale = options.onWorldSummaryStale;
  }

  async *chat(userMessage: string, history?: HistoryMessage[], memory?: string, worldSummary?: string, locale: Locale = "zh"): AsyncGenerator<AgentEvent> {
    const env: Record<string, string | undefined> = {
      ...process.env,
      ANTHROPIC_API_KEY: this.apiKey,
    };
    if (this.baseURL) {
      env.ANTHROPIC_BASE_URL = this.baseURL;
    }

    const systemPrompt = buildSystemPromptWithHistory(
      this.projectId,
      this.worldId,
      history,
      memory,
      worldSummary,
      locale,
    );

    const novelToolsServer = createNovelToolsServer(this.db, this.vectorSearchFn, this.onDocumentChanged, this.userId, this.onWorldSummaryStale, locale, this.worldId, this.projectId);
    const abortController = new AbortController();
    this.abortController = abortController;

    let fullResponse = "";

    try {
      const q = query({
        prompt: userMessage,
        options: {
          model: this.model,
          systemPrompt,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          mcpServers: {
            "novel-tools": novelToolsServer,
          },
          tools: [],
          allowedTools: ["mcp__novel-tools__*"],
          maxTurns: 20,
          env,
          abortController,
          persistSession: false,
        },
      });

      for await (const message of q) {
        // Skip system init messages
        if (message.type === "system") {
          console.log("[AgentSession] system message received");
          continue;
        }
        console.log("[AgentSession] message type:", message.type, message.type === "assistant" ? `content blocks: ${JSON.stringify(message.message.content.map((b: any) => ({ type: b.type, len: b.text?.length })))}` : message.type === "result" ? `subtype: ${(message as any).subtype}` : "");

        // Handle assistant messages (text + tool_use blocks)
        if (message.type === "assistant") {
          console.log("[AgentSession] processing assistant, blocks:", message.message.content.length);
          for (const block of message.message.content) {
            console.log("[AgentSession] block type:", block.type);
            if (block.type === "text") {
              fullResponse += block.text;
              console.log("[AgentSession] yielding text event:", block.text.substring(0, 50));
              yield { type: "text", text: block.text };
              console.log("[AgentSession] text event yielded successfully");
            } else if (block.type === "tool_use") {
              yield {
                type: "tool_use",
                toolName: block.name,
                toolInput: block.input,
              };
            }
          }
          continue;
        }

        // Handle user messages (tool results)
        if (message.type === "user") {
          const userMsg = message as any;
          // Check message content for tool_result blocks
          let yielded = false;
          const content = userMsg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "tool_result") {
                const resultContent = Array.isArray(block.content)
                  ? block.content.map((c: any) => c.text || "").join("")
                  : typeof block.content === "string" ? block.content : JSON.stringify(block.content);
                yield {
                  type: "tool_result" as const,
                  result: resultContent,
                };
                yielded = true;
              }
            }
          }
          // Fallback: use tool_use_result from SDK if no blocks found
          if (!yielded && userMsg.tool_use_result !== undefined) {
            yield {
              type: "tool_result" as const,
              result: typeof userMsg.tool_use_result === "string"
                ? userMsg.tool_use_result
                : JSON.stringify(userMsg.tool_use_result),
            };
          }
          continue;
        }

        // Handle result messages
        if (message.type === "result") {
          const resultMsg = message as { type: "result"; subtype: string; errors?: string[] };
          if (resultMsg.subtype !== "success") {
            const errorDetail = resultMsg.errors ? resultMsg.errors.join("; ") : resultMsg.subtype;
            yield {
              type: "error",
              error: `Agent ended with status: ${resultMsg.subtype} - ${errorDetail}`,
            };
          }
          break;
        }
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
