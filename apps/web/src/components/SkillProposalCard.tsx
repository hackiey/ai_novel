import { useMemo, useState } from "react";
import { Sparkles, Tag, Check, Loader2 } from "lucide-react";
import { trpc } from "../lib/trpc.js";

export interface ProposedSkill {
  /** May be absent on cards from the agent (which only knows slugs); kept optional. */
  _id?: string;
  slug: string;
  name: string;
  description: string;
  tags?: string[];
  isBuiltin?: boolean;
}

interface Props {
  projectId?: string;
  reason: string;
  skills: ProposedSkill[];
  /** Slugs of skills already enabled on the project (used to disable / pre-mark items). */
  alreadyEnabledSlugs: Set<string>;
  immersive?: boolean;
}

export default function SkillProposalCard({
  projectId,
  reason,
  skills,
  alreadyEnabledSlugs,
  immersive,
}: Props) {
  const utils = trpc.useUtils();
  const addMutation = trpc.project.addEnabledSkills.useMutation();

  const initiallySelectable = useMemo(() => {
    return skills.filter((s) => !alreadyEnabledSlugs.has(s.slug)).map((s) => s.slug);
  }, [skills, alreadyEnabledSlugs]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(initiallySelectable));
  const [submitted, setSubmitted] = useState<{ count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(slug: string) {
    if (alreadyEnabledSlugs.has(slug) || submitted) return;
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setSelected(next);
  }

  async function handleAdd() {
    if (!projectId || submitted) return;
    const slugs = Array.from(selected).filter((slug) => !alreadyEnabledSlugs.has(slug));
    if (slugs.length === 0) return;
    setError(null);
    try {
      await addMutation.mutateAsync({ id: projectId, skillSlugs: slugs });
      await utils.project.getById.invalidate({ id: projectId });
      setSubmitted({ count: slugs.length });
    } catch (err: any) {
      setError(err?.message || "添加失败");
    }
  }

  const selectableCount = skills.length - skills.filter((s) => alreadyEnabledSlugs.has(s.slug)).length;
  const newlySelectedCount = Array.from(selected).filter((slug) => !alreadyEnabledSlugs.has(slug)).length;
  const isPending = addMutation.isPending;

  const cardCls = immersive
    ? "rounded-xl border border-teal-300/20 bg-teal-500/5 backdrop-blur-sm"
    : "rounded-xl border border-teal-200 bg-teal-50/50";
  const titleCls = immersive ? "text-white/85" : "text-gray-800";
  const reasonCls = immersive ? "text-white/55" : "text-gray-600";
  const itemCls = immersive
    ? "border-white/10 bg-white/5 hover:bg-white/10"
    : "border-gray-200 bg-white hover:bg-gray-50";
  const itemDisabledCls = immersive ? "opacity-40" : "opacity-50";
  const slugCls = immersive ? "text-white/35" : "text-gray-400";
  const descCls = immersive ? "text-white/45" : "text-gray-500";
  const builtinBadgeCls = immersive
    ? "bg-teal-500/15 text-teal-300"
    : "bg-teal-100 text-teal-700";
  const tagCls = immersive ? "bg-white/5 text-white/35" : "bg-gray-100 text-gray-500";
  const enabledLabelCls = immersive ? "text-teal-300/80" : "text-teal-700";

  if (submitted) {
    return (
      <div className={`${cardCls} px-4 py-3`}>
        <div className="flex items-center gap-2 text-xs">
          <Check className={`w-4 h-4 ${immersive ? "text-teal-300" : "text-teal-600"}`} />
          <span className={titleCls}>已添加 {submitted.count} 个 Skill 到本项目</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className={`flex items-start gap-2 px-4 pt-3 pb-2 ${immersive ? "border-b border-white/10" : "border-b border-teal-100"}`}>
        <Sparkles className={`w-4 h-4 mt-0.5 shrink-0 ${immersive ? "text-teal-300" : "text-teal-600"}`} />
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-medium ${titleCls}`}>推荐启用以下 Skill</div>
          {reason && <p className={`text-[11px] mt-0.5 leading-snug ${reasonCls}`}>{reason}</p>}
        </div>
      </div>

      <div className="divide-y divide-white/5 px-2 py-1">
        {skills.length === 0 ? (
          <div className={`text-center text-xs py-6 ${descCls}`}>无可推荐的 Skill</div>
        ) : (
          skills.map((s) => {
            const enabled = alreadyEnabledSlugs.has(s.slug);
            const checked = enabled || selected.has(s.slug);
            return (
              <label
                key={s.slug}
                className={`flex items-start gap-3 px-2 py-2 my-1 rounded-md border transition-colors ${
                  enabled ? itemDisabledCls : "cursor-pointer"
                } ${itemCls}`}
                onClick={(e) => {
                  if (enabled) e.preventDefault();
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={enabled || isPending}
                  onChange={() => toggle(s.slug)}
                  className="mt-0.5 accent-teal-500 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className={`text-xs ${titleCls}`}>{s.name}</span>
                    <span className={`text-[10px] font-mono ${slugCls}`}>{s.slug}</span>
                    {s.isBuiltin && (
                      <span className={`text-[9px] px-1 py-px rounded ${builtinBadgeCls}`}>内置</span>
                    )}
                    {enabled && (
                      <span className={`text-[10px] ${enabledLabelCls}`}>已启用</span>
                    )}
                  </div>
                  {s.description && (
                    <p className={`text-[11px] leading-snug whitespace-pre-wrap ${descCls}`}>{s.description}</p>
                  )}
                  {s.tags && s.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {s.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className={`inline-flex items-center gap-0.5 text-[9px] px-1 py-px rounded ${tagCls}`}>
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

      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 ${immersive ? "border-t border-white/10" : "border-t border-teal-100"}`}>
        <span className={`text-[10px] ${descCls}`}>
          {selectableCount === 0
            ? "全部已启用"
            : `已选 ${newlySelectedCount} / ${selectableCount}`}
        </span>
        <div className="flex items-center gap-2">
          {error && <span className="text-[10px] text-rose-400">{error}</span>}
          <button
            onClick={handleAdd}
            disabled={isPending || newlySelectedCount === 0 || !projectId}
            className={`px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
              immersive
                ? "bg-teal-500/20 text-teal-300 hover:bg-teal-500/30"
                : "bg-teal-500 text-white hover:bg-teal-600"
            } disabled:opacity-50`}
          >
            {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            添加 {newlySelectedCount > 0 ? `${newlySelectedCount} 个` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
