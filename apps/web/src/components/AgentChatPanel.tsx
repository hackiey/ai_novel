import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowUp, BotMessageSquare, BookOpen, Check, ChevronDown, History, KeyRound, Loader2, Pencil, Plus, RotateCcw, Settings, Sparkles, X } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import { getToken } from "../lib/auth.js";
import { getBYOKForModel, getBYOKModelSpecs, hasBYOKKeys } from "../lib/byokStorage.js";
import { getCompactionSettings } from "../lib/compactionSettings.js";
import { AgentEvent, AssistantMessageContent, type SkillProposalContext } from "./AgentMessageDisplay.js";
import { useSkillsRecommend } from "../lib/skillsRecommendPref.js";
import CompactionSettingsDialog from "./CompactionSettingsDialog.js";
import SkillSettingsDialog from "./SkillSettingsDialog.js";
import { QuestionActionContext, type QuestionActionContextValue } from "./QuestionActionContext.js";

const API_BASE = "";

// Tools that mutate data — map tool names to the tRPC query keys to invalidate
// tRPC v11 query keys are double-nested: [["router", "procedure"], ...]
const MUTATION_TOOL_INVALIDATIONS: Record<string, string[][]> = {
  write: [["character"], ["worldSetting"], ["chapter"], ["draft"]],
  update: [["character"], ["worldSetting"], ["chapter"], ["draft"]],
  delete_entity: [["character"], ["worldSetting"], ["chapter"], ["draft"]],
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  events?: AgentEvent[];
  createdAt?: string;
  /** "recommendation" tags assistant messages produced by the skill-recommend agent
   * so the UI can label them and use a distinct loading text. */
  source?: "main" | "recommendation";
}

// Tool calls that edit chapter content — require review flow.
// With the unified `update` tool, we check the type arg too.
function isChapterEditCall(toolName: string | undefined, toolInput: unknown): boolean {
  if (toolName !== "update") return false;
  const input = (toolInput ?? {}) as Record<string, unknown>;
  return input.type === "chapter";
}

interface Props {
  projectId?: string;
  worldId?: string;
  currentChapterId?: string;
  onChapterEdit?: (chapterId: string) => void;
  variant?: "default" | "immersive";
}

function formatTokenK(value: number | undefined): string {
  if (!value || value <= 0) return "0k";
  const scaled = value / 1000;
  const formatted = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1);
  return `${formatted.replace(/\.0$/, "")}k`;
}

function formatModelDisplay(spec: string): string {
  const afterColon = spec.includes(":") ? spec.split(":")[1] : spec;
  const slashIdx = afterColon.lastIndexOf("/");
  const reasoningLevels = ["minimal", "low", "medium", "high", "xhigh"];
  if (slashIdx !== -1 && reasoningLevels.includes(afterColon.slice(slashIdx + 1))) {
    return `${afterColon.slice(0, slashIdx)} (${afterColon.slice(slashIdx + 1)})`;
  }
  return afterColon;
}

