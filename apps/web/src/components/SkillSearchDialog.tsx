import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Search, X } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import { getToken } from "../lib/auth.js";
import { getBYOKForModel, getBYOKModelSpecs } from "../lib/byokStorage.js";
import { parseProposeSkillsResult, type AgentEvent } from "./AgentMessageDisplay.js";
import SkillProposalCard from "./SkillProposalCard.js";

const API_BASE = "";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Initial project id; if absent and the user has multiple projects, a picker is shown. */
  projectId?: string;
  worldId?: string;
}

interface Proposal {
  reason: string;
  skills: Parameters<typeof SkillProposalCard>[0]["skills"];
}

export default function SkillSearchDialog({ open, onClose, projectId: initialProjectId, worldId }: Props) {
  const { i18n, t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(initialProjectId);
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [statusText, setStatusText] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const projectsQuery = trpc.project.list.useQuery(undefined, { enabled: open && !initialProjectId });
  const projectQuery = trpc.project.getById.useQuery(
    { id: selectedProjectId! },
    { enabled: open && !!selectedProjectId },
  );
  const project = projectQuery.data as { enabledSkillSlugs?: string[] } | undefined;
  const enabledSkillSlugSet = useMemo(
    () => new Set(project?.enabledSkillSlugs ?? []),
    [project?.enabledSkillSlugs],
  );
  const modelsQuery = trpc.agent.getModels.useQuery();
  // Mirror the resolution chain in AgentChatPanel: server default first, then the
  // user's first BYOK spec. Without the BYOK fallback, users on key-only setups
  // would send model=undefined and the server returns 403 (no allowed models).
  const modelToUse = modelsQuery.data?.default || getBYOKModelSpecs()[0];

  // Sync selected project from prop / single-project shortcut
  useEffect(() => {
    if (!open) return;
    if (initialProjectId) {
      setSelectedProjectId(initialProjectId);
      return;
    }
    const list = projectsQuery.data as any[] | undefined;
    if (list && list.length === 1) {
      setSelectedProjectId(list[0]._id);
    }
  }, [open, initialProjectId, projectsQuery.data]);

  // Reset on close
  useEffect(() => {
    if (open) return;
    setQuery("");
    setProposals([]);
    setStatusText("");
    setRunning(false);
    abortRef.current?.abort();
    abortRef.current = null;
  }, [open]);

  // Click outside / Escape
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const id = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    document.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  async function handleSearch() {
    const q = query.trim();
    if (!q || !selectedProjectId || running) return;

    setRunning(true);
    setProposals([]);
    setStatusText("正在搜索…");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = getToken();
      const byok = modelToUse ? getBYOKForModel(modelToUse) : null;
      const response = await fetch(`${API_BASE}/api/agent/recommend-skills`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId: selectedProjectId,
          worldId,
          customQuery: q,
          locale: i18n.language,
          model: modelToUse,
          ...(byok?.apiKey ? { apiKey: byok.apiKey } : {}),
          ...(byok?.baseURL ? { baseURL: byok.baseURL } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        setStatusText(`请求失败：HTTP ${response.status}`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            if (event.type === "tool_result" && event.toolName === "propose_skills") {
              const parsed = parseProposeSkillsResult(event.result);
              if (parsed && parsed.skills.length > 0) {
                setProposals((prev) => [...prev, parsed]);
              }
            }
            if (event.type === "error") {
              setStatusText(`错误：${event.error || "未知错误"}`);
            }
          } catch {
            // skip malformed
          }
        }
      }
      setStatusText(proposals.length === 0 ? "未找到匹配的 Skill" : "");
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setStatusText(err?.message || "请求失败");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  if (!open) return null;

  const projects = (projectsQuery.data as any[] | undefined) ?? [];
  const showProjectPicker = !initialProjectId && projects.length > 1;

  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 backdrop-blur-sm">
      <div className="min-h-full flex items-center justify-center p-4">
        <div ref={panelRef} className="glass-panel-solid rounded-2xl w-full max-w-xl mx-auto flex flex-col" style={{ maxHeight: "85vh" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-white text-sm font-medium flex items-center gap-2">
              <Search className="w-4 h-4 text-teal-400" />
              基于描述搜索 Skill
            </h2>
            <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3 overflow-y-auto">
            {showProjectPicker && (
              <div>
                <label className="block text-[11px] text-white/40 mb-1">选择项目</label>
                <select
                  value={selectedProjectId ?? ""}
                  onChange={(e) => setSelectedProjectId(e.target.value || undefined)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">{t("common.select", "请选择…")}</option>
                  {projects.map((p) => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[11px] text-white/40 mb-1">描述你想找的 Skill</label>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="例如：写赛博朋克侦探小说的开场和氛围"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/85 placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
              />
              <p className="text-[10px] text-white/30 mt-1">⌘/Ctrl + Enter 开始搜索</p>
            </div>

            <div className="flex items-center justify-end">
              <button
                onClick={handleSearch}
                disabled={!query.trim() || !selectedProjectId || running}
                className="px-3 py-1.5 text-xs rounded-md bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {running && <Loader2 className="w-3 h-3 animate-spin" />}
                开始搜索
              </button>
            </div>

            {statusText && (
              <p className="text-xs text-white/50">{statusText}</p>
            )}

            <div className="space-y-3">
              {proposals.map((p, i) => (
                <SkillProposalCard
                  key={i}
                  immersive
                  projectId={selectedProjectId}
                  reason={p.reason}
                  skills={p.skills}
                  alreadyEnabledSlugs={enabledSkillSlugSet}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
