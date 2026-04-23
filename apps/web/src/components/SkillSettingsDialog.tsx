import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, Tag, Search } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import SkillSearchDialog from "./SkillSearchDialog.js";
import { useSkillsRecommend } from "../lib/skillsRecommendPref.js";

type Scope = "project" | "world";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  worldId?: string;
}

export default function SkillSettingsDialog({ open, onClose, projectId, worldId }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  const skillsQuery = trpc.skill.list.useQuery(undefined, { enabled: open });
  const projectQuery = trpc.project.getById.useQuery(
    { id: projectId! },
    { enabled: open && !!projectId },
  );
  const worldQuery = trpc.world.getById.useQuery(
    { id: worldId! },
    { enabled: open && !!worldId },
  );

  const updateProject = trpc.project.update.useMutation();
  const updateWorld = trpc.world.update.useMutation();
  const utils = trpc.useUtils();
  const { enabled: recommendEnabled, setEnabled: setRecommendEnabled } = useSkillsRecommend(projectId);
  const [showSearch, setShowSearch] = useState(false);

  const initialScope: Scope = projectId ? "project" : "world";
  const [scope, setScope] = useState<Scope>(initialScope);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState("");
  const [search, setSearch] = useState("");

  const skills = (skillsQuery.data ?? []) as any[];
  const project = projectQuery.data as any;
  const world = worldQuery.data as any;

  const projectEnabledSlugs: string[] = project?.enabledSkillSlugs ?? [];
  const worldEnabledSlugs: string[] = world?.enabledSkillSlugs ?? [];

  // Sync local state from server data when scope changes / dialog opens.
  useEffect(() => {
    if (!open) return;
    const sourceSlugs = scope === "project" ? projectEnabledSlugs : worldEnabledSlugs;
    setSelected(new Set(sourceSlugs));
    setSaveStatus("");
  }, [open, scope, project?._id, world?._id, projectEnabledSlugs.join(","), worldEnabledSlugs.join(",")]);

  // Click outside / Escape. Suspended while the nested SkillSearchDialog is open —
  // otherwise clicking inside that child dialog (which lives in a separate portal,
  // so its target is "outside" this panel) would close us and unmount the child.
  useEffect(() => {
    if (!open || showSearch) return;
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
  }, [open, onClose, showSearch]);

  const filteredSkills = useMemo(() => {
    if (!search.trim()) return skills;
    const q = search.trim().toLowerCase();
    return skills.filter((s: any) => {
      return (
        (s.name ?? "").toLowerCase().includes(q) ||
        (s.slug ?? "").toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [skills, search]);

  // Sort by saved (server-truth) enabled set so toggling a checkbox doesn't reorder
  // mid-interaction. Order refreshes after Save (which invalidates the project query).
  const savedEnabledSet = useMemo(() => {
    const sourceSlugs = scope === "project" ? projectEnabledSlugs : worldEnabledSlugs;
    return new Set(sourceSlugs ?? []);
  }, [scope, projectEnabledSlugs, worldEnabledSlugs]);

  const sortedSkills = useMemo(() => {
    return [...filteredSkills].sort((a, b) => {
      const aOn = savedEnabledSet.has(String(a.slug)) ? 0 : 1;
      const bOn = savedEnabledSet.has(String(b.slug)) ? 0 : 1;
      return aOn - bOn;
    });
  }, [filteredSkills, savedEnabledSet]);

  // For a project chat, project's slugs are authoritative even when empty;
  // world is only consulted when no project is in scope.
  const activeScope: "project" | "world" | "empty" =
    projectId ? (projectEnabledSlugs.length > 0 ? "project" : "empty")
    : worldEnabledSlugs.length > 0 ? "world"
    : "empty";

  function toggle(slug: string) {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelected(next);
  }

  function selectAll() {
    setSelected(new Set(skills.map((s: any) => String(s.slug))));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function handleSave() {
    const enabledSkillSlugs = Array.from(selected);
    try {
      if (scope === "project" && projectId) {
        await updateProject.mutateAsync({ id: projectId, data: { enabledSkillSlugs } as any });
        await utils.project.getById.invalidate({ id: projectId });
      } else if (scope === "world" && worldId) {
        await updateWorld.mutateAsync({ id: worldId, data: { enabledSkillSlugs } as any });
        await utils.world.getById.invalidate({ id: worldId });
      }
      setSaveStatus("已保存");
      setTimeout(() => setSaveStatus(""), 1500);
    } catch (err) {
      setSaveStatus("保存失败");
      setTimeout(() => setSaveStatus(""), 2000);
    }
  }

  if (!open) return null;

  const scopeLabel = (s: Scope) => s === "project" ? "本项目" : "本世界";
  const sourceLabel =
    activeScope === "project" ? "项目级覆盖" :
    activeScope === "world" ? "世界级配置" :
    "未启用任何 Skill";

  return createPortal(
    <>
    <SkillSearchDialog
      open={showSearch}
      onClose={() => setShowSearch(false)}
      projectId={projectId}
      worldId={worldId}
    />
    <div className="fixed inset-0 z-[60] overflow-y-auto scrollbar-none bg-black/50 backdrop-blur-sm">
      <div className="min-h-full flex items-center justify-center p-4">
        <div ref={panelRef} className="glass-panel-solid rounded-2xl w-full max-w-lg mx-auto flex flex-col" style={{ maxHeight: "85vh" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-white text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-400" />
              Skill 启用配置
            </h2>
            <div className="flex items-center gap-2">
              {projectId && (
                <button
                  onClick={() => setShowSearch(true)}
                  className="text-[11px] px-2 py-1 rounded-md bg-teal-500/15 text-teal-300 hover:bg-teal-500/25 transition-colors flex items-center gap-1"
                  title="基于描述搜索 Skill"
                >
                  <Search className="w-3 h-3" />
                  推荐 Skill
                </button>
              )}
              <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scope tabs */}
          <div className="px-5 pt-4">
            <div className="flex items-center gap-2 mb-3">
              {(["project", "world"] as Scope[]).map((s) => {
                const disabled = (s === "world" && !worldId) || (s === "project" && !projectId);
                return (
                  <button
                    key={s}
                    onClick={() => !disabled && setScope(s)}
                    disabled={disabled}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      scope === s
                        ? "bg-teal-500/15 text-teal-400"
                        : disabled
                          ? "text-white/20 cursor-not-allowed"
                          : "text-white/40 hover:text-white/60 hover:bg-white/5"
                    }`}
                  >
                    {scopeLabel(s)}
                    {!disabled && (
                      (s === "project" && projectEnabledSlugs.length > 0) ||
                      (s === "world" && worldEnabledSlugs.length > 0)
                        ? <span className="ml-1.5 text-[10px] opacity-70">●</span>
                        : null
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] text-white/35">
                当前生效：<span className="text-white/55">{sourceLabel}</span>
                {projectId && <span className="ml-1">· 项目级优先于世界级</span>}
              </p>
              {scope === "project" && projectId && (
                <label className="flex items-center gap-2 cursor-pointer text-xs text-white/70 shrink-0">
                  <input
                    type="checkbox"
                    checked={recommendEnabled}
                    onChange={(e) => setRecommendEnabled(e.target.checked)}
                    className="accent-teal-500"
                  />
                  对话后自动推荐 Skill
                </label>
              )}
            </div>
          </div>

          {/* Skill list */}
          <div className="flex-1 min-h-0 px-5 pt-2 pb-2 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索 Skill"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <button onClick={selectAll} className="text-[10px] text-white/40 hover:text-teal-400 transition-colors px-1">全选</button>
              <button onClick={clearAll} className="text-[10px] text-white/40 hover:text-teal-400 transition-colors px-1">清空</button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none rounded-lg border border-white/5 divide-y divide-white/5">
              {skillsQuery.isLoading ? (
                <div className="text-center text-white/30 text-xs py-8">加载中…</div>
              ) : sortedSkills.length === 0 ? (
                <div className="text-center text-white/25 text-xs py-8">无可用 Skill</div>
              ) : (
                sortedSkills.map((s: any) => {
                  const slug = String(s.slug);
                  const checked = selected.has(slug);
                  return (
                    <label
                      key={slug}
                      className="flex items-start gap-3 px-3 py-2.5 hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(slug)}
                        className="mt-0.5 accent-teal-500 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs text-white/85">{s.name}</span>
                          <span className="text-[10px] text-white/30 font-mono">{s.slug}</span>
                          {s.isBuiltin && (
                            <span className="text-[9px] px-1 py-px rounded bg-teal-500/15 text-teal-400">内置</span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/35 leading-snug whitespace-pre-wrap">{s.description}</p>
                        {s.tags?.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {s.tags.slice(0, 4).map((tag: string) => (
                              <span key={tag} className="inline-flex items-center gap-0.5 text-[9px] px-1 py-px rounded bg-white/5 text-white/30">
                                <Tag className="w-2 h-2" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-[10px] text-white/30 mt-2">已选 {selected.size} / {skills.length}</p>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-3">
            {saveStatus && <span className="text-[10px] text-teal-400">{saveStatus}</span>}
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={updateProject.isPending || updateWorld.isPending}
              className="px-4 py-1.5 bg-teal-500/20 text-teal-400 rounded-lg text-sm hover:bg-teal-500/30 disabled:opacity-50 transition-colors"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
    </>,
    document.body,
  );
}
