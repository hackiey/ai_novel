import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Db } from "mongodb";
import { buildSystemPromptWithHistory } from "./systemPrompt.js";
import type { HistoryMessage } from "./systemPrompt.js";
import { createNovelToolsServer } from "./tools/index.js";
import type { VectorSearchFn, OnDocumentChangedFn } from "./tools/index.js";

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
  }

  async *chat(userMessage: string, history?: HistoryMessage[], memory?: string): AsyncGenerator<AgentEvent> {
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
    );

    const novelToolsServer = createNovelToolsServer(this.db, this.vectorSearchFn, this.onDocumentChanged, this.userId);
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
          continue;
        }

        // Handle assistant messages (text + tool_use blocks)
        if (message.type === "assistant") {
          for (const block of message.message.content) {
            if (block.type === "text") {
              fullResponse += block.text;
              yield { type: "text", text: block.text };
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

        // Handle synthetic user messages (tool results)
        if (message.type === "user") {
          const userMsg = message as any;
          if (userMsg.isSynthetic && userMsg.message?.content) {
            const content = userMsg.message.content;
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
                }
              }
            }
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
