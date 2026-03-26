import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BotMessageSquare, BookOpen, ChevronDown, History, Loader2, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import { getToken } from "../lib/auth.js";
import { AgentEvent, AssistantMessageContent } from "./AgentMessageDisplay.js";

const API_BASE = "";

// Tools that mutate data — map tool names to the tRPC query keys to invalidate
// tRPC v11 query keys are double-nested: [["router", "procedure"], ...]
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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  events?: AgentEvent[];
  createdAt?: string;
}

// Tools that edit chapter content — require review flow
const CHAPTER_EDIT_TOOLS = new Set(["update_chapter"]);

interface Props {
  projectId?: string;
  worldId?: string;
  currentChapterId?: string;
  onAgentAppend?: (text: string) => void;
  onChapterEdit?: (chapterId: string) => void;
  variant?: "default" | "immersive";
}

export default function AgentChatPanel({ projectId, worldId, currentChapterId, onAgentAppend, onChapterEdit, variant = "default" }: Props) {
  const imm = variant === "immersive";
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [memorySubTab, setMemorySubTab] = useState<"world" | "project">("world");
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const truncateMessagesMutation = trpc.agent.truncateMessages.useMutation();
  const modelsQuery = trpc.agent.getModels.useQuery();
  const memoryQuery = trpc.agent.getMemory.useQuery(
    { worldId, projectId },
    { enabled: showMemory && !!(worldId || projectId) },
  );
  const updateMemoryMutation = trpc.agent.updateMemory.useMutation({
    onSuccess: () => memoryQuery.refetch(),
  });
  const [worldMemoryDraft, setWorldMemoryDraft] = useState<string | null>(null);
  const [projectMemoryDraft, setProjectMemoryDraft] = useState<string | null>(null);
  const [memorySaveStatus, setMemorySaveStatus] = useState<Record<string, string>>({});

  // Auto-resize textarea: grow with content, cap at 120px
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "38px";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
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
        body: JSON.stringify({ projectId, worldId, message: text, sessionId, locale: i18n.language, model: selectedModel, currentChapterId }),
      });

      if (!response.ok || !response.body) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json();
          if (typeof errorBody?.error === "string" && errorBody.error) {
            errorMessage = errorBody.error;
          }
        } catch {
          // ignore invalid error body
        }
        throw new Error(errorMessage);
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

      // Check if any chapter-edit tools were used; if so, trigger review flow
      let chapterEditHandled = false;
      if (onChapterEdit) {
        for (const e of allEvents) {
          if (e.type === "tool_use" && e.toolName && CHAPTER_EDIT_TOOLS.has(e.toolName) && e.toolInput) {
            const input = e.toolInput as Record<string, unknown>;
            const chapterId = (input.chapter_id ?? input.id) as string | undefined;
            if (chapterId) {
              onChapterEdit(chapterId);
              chapterEditHandled = true;
            }
          }
        }
      }

      // Invalidate queries for any data the agent mutated
      const keysToInvalidate = new Set<string>();
      for (const toolName of mutatedTools) {
        // Skip chapter invalidation if we're handling it via review flow
        if (chapterEditHandled && CHAPTER_EDIT_TOOLS.has(toolName)) continue;
        const keys = MUTATION_TOOL_INVALIDATIONS[toolName];
        if (keys) {
          for (const key of keys) keysToInvalidate.add(JSON.stringify(key));
        }
      }
      for (const keyStr of keysToInvalidate) {
        queryClient.invalidateQueries({ queryKey: [JSON.parse(keyStr)] });
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
      <div className={`flex items-center justify-between px-4 py-1.5 border-b shrink-0 ${imm ? "border-white/10" : "border-gray-200"}`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${imm ? "text-white/80" : "text-gray-700"}`}>{t("chat.aiAssistant")}</span>
          <button
            onClick={() => { setShowHistory((v) => !v); setShowMemory(false); }}
            className={`p-1.5 rounded-md transition-colors ${
              showHistory
                ? imm ? "text-white hover:bg-white/15" : "text-gray-900 hover:bg-gray-200"
                : imm ? "text-white/50 hover:text-white hover:bg-white/10" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
            title={showHistory ? t("chat.close") : t("chat.history")}
          >
            {showHistory ? <X className="w-4 h-4" /> : <History className="w-4 h-4" />}
          </button>
          <button
            onClick={() => {
              const next = !showMemory;
              setShowMemory(next);
              setShowHistory(false);
              if (next) {
                setWorldMemoryDraft(null);
                setProjectMemoryDraft(null);
                setMemorySaveStatus({});
                setMemorySubTab(projectId ? "project" : "world");
              }
            }}
            className={`p-1.5 rounded-md transition-colors ${
              showMemory
                ? imm ? "text-white hover:bg-white/15" : "text-gray-900 hover:bg-gray-200"
                : imm ? "text-white/50 hover:text-white hover:bg-white/10" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
            title={showMemory ? t("chat.close") : t("chat.memory")}
          >
            {showMemory ? <X className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {!showMemory && modelsQuery.data && modelsQuery.data.available.length >= 1 && (
            <div className="relative">
              <select
                value={selectedModel || modelsQuery.data.default}
                onChange={(e) => setSelectedModel(e.target.value)}
                className={`appearance-none text-xs rounded-md pl-2 pr-6 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer ${
                  imm
                    ? "bg-white/10 border border-white/15 text-white/80 hover:bg-white/15"
                    : "bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200"
                }`}
                title={t("chat.selectModel")}
              >
                {modelsQuery.data.available.map((m: string) => {
                  const afterColon = m.includes(":") ? m.split(":")[1] : m;
                  const slashIdx = afterColon.lastIndexOf("/");
                  const reasoningLevels = ["minimal", "low", "medium", "high", "xhigh"];
                  let display = afterColon;
                  if (slashIdx !== -1 && reasoningLevels.includes(afterColon.slice(slashIdx + 1))) {
                    display = `${afterColon.slice(0, slashIdx)} (${afterColon.slice(slashIdx + 1)})`;
                  }
                  return (
                    <option key={m} value={m}>
                      {display}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className={`w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none ${imm ? "text-white/40" : "text-gray-400"}`} />
            </div>
          )}
          {!showMemory && (
            <button
              onClick={handleNewSession}
              className="p-1.5 rounded-md bg-white/10 border border-white/15 text-white/80 shadow-sm hover:bg-white/20 transition-colors"
              title={t("chat.newChat")}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          {showMemory && (
            <div className="flex items-center gap-2">
              {memorySaveStatus[memorySubTab] && (
                <span className="text-[10px] text-teal-400">{memorySaveStatus[memorySubTab]}</span>
              )}
              <button
                onClick={async () => {
                  if (memorySubTab === "world") {
                    const content = worldMemoryDraft ?? memoryQuery.data?.worldMemory ?? "";
                    setMemorySaveStatus((s) => ({ ...s, world: t("chat.memorySaving") }));
                    await updateMemoryMutation.mutateAsync({ scope: "world", worldId, content });
                    setWorldMemoryDraft(null);
                    setMemorySaveStatus((s) => ({ ...s, world: t("chat.memorySaved") }));
                    setTimeout(() => setMemorySaveStatus((s) => ({ ...s, world: "" })), 2000);
                  } else {
                    const content = projectMemoryDraft ?? memoryQuery.data?.projectMemory ?? "";
                    setMemorySaveStatus((s) => ({ ...s, project: t("chat.memorySaving") }));
                    await updateMemoryMutation.mutateAsync({ scope: "project", projectId, content });
                    setProjectMemoryDraft(null);
                    setMemorySaveStatus((s) => ({ ...s, project: t("chat.memorySaved") }));
                    setTimeout(() => setMemorySaveStatus((s) => ({ ...s, project: "" })), 2000);
                  }
                }}
                disabled={updateMemoryMutation.isPending || (memorySubTab === "world" ? worldMemoryDraft === null : projectMemoryDraft === null)}
                className="px-3 py-1 rounded-md text-xs bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 disabled:opacity-50 transition-colors"
              >
                {t("chat.memorySave")}
              </button>
            </div>
          )}
        </div>
      </div>

      {showMemory ? (
        <>
          {/* Memory sub-tabs */}
          {worldId && projectId && (
            <div className={`flex border-b shrink-0 ${imm ? "border-white/10" : "border-gray-200"}`}>
              <button
                onClick={() => setMemorySubTab("world")}
                className={`flex-1 py-1.5 text-xs font-medium text-center transition-colors ${
                  memorySubTab === "world"
                    ? imm ? "text-teal-400 border-b-2 border-teal-400" : "text-teal-700 border-b-2 border-teal-600"
                    : imm ? "text-white/50 hover:text-white/70" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t("chat.memoryWorld")}
              </button>
              <button
                onClick={() => setMemorySubTab("project")}
                className={`flex-1 py-1.5 text-xs font-medium text-center transition-colors ${
                  memorySubTab === "project"
                    ? imm ? "text-teal-400 border-b-2 border-teal-400" : "text-teal-700 border-b-2 border-teal-600"
                    : imm ? "text-white/50 hover:text-white/70" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t("chat.memoryProject")}
              </button>
            </div>
          )}

          {/* Memory textarea — full remaining height */}
          <div className="flex-1 flex flex-col p-3 min-h-0">
            {memoryQuery.isLoading ? (
              <div className={`text-xs ${imm ? "text-white/40" : "text-gray-400"}`}>{t("chat.loading")}</div>
            ) : memorySubTab === "world" ? (
              <textarea
                value={worldMemoryDraft ?? memoryQuery.data?.worldMemory ?? ""}
                onChange={(e) => setWorldMemoryDraft(e.target.value)}
                placeholder={t("chat.memoryEmpty")}
                className={`flex-1 w-full rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none ${
                  imm ? "bg-white/5 border border-white/10 text-white/90 placeholder-white/30" : "border border-gray-200 bg-white text-gray-800 placeholder-gray-400"
                }`}
              />
            ) : (
              <textarea
                value={projectMemoryDraft ?? memoryQuery.data?.projectMemory ?? ""}
                onChange={(e) => setProjectMemoryDraft(e.target.value)}
                placeholder={t("chat.memoryEmpty")}
                className={`flex-1 w-full rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none ${
                  imm ? "bg-white/5 border border-white/10 text-white/90 placeholder-white/30" : "border border-gray-200 bg-white text-gray-800 placeholder-gray-400"
                }`}
              />
            )}
          </div>
        </>
      ) : (
        <>
          {/* History sidebar overlay */}
          {showHistory && (
            <div className={`border-b max-h-60 overflow-y-auto scrollbar-none ${imm ? "border-white/10 bg-white/5" : "border-gray-200 bg-gray-50"}`}>
              {sessionsQuery.isLoading && (
                <div className={`p-3 text-xs ${imm ? "text-white/40" : "text-gray-400"}`}>{t("chat.loading")}</div>
              )}
              {sessionsQuery.data?.length === 0 && (
                <div className={`p-3 text-xs ${imm ? "text-white/40" : "text-gray-400"}`}>{t("chat.noHistory")}</div>
              )}
              {sessionsQuery.data?.map((s: any) => (
                <button
                  key={s.sessionId}
                  onClick={() => loadSession(s.sessionId)}
                  className={`w-full text-left px-4 py-2 text-xs transition-colors border-b last:border-b-0 ${
                    imm
                      ? `border-white/5 hover:bg-white/10 ${sessionId === s.sessionId ? "bg-white/10 text-white font-semibold" : "text-white/70"}`
                      : `border-gray-100 hover:bg-gray-100 ${sessionId === s.sessionId ? "bg-gray-100 text-gray-900 font-semibold" : "text-gray-600"}`
                  }`}
                >
                  <div className="font-medium truncate">{s.title || t("chat.untitled")}</div>
                  <div className={`text-[10px] mt-0.5 ${imm ? "text-white/30" : "text-gray-400"}`}>
                    {s.updatedAt ? new Date(s.updatedAt).toLocaleString() : ""}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <p className={`text-sm mb-1 ${imm ? "text-white/70" : "text-gray-600"}`}>{t("chat.emptyTitle")}</p>
                <p className={`text-xs max-w-xs mx-auto ${imm ? "text-white/40" : "text-gray-400"}`}>
                  {t("chat.emptySubtitle")}
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); }}
                      className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                        imm
                          ? "border-white/15 text-white/50 hover:text-white/80 hover:border-white/30"
                          : "border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className={`mt-3 text-xs max-w-xs mx-auto ${imm ? "text-white/30" : "text-gray-400"}`}>
                  {t("chat.memoryHint")}
                </p>
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
                          className={`w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none overflow-y-auto ${
                            imm ? "bg-white/10 border border-white/20 text-white" : "bg-white border border-teal-300 text-gray-900"
                          }`}
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
                            className={`px-3 py-1 rounded-lg text-xs transition-colors ${imm ? "text-white/50 hover:text-white hover:bg-white/10" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
                          >
                            {t("chat.cancel")}
                          </button>
                          <button
                            onClick={() => {
                              const trimmed = editText.trim();
                              if (trimmed) handleEditRetry(i, trimmed);
                            }}
                            disabled={!editText.trim()}
                            className="px-3 py-1 rounded-lg text-xs bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 disabled:opacity-50 transition-colors"
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
                            className={`p-1 rounded-md disabled:opacity-30 transition-colors ${imm ? "text-white/40 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
                            title={t("chat.editTooltip")}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleEditRetry(i, msg.content)}
                            disabled={isLoading}
                            className={`p-1 rounded-md disabled:opacity-30 transition-colors ${imm ? "text-white/40 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
                            title={t("chat.retryTooltip")}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="max-w-[80%] px-3 py-2 rounded-xl bg-white/15 text-white text-sm shadow-sm">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-2">
                    <AssistantMessageContent events={msg.events} content={msg.content} isStreaming={isLoading && i === messages.length - 1} immersive={imm} />
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className={`flex items-center gap-2 text-xs ${imm ? "text-teal-400" : "text-teal-600"}`}>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t("chat.thinking")}</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className={`border-t p-2 shrink-0 ${imm ? "border-white/10" : "border-gray-200"}`}>
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("chat.inputPlaceholder")}
                rows={1}
                className={`w-0 flex-1 rounded-lg px-3 py-2 text-sm leading-normal focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none overflow-y-auto scrollbar-none ${
                  imm
                    ? "bg-white/5 border border-white/10 text-white/90 placeholder-white/30"
                    : "bg-white border border-gray-300 text-gray-900 placeholder-gray-400"
                }`}
                style={{ height: "38px", maxHeight: "120px" }}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="px-3 py-2 rounded-lg bg-white/10 border border-white/15 text-white/80 text-sm hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {t("chat.send")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
