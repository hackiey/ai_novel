import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BotMessageSquare, Check, ChevronRight, History, Loader2, Pencil, Plus, RotateCcw, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trpc } from "../lib/trpc.js";
import { getToken } from "../lib/auth.js";

const API_BASE = "http://localhost:3001";

// Tools that mutate data — map tool names to the tRPC query keys to invalidate
const MUTATION_TOOL_INVALIDATIONS: Record<string, string[][]> = {
  create_character: [["character"]],
  update_character: [["character"]],
  delete_character: [["character"]],
  create_world_setting: [["worldSetting"]],
  update_world_setting: [["worldSetting"]],
  delete_world_setting: [["worldSetting"]],
  create_chapter: [["chapter"]],
  update_chapter: [["chapter"]],
  delete_chapter: [["chapter"]],
  create_draft: [["draft"]],
  delete_draft: [["draft"]],
};

interface AgentEvent {
  type: "text" | "tool_use" | "tool_result" | "done" | "error" | "session";
  text?: string;
  toolName?: string;
  toolInput?: any;
  result?: any;
  fullResponse?: string;
  error?: string;
  sessionId?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  events?: AgentEvent[];
  createdAt?: string;
}

interface Props {
  projectId?: string;
  worldId?: string;
  onAgentAppend?: (text: string) => void;
}

type Segment =
  | { type: "text"; content: string }
  | { type: "tools"; calls: Array<{ toolName: string; toolInput?: any; result?: string; pending?: boolean }> };

/** Split flat event list into ordered text/tool segments */
function buildSegments(events: AgentEvent[] | undefined, content: string, isStreaming: boolean): Segment[] {
  if (!events || events.length === 0) {
    return content ? [{ type: "text", content }] : [];
  }

  const segments: Segment[] = [];
  let textAcc = "";
  let currentToolGroup: Segment & { type: "tools" } | null = null;
  // Track tool_use count and tool_result count to match them
  const toolUseList: Array<{ toolName: string; toolInput?: any; result?: string; pending?: boolean }> = [];
  let resultIdx = 0;

  for (const ev of events) {
    if (ev.type === "text") {
      // Flush any pending tool group
      if (currentToolGroup) {
        segments.push(currentToolGroup);
        currentToolGroup = null;
      }
      textAcc += ev.text || "";
    } else if (ev.type === "tool_use") {
      // Flush accumulated text
      if (textAcc.trim()) {
        segments.push({ type: "text", content: textAcc });
        textAcc = "";
      }
      if (!currentToolGroup) {
        currentToolGroup = { type: "tools", calls: [] };
      }
      const call = { toolName: ev.toolName || "unknown", toolInput: ev.toolInput, pending: true };
      currentToolGroup.calls.push(call);
      toolUseList.push(call);
    } else if (ev.type === "tool_result") {
      // Match result to the corresponding tool_use by order
      if (resultIdx < toolUseList.length) {
        toolUseList[resultIdx].result = ev.result;
        toolUseList[resultIdx].pending = false;
        resultIdx++;
      }
    }
  }

  // If streaming and there are pending tool calls with no result yet, mark them
  if (isStreaming) {
    for (const call of toolUseList) {
      if (call.pending && call.result === undefined) {
        call.pending = true;
      }
    }
  } else {
    // Not streaming — nothing is pending
    for (const call of toolUseList) {
      call.pending = false;
    }
  }

  // Flush remaining
  if (currentToolGroup) {
    segments.push(currentToolGroup);
  }
  if (textAcc.trim()) {
    segments.push({ type: "text", content: textAcc });
  }

  return segments;
}

