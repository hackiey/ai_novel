import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, Tag } from "lucide-react";
import { trpc } from "../lib/trpc.js";

type Scope = "project" | "world";
type Mode = "all" | "custom";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  worldId?: string;
}

export default function SkillSettingsDialog({ open, onClose, projectId, worldId }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  const skillsQuery = trpc.skill.list.useQuery(undefined, { enabled: open });
  const projectQuery = trpc.project.getById.useQuery({ id: projectId }, { enabled: open });
  const worldQuery = trpc.world.getById.useQuery(
    { id: worldId! },
    { enabled: open && !!worldId },
  );

  const updateProject = trpc.project.update.useMutation();
  const updateWorld = trpc.world.update.useMutation();
  const utils = trpc.useUtils();

  const [scope, setScope] = useState<Scope>("project");
  const [mode, setMode] = useState<Mode>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState("");
  const [search, setSearch] = useState("");

  const skills = (skillsQuery.data ?? []) as any[];
  const project = projectQuery.data as any;
  const world = worldQuery.data as any;

  const projectEnabledIds: string[] | undefined = project?.enabledSkillIds?.map((id: any) => String(id));
  const worldEnabledIds: string[] | undefined = world?.enabledSkillIds?.map((id: any) => String(id));

  // Sync local state from server data when scope changes or dialog opens
  useEffect(() => {
    if (!open) return;
    const sourceIds = scope === "project" ? projectEnabledIds : worldEnabledIds;
    if (sourceIds === undefined) {
      setMode("all");
      setSelected(new Set());
    } else {
      setMode("custom");
      setSelected(new Set(sourceIds));
    }
    setSaveStatus("");
  }, [open, scope, project?._id, world?._id, projectEnabledIds?.join(","), worldEnabledIds?.join(",")]);

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

  // Determine which scope is currently active (for display)
  const activeScope: "project" | "world" | "default" =
    projectEnabledIds !== undefined ? "project" :
    worldEnabledIds !== undefined ? "world" :
    "default";

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectAll() {
    setSelected(new Set(skills.map((s: any) => String(s._id))));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function handleSave() {
    const enabledSkillIds = mode === "all" ? null : Array.from(selected);
    try {
      if (scope === "project") {
        await updateProject.mutateAsync({ id: projectId, data: { enabledSkillIds } as any });
        await utils.project.getById.invalidate({ id: projectId });
      } else if (worldId) {
        await updateWorld.mutateAsync({ id: worldId, data: { enabledSkillIds } as any });
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
    "默认（全部启用）";

  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 backdrop-blur-sm">
      <div className="min-h-full flex items-center justify-center p-4">
        <div ref={panelRef} className="glass-panel-solid rounded-2xl w-full max-w-lg mx-auto flex flex-col" style={{ maxHeight: "85vh" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-white text-sm font-medium flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-400" />
              Skill 启用配置
            </h2>
            <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scope tabs */}
          <div className="px-5 pt-4">
            <div className="flex items-center gap-2 mb-3">
              {(["project", "world"] as Scope[]).map((s) => {
                const disabled = s === "world" && !worldId;
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
                      (s === "project" && projectEnabledIds !== undefined) ||
                      (s === "world" && worldEnabledIds !== undefined)
                        ? <span className="ml-1.5 text-[10px] opacity-70">●</span>
                        : null
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-white/35">
              当前生效：<span className="text-white/55">{sourceLabel}</span>
              {activeScope !== "default" && <span className="ml-1">· 项目级优先于世界级</span>}
            </p>
          </div>

          {/* Mode */}
          <div className="px-5 pt-4 pb-2 flex items-center gap-4">
            {(["all", "custom"] as Mode[]).map((m) => (
              <label key={m} className="flex items-center gap-2 cursor-pointer text-xs text-white/70">
                <input
                  type="radio"
                  name="skill-mode"
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  className="accent-teal-500"
                />
                {m === "all" ? "使用所有可用 Skill" : "自定义启用"}
              </label>
            ))}
          </div>

          {/* Custom skill list */}
          {mode === "custom" && (
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
              <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-white/5 divide-y divide-white/5">
                {skillsQuery.isLoading ? (
                  <div className="text-center text-white/30 text-xs py-8">加载中…</div>
                ) : filteredSkills.length === 0 ? (
                  <div className="text-center text-white/25 text-xs py-8">无可用 Skill</div>
                ) : (
                  filteredSkills.map((s: any) => {
                    const id = String(s._id);
                    const checked = selected.has(id);
                    return (
                      <label
                        key={id}
                        className="flex items-start gap-3 px-3 py-2.5 hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(id)}
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
                          <p className="text-[11px] text-white/35 leading-snug line-clamp-2">{s.description}</p>
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
          )}

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
    </div>,
    document.body,
  );
}