function ModelDropdown({
  immersive,
  currentModelSpec,
  defaultModel,
  serverModels,
  onSelect,
  selectLabel,
  byokLabel,
}: {
  immersive: boolean;
  currentModelSpec: string | undefined;
  defaultModel: string | undefined;
  serverModels: string[];
  onSelect: (model: string) => void;
  selectLabel: string;
  byokLabel: string;
}) {
  const byokModels = getBYOKModelSpecs();
  const allModels = [...serverModels, ...byokModels.filter((m) => !serverModels.includes(m))];
  const value = currentModelSpec || defaultModel || allModels[0];
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const id = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    document.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (allModels.length === 0) return null;

  const showByokBadge = !!(value && getBYOKForModel(value));

  return (
    <div ref={wrapperRef} className="relative inline-flex items-center h-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={selectLabel}
        className={`inline-flex items-center gap-1 h-6 px-1 rounded text-[11px] leading-none transition-colors ${
          immersive
            ? "text-white/70 hover:text-white hover:bg-white/10"
            : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
        }`}
      >
        {showByokBadge && (
          <KeyRound
            className={`w-2.5 h-2.5 shrink-0 ${immersive ? "text-amber-400/70" : "text-amber-500/80"}`}
            aria-label={byokLabel}
          />
        )}
        <span className="max-w-[140px] truncate">{formatModelDisplay(value || "")}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-180" : ""} ${immersive ? "text-white/40" : "text-gray-400"}`} />
      </button>
      {open && (
        <div
          className={`absolute bottom-full right-0 mb-2 z-50 max-w-[280px] max-h-72 overflow-y-auto scrollbar-none rounded-lg border shadow-xl py-1 ${
            immersive
              ? "bg-neutral-900/90 border-white/10 backdrop-blur-md"
              : "bg-white border-gray-200"
          }`}
          style={{ minWidth: "max-content" }}
        >
          {allModels.map((m) => {
            const isCurrent = m === value;
            const isByok = !!getBYOKForModel(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  onSelect(m);
                  setOpen(false);
                }}
                className={`w-full text-left pl-2.5 pr-3 py-1 text-[11px] flex items-center gap-1.5 transition-colors ${
                  immersive
                    ? "text-white/75 hover:bg-white/8"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Check
                  className={`w-3 h-3 shrink-0 transition-opacity ${
                    isCurrent
                      ? immersive ? "text-teal-400 opacity-100" : "text-teal-600 opacity-100"
                      : "opacity-0"
                  }`}
                  strokeWidth={3}
                />
                {isByok && (
                  <KeyRound className={`w-2.5 h-2.5 shrink-0 ${immersive ? "text-amber-400/70" : "text-amber-500/80"}`} />
                )}
                <span className={`flex-1 whitespace-nowrap ${
                  isCurrent
                    ? immersive ? "text-white" : "text-gray-900 font-medium"
                    : ""
                }`}>{formatModelDisplay(m)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AgentChatPanel({ projectId, worldId, currentChapterId, onChapterEdit, variant = "default" }: Props) {
  const imm = variant === "immersive";
  const { t, i18n } = useTranslation();
  // Per-session state: messages and "is streaming" are tracked by sessionKey so that
  // multiple sessions can stream concurrently without their UI bleeding into each other.
  // sessionKey = real sessionId once the server returns one, or a "draft-N" placeholder
  // before that.
  const [messagesByKey, setMessagesByKey] = useState<Record<string, ChatMessage[]>>({});
  const [loadingByKey, setLoadingByKey] = useState<Record<string, true>>({});
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const draftCounterRef = useRef(0);
  const [draftKey, setDraftKey] = useState<string>(() => `draft-0`);
  const viewKey = sessionId ?? draftKey;
  const messages = messagesByKey[viewKey] ?? [];
  const isLoading = !!loadingByKey[viewKey];
  // Refs that mirror the latest view so async stream callbacks can decide whether
  // the user has navigated away.
  const sessionIdRef = useRef<string | undefined>(sessionId);
  const draftKeyRef = useRef<string>(draftKey);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { draftKeyRef.current = draftKey; }, [draftKey]);

  const updateMessages = useCallback((key: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setMessagesByKey((prev) => ({ ...prev, [key]: updater(prev[key] ?? []) }));
  }, []);
  const setLoading = useCallback((key: string, loading: boolean) => {
    setLoadingByKey((prev) => {
      if (loading) {
        if (prev[key]) return prev;
        return { ...prev, [key]: true };
      }
      if (!prev[key]) return prev;
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const [showHistory, setShowHistory] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [memorySubTab, setMemorySubTab] = useState<"world" | "project">("world");
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const abortByKeyRef = useRef<Map<string, AbortController>>(new Map());
  // Disambiguates which stream "owns" the loading flag for a given session.
  // When QuestionCard's submit aborts the live /chat fetch and opens /reply,
  // the aborted /chat's finally would otherwise clear loading just as /reply is
  // starting up. Ownership tokens let the late finally tell "still me" from
  // "someone else has taken over" so it knows whether to clear the flag.
  const streamOwnerByKeyRef = useRef<Map<string, symbol>>(new Map());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const truncateMessagesMutation = trpc.agent.truncateMessages.useMutation();
  const modelsQuery = trpc.agent.getModels.useQuery();
  const projectQuery = trpc.project.getById.useQuery(
    { id: projectId! },
    { enabled: !!projectId },
  );
  const project = projectQuery.data as
    | { _id: string; enabledSkillSlugs?: string[] }
    | undefined;
  const enabledSkillSlugSet = useMemo(() => {
    return new Set(project?.enabledSkillSlugs ?? []);
  }, [project?.enabledSkillSlugs]);
  const skillProposalContext: SkillProposalContext | undefined = projectId
    ? { projectId, alreadyEnabledSlugs: enabledSkillSlugSet }
    : undefined;
  const { enabled: recommendChecked, setEnabled: setRecommendChecked } = useSkillsRecommend(projectId);
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
  const [showCompactionSettings, setShowCompactionSettings] = useState(false);
  const [showSkillSettings, setShowSkillSettings] = useState(false);

  // Auto-resize textarea: grow with content, cap at 120px
  useEffect(() => {
    if (textareaRef.current) {
      if (!input) {
        textareaRef.current.style.height = "38px";
      } else {
        textareaRef.current.style.height = "38px";
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
      }
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
  const activeSession = sessionsQuery.data?.find((session: any) => session.sessionId === sessionId) as any;
  const currentModelSpec = selectedModel || activeSession?.model || modelsQuery.data?.default || getBYOKModelSpecs()[0];
  const currentContextTokens = activeSession?.usage?.maxContextTokens ?? activeSession?.usage?.lastContextTokens ?? 0;
  const currentModelContextWindow = activeSession?.usage?.modelContextWindow
    ?? (currentModelSpec ? modelsQuery.data?.contextWindows?.[currentModelSpec] : undefined)
    ?? 0;
  const tokenLabel = i18n.language.startsWith("zh") ? "当前上下文" : "Context";

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "at bottom" if within 50px of the bottom
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    userScrolledUp.current = !atBottom;
  }, []);

  useEffect(() => {
    if (scrollRef.current && !userScrolledUp.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Load history for a session, then surface any still-pending `question` tool
  // calls (the agent is blocked server-side waiting for the user to click an
  // answer — the assistant message hasn't been written yet, so it isn't in the
  // history). We render those as a synthetic assistant message at the bottom
  // so the QuestionCard reappears and the user can resume.
  const loadSession = useCallback(async (sid: string) => {
    setSessionId(sid);
    setShowHistory(false);
    // If this session has an in-flight stream, its messages are already in the
    // map — don't clobber them with a stale history snapshot.
    if (loadingByKey[sid]) return;
    try {
      const token = getToken();
      const [history, pending] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: ["agent", "getHistory", { sessionId: sid }],
          queryFn: () => {
            return fetch(`${API_BASE}/trpc/agent.getHistory?input=${encodeURIComponent(JSON.stringify({ sessionId: sid }))}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
              .then((r) => r.json())
              .then((r) => r.result?.data);
          },
        }),
        fetch(`${API_BASE}/api/agent/question?sessionId=${encodeURIComponent(sid)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then((r) => (r.ok ? r.json() : { pending: [] }))
          .catch(() => ({ pending: [] })),
      ]);
      const loaded: ChatMessage[] = Array.isArray(history)
        ? history.map((doc: any) => ({
            role: doc.role,
            content: doc.content || "",
            events: doc.events,
            createdAt: doc.createdAt,
          }))
        : [];
      const pendingList: Array<{ callId: string; info: { questions: any[] } }> =
        Array.isArray(pending?.pending) ? pending.pending : [];
      if (pendingList.length > 0) {
        const events: AgentEvent[] = pendingList.map((p) => ({
          type: "tool_use",
          toolName: "question",
          toolCallId: p.callId,
          toolInput: { questions: p.info.questions },
        }));
        loaded.push({ role: "assistant", content: "", events, source: "main" });
      }
      // Race guard: if the stream started after we kicked off the fetch, prefer the live state.
      if (loadingByKey[sid]) return;
      setMessagesByKey((prev) => ({ ...prev, [sid]: loaded }));
    } catch {
      // silently fail
    }
  }, [queryClient, loadingByKey]);

  // Threshold below which we trigger automatic skill recommendations after each turn.
  const RECOMMEND_SKILLS_THRESHOLD = 50;

  async function streamSkillRecommendation(sessionKey: string, precedingMessages: ChatMessage[]) {
    if (!projectId) return;
    const recentMessages = precedingMessages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    if (recentMessages.length === 0) return;

    updateMessages(sessionKey, (prev) => [...prev, { role: "assistant", content: "", events: [], source: "recommendation" }]);

    try {
      const token = getToken();
      const modelToUse = currentModelSpec;
      const byok = modelToUse ? getBYOKForModel(modelToUse) : null;
      const response = await fetch(`${API_BASE}/api/agent/recommend-skills`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId,
          worldId,
          recentMessages,
          locale: i18n.language,
          model: modelToUse,
          ...(byok?.apiKey ? { apiKey: byok.apiKey } : {}),
          ...(byok?.baseURL ? { baseURL: byok.baseURL } : {}),
        }),
      });
      if (!response.ok || !response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      const allEvents: AgentEvent[] = [];

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
            if (event.type === "session") continue;
            allEvents.push(event);
            if (event.type === "text" && event.text) fullText += event.text;
            updateMessages(sessionKey, (prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = { ...last, content: fullText, events: [...allEvents] };
              }
              return updated;
            });
          } catch {
            // skip malformed
          }
        }
      }
    } catch {
      // swallow — recommendation is opportunistic and should never disrupt the main flow
    }
  }

  /**
   * Read SSE events from a fetched response and merge them into the messages
   * map. Used by sendMessage (kicks off /api/agent/chat) and by
   * submitQuestionAnswers / rejectQuestion (POST /api/agent/question/.../reply
   * which streams the loop's continuation events).
   */
  async function consumeStream(
    response: Response,
    initialActiveKey: string,
    opts: { startedFromDraft: boolean },
  ): Promise<{ activeKey: string; fullText: string; allEvents: AgentEvent[]; mutatedTools: string[] }> {
    if (!response.body) throw new Error("Response body is empty");

    let activeKey = initialActiveKey;
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
            const realId = event.sessionId;
            if (realId !== activeKey) {
              // Move messages/loading from the draft key to the real session id.
              setMessagesByKey((prev) => {
                if (!(activeKey in prev) && !(realId in prev)) return prev;
                const buf = prev[activeKey] ?? [];
                const { [activeKey]: _, ...rest } = prev;
                return { ...rest, [realId]: buf };
              });
              setLoadingByKey((prev) => {
                const next: Record<string, true> = { ...prev };
                delete next[activeKey];
                next[realId] = true;
                return next;
              });
              const ctrl = abortByKeyRef.current.get(activeKey);
              abortByKeyRef.current.delete(activeKey);
              if (ctrl) abortByKeyRef.current.set(realId, ctrl);
              const owner = streamOwnerByKeyRef.current.get(activeKey);
              if (owner) {
                streamOwnerByKeyRef.current.delete(activeKey);
                streamOwnerByKeyRef.current.set(realId, owner);
              }
              // Only steer the visible view if the user is still parked on the
              // draft we started from. If they navigated to another session, leave
              // them where they are.
              if (
                opts.startedFromDraft &&
                sessionIdRef.current === undefined &&
                draftKeyRef.current === activeKey
              ) {
                setSessionId(realId);
              }
              activeKey = realId;
            }
            continue;
          }

          allEvents.push(event);

          if (event.type === "text" && event.text) {
            fullText += event.text;
            updateMessages(activeKey, (prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: (last.content ?? "") + event.text!,
                  events: [...(last.events ?? []), event],
                };
              }
              return updated;
            });
          }

          if (event.type === "tool_use" || event.type === "tool_result" || event.type === "compaction") {
            if (event.type === "tool_use" && event.toolName) mutatedTools.push(event.toolName);
            updateMessages(activeKey, (prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  events: [...(last.events ?? []), event],
                };
              }
              return updated;
            });
          }

          if (event.type === "done" && event.fullResponse) {
            fullText = event.fullResponse;
            const finalText = event.fullResponse;
            updateMessages(activeKey, (prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = { ...last, content: finalText };
              }
              return updated;
            });
          }

          if (event.type === "usage" && event.usage) {
            const u = event.usage;
            const label = u.isSummary ? "[Token Usage Summary]" : "[Token Usage]";
            const style = u.isSummary
              ? "color: #f59e0b; font-weight: bold"
              : "color: #2dd4bf; font-weight: bold";
            console.log(
              `%c${label}%c ${u.model} | input: ${u.input} | output: ${u.output} | cache_read: ${u.cacheRead} | cache_write: ${u.cacheWrite} | total: ${u.totalTokens} | cost: $${u.cost.total.toFixed(4)}`,
              style,
              "color: inherit",
            );
          }

          if (event.type === "error") {
            fullText = fullText || `Error: ${event.error}`;
          }
        } catch {
          // skip malformed JSON
        }
      }
    }

    return { activeKey, fullText, allEvents, mutatedTools };
  }

  /**
   * Run the post-stream side-effects shared by sendMessage and the question
   * resolution path: chapter-edit review routing, query invalidation, session
   * list refresh, optional skill recommendation.
   */
  async function finalizeStream(
    activeKey: string,
    fullText: string,
    allEvents: AgentEvent[],
    mutatedTools: string[],
    opts: { recommendUserText?: string },
  ): Promise<void> {
    let chapterEditHandled = false;
    if (onChapterEdit) {
      for (const e of allEvents) {
        if (e.type === "tool_use" && isChapterEditCall(e.toolName, e.toolInput)) {
          const input = (e.toolInput ?? {}) as Record<string, unknown>;
          const chapterId = (input.chapter_id ?? input.id) as string | undefined;
          if (chapterId) {
            onChapterEdit(chapterId);
            chapterEditHandled = true;
          }
        }
      }
    }

    const keysToInvalidate = new Set<string>();
    for (const toolName of mutatedTools) {
      const keys = MUTATION_TOOL_INVALIDATIONS[toolName];
      if (!keys) continue;
      for (const key of keys) {
        if (chapterEditHandled && key[0] === "chapter") continue;
        keysToInvalidate.add(JSON.stringify(key));
      }
    }
    for (const keyStr of keysToInvalidate) {
      queryClient.invalidateQueries({ queryKey: [JSON.parse(keyStr)] });
    }

    sessionsQuery.refetch();

    if (opts.recommendUserText !== undefined) {
      const preceding: ChatMessage[] = [
        { role: "user", content: opts.recommendUserText },
        { role: "assistant", content: fullText },
      ];
      await streamSkillRecommendation(activeKey, preceding);
    }
  }

  async function sendMessage(text: string) {
    if (!text) return;
    // Capture the session view at call time. The stream that follows is tied to
    // this key — even if the user switches sessions mid-stream, message updates
    // and the loading flag stay attached to the session that initiated the turn.
    const startKey = viewKey;
    let activeKey = startKey;
    const startedFromDraft = sessionId === undefined;
    if (loadingByKey[startKey]) return;

    userScrolledUp.current = false;
    setLoading(startKey, true);
    const ownerToken = Symbol("send");
    streamOwnerByKeyRef.current.set(startKey, ownerToken);

    const recommendEnabled = recommendChecked;
    const enabledCount = project?.enabledSkillSlugs?.length ?? Number.POSITIVE_INFINITY;
    const shouldRecommendAfter = !!projectId
      && recommendEnabled
      && enabledCount < RECOMMEND_SKILLS_THRESHOLD;

    const userMsg: ChatMessage = { role: "user", content: text };
    updateMessages(startKey, (prev) => [...prev, userMsg, { role: "assistant", content: "", events: [] }]);

    try {
      const token = getToken();
      const controller = new AbortController();
      abortByKeyRef.current.set(activeKey, controller);
      const modelToUse = currentModelSpec;
      const byok = modelToUse ? getBYOKForModel(modelToUse) : null;
      const response = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId, worldId, message: text, sessionId,
          locale: i18n.language, model: modelToUse, currentChapterId,
          ...(byok?.apiKey ? { apiKey: byok.apiKey } : {}),
          ...(byok?.baseURL ? { baseURL: byok.baseURL } : {}),
          ...(byok?.contextWindow ? { contextWindow: byok.contextWindow } : {}),
          ...(getCompactionSettings()?.threshold ? { compactionThreshold: getCompactionSettings()!.threshold } : {}),
        }),
        signal: controller.signal,
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

      const result = await consumeStream(response, activeKey, { startedFromDraft });
      activeKey = result.activeKey;
      await finalizeStream(activeKey, result.fullText, result.allEvents, result.mutatedTools, {
        recommendUserText: shouldRecommendAfter ? text : undefined,
      });
    } catch (err: any) {
      if (err.name === "AbortError") {
        // User stopped generation — keep partial content as-is
      } else {
        updateMessages(activeKey, (prev) => {
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
      }
    } finally {
      if (abortByKeyRef.current.get(activeKey)) {
        abortByKeyRef.current.delete(activeKey);
      }
      // Only clear loading if we still own the stream; otherwise another flow
      // (typically /reply taking over after a question answer) is now driving it.
      if (streamOwnerByKeyRef.current.get(activeKey) === ownerToken) {
        streamOwnerByKeyRef.current.delete(activeKey);
        setLoading(activeKey, false);
      }
    }
  }

  async function submitQuestionAnswers(callId: string, answers: string[][]): Promise<void> {
    const sid = sessionIdRef.current;
    if (!sid) throw new Error("No session for question reply");
    return resolveQuestion(sid, async (signal) => {
      const token = getToken();
      return fetch(`${API_BASE}/api/agent/question/${encodeURIComponent(callId)}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sessionId: sid, answers }),
        signal,
      });
    });
  }

  async function rejectQuestion(callId: string): Promise<void> {
    const sid = sessionIdRef.current;
    if (!sid) throw new Error("No session for question reject");
    return resolveQuestion(sid, async (signal) => {
      const token = getToken();
      return fetch(`${API_BASE}/api/agent/question/${encodeURIComponent(callId)}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sessionId: sid }),
        signal,
      });
    });
  }

  /**
   * Shared submit/reject pipeline. Aborts whatever stream is currently feeding
   * this session (typically the original /chat SSE that's parked on the
   * question), takes ownership of the loading flag so the aborted flow's
   * finally won't clear it, then consumes the SSE stream from /reply or
   * /reject and merges its events back into the conversation.
   */
  async function resolveQuestion(
    sid: string,
    fetchFn: (signal: AbortSignal) => Promise<Response>,
  ): Promise<void> {
    const ownerToken = Symbol("resolveQuestion");
    // Take ownership BEFORE aborting so the racing finally of the aborted
    // /chat flow sees a different owner and leaves loading=true alone.
    streamOwnerByKeyRef.current.set(sid, ownerToken);
    abortByKeyRef.current.get(sid)?.abort();
    abortByKeyRef.current.delete(sid);
    setLoading(sid, true);

    const controller = new AbortController();
    abortByKeyRef.current.set(sid, controller);

    try {
      const response = await fetchFn(controller.signal);
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorBody = await response.json();
          if (typeof errorBody?.error === "string" && errorBody.error) {
            errorMessage = errorBody.error;
          }
        } catch {
          // ignore
        }
        throw new Error(errorMessage);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream") && response.body) {
        const result = await consumeStream(response, sid, { startedFromDraft: false });
        await finalizeStream(result.activeKey, result.fullText, result.allEvents, result.mutatedTools, {});
      }
      // For non-SSE JSON responses (no live agent loop on the server), there's
      // nothing to stream — the loop has already finished and persisted, and
      // loadSession will surface its result the next time the user opens it.
    } catch (err: any) {
      if (err.name === "AbortError") return;
      throw err;
    } finally {
      if (abortByKeyRef.current.get(sid) === controller) {
        abortByKeyRef.current.delete(sid);
      }
      if (streamOwnerByKeyRef.current.get(sid) === ownerToken) {
        streamOwnerByKeyRef.current.delete(sid);
        setLoading(sid, false);
      }
    }
  }

  function handleStop() {
    abortByKeyRef.current.get(viewKey)?.abort();
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    sendMessage(text);
  }

  async function handleEditRetry(index: number, newContent: string) {
    if (isLoading) return;

    const editKey = viewKey;
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
    updateMessages(editKey, (prev) => prev.slice(0, index));
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
    // Mint a fresh draft key so the new view is empty even if a previous draft
    // (or any other session) is still streaming in the background.
    draftCounterRef.current += 1;
    setDraftKey(`draft-${draftCounterRef.current}`);
    setSessionId(undefined);
  }

  const suggestions = [
    t("chat.suggestion.listCharacters"),
    t("chat.suggestion.plotTwist"),
  ];

  // Keep the latest submit/reject closures in a ref so the context value can be
  // a stable identity. Without this, every AgentChatPanel re-render would push
  // a new context value and force every QuestionCard in the conversation to
  // re-render even when nothing about the question changed.
  const questionActionsRef = useRef({
    submitAnswers: submitQuestionAnswers,
    rejectQuestion: rejectQuestion,
  });
  questionActionsRef.current.submitAnswers = submitQuestionAnswers;
  questionActionsRef.current.rejectQuestion = rejectQuestion;
  const questionActions: QuestionActionContextValue = useMemo(() => ({
    submitAnswers: (callId, answers) => questionActionsRef.current.submitAnswers(callId, answers),
    rejectQuestion: (callId) => questionActionsRef.current.rejectQuestion(callId),
  }), []);

  return (
    <QuestionActionContext.Provider value={questionActions}>
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-1.5 border-b shrink-0 ${imm ? "border-white/10" : "border-gray-200"}`}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCompactionSettings(true)}
            className={`flex items-center gap-1 text-sm font-semibold transition-colors ${imm ? "text-white/80 hover:text-white" : "text-gray-700 hover:text-gray-900"}`}
            title={t("chat.compactionSettings")}
          >
            {t("chat.aiAssistant")}
            <Settings className="w-3.5 h-3.5 opacity-40" />
          </button>
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
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-8">
                {(modelsQuery.data?.available?.length === 0 && !hasBYOKKeys()) ? (
                  <>
                    <KeyRound className={`w-8 h-8 mx-auto mb-3 ${imm ? "text-white/20" : "text-gray-300"}`} />
                    <p className={`text-xs max-w-xs mx-auto ${imm ? "text-white/40" : "text-gray-400"}`}>
                      {t("byok.noServerModels")}
                    </p>
                  </>
                ) : (
                  <>
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
                  </>
                )}
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
                    {msg.source === "recommendation" && (
                      <div className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full ${
                        imm
                          ? "bg-teal-500/15 text-teal-300/90 border border-teal-300/20"
                          : "bg-teal-50 text-teal-700 border border-teal-200"
                      }`}>
                        <Sparkles className="w-3 h-3" />
                        Skill 推荐
                      </div>
                    )}
                    <AssistantMessageContent
                      events={msg.events}
                      content={msg.content}
                      isStreaming={isLoading && i === messages.length - 1}
                      immersive={imm}
                      skillProposalContext={skillProposalContext}
                      thinkingLabel={msg.source === "recommendation" ? "正在为你筛选 Skill…" : undefined}
                      sessionId={sessionId}
                    />
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

          {/* Input — unified card holding textarea + bottom controls (skill toggle, context, model, send) */}
          <div className={`border-t p-2 shrink-0 ${imm ? "border-white/10" : "border-gray-200"}`}>
            <div className={`rounded-2xl border transition-shadow focus-within:ring-1 focus-within:ring-teal-500/40 ${
              imm
                ? "bg-white/5 border-white/15"
                : "bg-white border-gray-300"
            }`}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("chat.inputPlaceholder")}
                rows={1}
                className={`w-full bg-transparent border-0 px-3 pt-2.5 pb-1 text-sm leading-normal focus:outline-none resize-none overflow-y-auto scrollbar-none ${
                  imm
                    ? "text-white/90 placeholder-white/30"
                    : "text-gray-900 placeholder-gray-400"
                }`}
                style={{ minHeight: "32px", maxHeight: "120px" }}
              />
              <div className="flex items-center gap-2 px-2 pb-2">
                {/* Left: Skill pill (recommend toggle + settings shortcut) */}
                {(projectId || worldId) && (
                  <div
                    className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full border ${
                      imm ? "border-white/10" : "border-gray-200"
                    }`}
                  >
                    <span className={`text-[11px] ${imm ? "text-white/55" : "text-gray-600"}`}>
                      Skill
                    </span>
                    {projectId && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={recommendChecked}
                        onClick={() => setRecommendChecked(!recommendChecked)}
                        title={recommendChecked
                          ? "自动推荐 Skill：已开启（每次回复后推荐）"
                          : "自动推荐 Skill：已关闭"}
                        className="group relative inline-flex items-center gap-1"
                      >
                        <span className={`text-[11px] ${
                          recommendChecked
                            ? imm ? "text-teal-300" : "text-teal-700"
                            : imm ? "text-white/55 group-hover:text-white/80" : "text-gray-600 group-hover:text-gray-800"
                        }`}>
                          推荐
                        </span>
                        <span
                          className={`relative inline-block w-7 h-3.5 rounded-full transition-colors ${
                            recommendChecked
                              ? imm ? "bg-teal-500/60" : "bg-teal-500"
                              : imm ? "bg-white/15 group-hover:bg-white/25" : "bg-gray-300 group-hover:bg-gray-400"
                          }`}
                        >
                          <span
                            className={`absolute top-[2px] left-[2px] w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${
                              recommendChecked ? "translate-x-[14px]" : "translate-x-0"
                            }`}
                          />
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowSkillSettings(true)}
                      title="Skill 启用配置"
                      className={`p-0.5 rounded transition-colors ${
                        imm
                          ? "text-white/45 hover:text-white/80 hover:bg-white/10"
                          : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Right cluster: context · model · send */}
                <div className="ml-auto flex items-center gap-1.5">
                  {/* Context circular indicator */}
                  {(() => {
                    const hasWindow = currentModelContextWindow > 0;
                    const ratio = hasWindow
                      ? Math.min(1, currentContextTokens / currentModelContextWindow)
                      : 0;
                    const pct = hasWindow ? Math.round(ratio * 100) : null;
                    const r = 5.5;
                    const c = 2 * Math.PI * r;
                    const colorCls =
                      !hasWindow ? (imm ? "text-white/30" : "text-gray-400") :
                      ratio > 0.9 ? "text-rose-400" :
                      ratio > 0.7 ? "text-amber-400" :
                      imm ? "text-teal-400" : "text-teal-500";
                    const title = hasWindow
                      ? `${tokenLabel} ${formatTokenK(currentContextTokens)} / ${formatTokenK(currentModelContextWindow)} (${pct}%)`
                      : `${tokenLabel} ${formatTokenK(currentContextTokens)} / 未知`;
                    return (
                      <span className={`inline-flex items-center px-1 ${colorCls}`} title={title} aria-label={title}>
                        <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
                          <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
                          {hasWindow && ratio > 0 && (
                            <circle
                              cx="7" cy="7" r={r} fill="none"
                              stroke="currentColor" strokeWidth="1.5"
                              strokeDasharray={`${ratio * c} ${c}`}
                              strokeLinecap="round"
                              transform="rotate(-90 7 7)"
                            />
                          )}
                        </svg>
                      </span>
                    );
                  })()}

                  {/* Model selector (custom dropdown) */}
                  <ModelDropdown
                    immersive={imm}
                    currentModelSpec={currentModelSpec}
                    defaultModel={modelsQuery.data?.default}
                    serverModels={modelsQuery.data?.available ?? []}
                    onSelect={setSelectedModel}
                    selectLabel={t("chat.selectModel")}
                    byokLabel={t("byok.usingOwnKey")}
                  />

                  {/* Send / Stop button — circular, prominent */}
                  {isLoading ? (
                    <button
                      onClick={handleStop}
                      title={t("chat.stop")}
                      className="w-7 h-7 rounded-full inline-flex items-center justify-center bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:bg-rose-500/30 transition-colors shrink-0"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                        <rect x="6" y="6" width="12" height="12" rx="1" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!input.trim()}
                      title={t("chat.send")}
                      className={`w-7 h-7 rounded-full inline-flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                        imm
                          ? "bg-white/85 text-gray-900 hover:bg-white"
                          : "bg-gray-800 text-white hover:bg-gray-900"
                      }`}
                    >
                      <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      <CompactionSettingsDialog
        open={showCompactionSettings}
        onClose={() => setShowCompactionSettings(false)}
      />
      {(projectId || worldId) && (
        <SkillSettingsDialog
          open={showSkillSettings}
          onClose={() => setShowSkillSettings(false)}
          projectId={projectId}
          worldId={worldId}
        />
      )}
    </div>
    </QuestionActionContext.Provider>
  );
}