function ToolCallBlock({ toolName, toolInput, result, pending }: {
  toolName: string;
  toolInput?: any;
  result?: string;
  pending?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const label = t(`tool.${toolName}`, toolName);

  // Try to parse result for display
  let parsedResult: any = null;
  if (result) {
    try {
      parsedResult = JSON.parse(result);
    } catch {
      parsedResult = result;
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 text-xs overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-gray-100 transition-colors text-left"
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 text-teal-500 shrink-0 animate-spin" strokeWidth={2} />
        ) : (
          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" strokeWidth={2} />
        )}
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="text-gray-400 font-mono text-[10px]">{toolName}</span>
        <ChevronRight className={`w-3 h-3 text-gray-400 ml-auto shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t border-gray-200 px-3 py-2 space-y-2 max-h-60 overflow-y-auto">
          {toolInput && (
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{t("chat.parameters")}</div>
              <pre className="text-[11px] text-gray-600 bg-white rounded p-2 border border-gray-100 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(toolInput, null, 2)}
              </pre>
            </div>
          )}
          {parsedResult !== null && (
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{t("chat.results")}</div>
              <pre className="text-[11px] text-gray-600 bg-white rounded p-2 border border-gray-100 overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                {typeof parsedResult === "string" ? parsedResult : JSON.stringify(parsedResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AssistantMessageContent({ events, content, isStreaming }: {
  events?: AgentEvent[];
  content: string;
  isStreaming: boolean;
}) {
  const { t } = useTranslation();
  const segments = buildSegments(events, content, isStreaming);

  if (segments.length === 0 && isStreaming) {
    return (
      <div className="flex items-center gap-2 text-xs text-teal-600">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t("chat.thinking")}</span>
      </div>
    );
  }

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return (
            <div key={i} className="max-w-[90%] px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-800 text-sm shadow-sm agent-markdown">
              <Markdown remarkPlugins={[remarkGfm]}>{seg.content}</Markdown>
            </div>
          );
        }
        // tools segment
        return (
          <div key={i} className="space-y-1 max-w-[90%]">
            {seg.calls.map((call, j) => (
              <ToolCallBlock key={j} {...call} />
            ))}
          </div>
        );
      })}
    </>
  );
}

export default function AgentChatPanel({ projectId, worldId, onAgentAppend }: Props) {
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const truncateMessagesMutation = trpc.agent.truncateMessages.useMutation();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Auto-resize edit textarea
  useEffect(() => {
    if (editTextareaRef.current) {
      editTextareaRef.current.style.height = "auto";
      editTextareaRef.current.style.height = `${Math.min(editTextareaRef.current.scrollHeight, 200)}px`;
    }
  }, [editText]);

  // Fetch session list (bound to world only)
  const sessionsQuery = trpc.agent.listSessions.useQuery(
    { worldId: worldId! },
    { enabled: !!worldId },
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Load history for a session
  const loadSession = useCallback(async (sid: string) => {
    setSessionId(sid);
    setShowHistory(false);
    setIsLoading(true);
    try {
      const history = await queryClient.fetchQuery({
        queryKey: ["agent", "getHistory", { sessionId: sid }],
        queryFn: () => {
          const token = getToken();
          return fetch(`${API_BASE}/trpc/agent.getHistory?input=${encodeURIComponent(JSON.stringify({ sessionId: sid }))}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
            .then((r) => r.json())
            .then((r) => r.result?.data);
        },
      });
      if (history) {
        const loaded: ChatMessage[] = history.map((doc: any) => ({
          role: doc.role,
          content: doc.content || "",
          events: doc.events,
          createdAt: doc.createdAt,
        }));
        setMessages(loaded);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, [queryClient]);

  async function sendMessage(text: string) {
    if (!text || isLoading) return;

    setIsLoading(true);

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    // Add a placeholder assistant message for streaming
    setMessages((prev) => [...prev, { role: "assistant", content: "", events: [] }]);

    try {
      const token = getToken();
      const response = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ projectId, worldId, message: text, sessionId, locale: i18n.language }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      const allEvents: AgentEvent[] = [];
      const mutatedTools: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);

          if (payload === "[DONE]") continue;

          try {
            const event: AgentEvent = JSON.parse(payload);

            if (event.type === "session" && event.sessionId) {
              setSessionId(event.sessionId);
              continue;
            }

            allEvents.push(event);

            if (event.type === "text" && event.text) {
              fullText += event.text;
              // Update assistant message content in-place
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: fullText,
                    events: [...allEvents],
                  };
                }
                return updated;
              });
            }

            if (event.type === "tool_use" || event.type === "tool_result") {
              if (event.type === "tool_use" && event.toolName) mutatedTools.push(event.toolName);
              // Update events list in real-time
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: fullText,
                    events: [...allEvents],
                  };
                }
                return updated;
              });
            }

            if (event.type === "done" && event.fullResponse) {
              fullText = event.fullResponse;
            }

            if (event.type === "error") {
              fullText = fullText || `Error: ${event.error}`;
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      // Final update with all events
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content: fullText,
            events: allEvents,
          };
        }
        return updated;
      });

      // Handle onAgentAppend for continue_writing
      if (onAgentAppend) {
        for (const e of allEvents) {
          if (e.type === "tool_use" && e.toolName === "continue_writing" && fullText) {
            onAgentAppend(fullText);
          }
        }
      }

      // Invalidate queries for any data the agent mutated
      const keysToInvalidate = new Set<string>();
      for (const toolName of mutatedTools) {
        const keys = MUTATION_TOOL_INVALIDATIONS[toolName];
        if (keys) {
          for (const key of keys) keysToInvalidate.add(JSON.stringify(key));
        }
      }
      for (const keyStr of keysToInvalidate) {
        queryClient.invalidateQueries({ queryKey: JSON.parse(keyStr) });
      }

      // Refresh session list
      sessionsQuery.refetch();
    } catch (err: any) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content: `Error: ${err.message || "Failed to get response"}`,
          };
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    sendMessage(text);
  }

  async function handleEditRetry(index: number, newContent: string) {
    if (isLoading) return;

    const msg = messages[index];

    // If message has createdAt (loaded from history), truncate DB records
    if (msg.createdAt && sessionId) {
      try {
        await truncateMessagesMutation.mutateAsync({
          sessionId,
          afterCreatedAt: msg.createdAt,
        });
      } catch {
        // continue anyway — frontend will truncate
      }
    }

    // Truncate frontend messages to before this message
    setMessages((prev) => prev.slice(0, index));
    setEditingIndex(null);

    // Send with new content
    sendMessage(newContent);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleNewSession() {
    setSessionId(undefined);
    setMessages([]);
  }

  const suggestions = [
    t("chat.suggestion.listCharacters"),
    t("chat.suggestion.continueWriting"),
    t("chat.suggestion.plotTwist"),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">{t("chat.aiAssistant")}</span>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              showHistory
                ? "bg-gray-100 text-gray-900 hover:bg-gray-200"
                : "bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50"
            }`}
            title={t("chat.history")}
          >
            {showHistory ? <X className="w-3.5 h-3.5" /> : <History className="w-3.5 h-3.5" />}
            {showHistory ? t("chat.close") : t("chat.history")}
          </button>
        </div>
        <button
          onClick={handleNewSession}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-teal-600 text-white shadow-sm hover:bg-teal-500 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t("chat.newChat")}
        </button>
      </div>

      {/* History sidebar overlay */}
      {showHistory && (
        <div className="border-b border-gray-200 max-h-60 overflow-y-auto bg-gray-50">
          {sessionsQuery.isLoading && (
            <div className="p-3 text-xs text-gray-400">{t("chat.loading")}</div>
          )}
          {sessionsQuery.data?.length === 0 && (
            <div className="p-3 text-xs text-gray-400">{t("chat.noHistory")}</div>
          )}
          {sessionsQuery.data?.map((s: any) => (
            <button
              key={s.sessionId}
              onClick={() => loadSession(s.sessionId)}
              className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-b-0 ${
                sessionId === s.sessionId ? "bg-gray-100 text-gray-900 font-semibold" : "text-gray-600"
              }`}
            >
              <div className="font-medium truncate">{s.title || t("chat.untitled")}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {s.updatedAt ? new Date(s.updatedAt).toLocaleString() : ""}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gray-100 flex items-center justify-center shadow-sm border border-gray-200">
              <BotMessageSquare className="w-6 h-6 text-gray-700" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-gray-600 mb-1">{t("chat.emptyTitle")}</p>
            <p className="text-xs text-gray-400 max-w-xs mx-auto">
              {t("chat.emptySubtitle")}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); }}
                  className="text-[10px] px-2 py-1 rounded-full border border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "user" ? (
              editingIndex === i ? (
                <div className="flex justify-end">
                  <div className="max-w-[80%] w-full space-y-2">
                    <textarea
                      ref={editTextareaRef}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full rounded-xl bg-white border border-teal-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none overflow-y-auto"
                      style={{ minHeight: "38px", maxHeight: "200px" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          const trimmed = editText.trim();
                          if (trimmed) handleEditRetry(i, trimmed);
                        }
                        if (e.key === "Escape") setEditingIndex(null);
                      }}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingIndex(null)}
                        className="px-3 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        {t("chat.cancel")}
                      </button>
                      <button
                        onClick={() => {
                          const trimmed = editText.trim();
                          if (trimmed) handleEditRetry(i, trimmed);
                        }}
                        disabled={!editText.trim()}
                        className="px-3 py-1 rounded-lg text-xs bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
                      >
                        {t("chat.saveAndSend")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end group">
                  <div className="flex items-end gap-1">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => { setEditingIndex(i); setEditText(msg.content); }}
                        disabled={isLoading}
                        className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors"
                        title={t("chat.editTooltip")}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleEditRetry(i, msg.content)}
                        disabled={isLoading}
                        className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-colors"
                        title={t("chat.retryTooltip")}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="max-w-[80%] px-3 py-2 rounded-xl bg-teal-600 text-white text-sm shadow-sm">
                      {msg.content}
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-2">
                <AssistantMessageContent events={msg.events} content={msg.content} isStreaming={isLoading && i === messages.length - 1} />
              </div>
            )}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex items-center gap-2 text-xs text-teal-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t("chat.thinking")}</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3 shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("chat.inputPlaceholder")}
            rows={1}
            className="flex-1 rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none overflow-y-auto"
            style={{ minHeight: "38px", maxHeight: "200px" }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm shadow-sm hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {t("chat.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
