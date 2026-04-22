import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Sparkles, Search, Tag, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import { useWriteTheme } from "../contexts/WriteThemeContext.js";
import SkillSearchDialog from "../components/SkillSearchDialog.js";

type FilterTab = "all" | "builtin" | "published";

export default function SkillsPage() {
  const { t } = useTranslation();
  const { theme } = useWriteTheme();
  const cardClass = theme === "starfield" ? "glass-panel-lighter" : "glass-panel-light";

  const skillsQuery = trpc.skill.list.useQuery();
  const skills = (skillsQuery.data ?? []) as any[];

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [tagsOverflow, setTagsOverflow] = useState(false);
  const [collapsedTagHeight, setCollapsedTagHeight] = useState(56);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const tagRowRef = useRef<HTMLDivElement>(null);

  // Apply tab + search filters (NOT tag) — used for both tag count basis and final list
  const beforeTag = useMemo(() => {
    let list = skills;

    if (filter === "builtin") list = list.filter((s: any) => s.isBuiltin);
    if (filter === "published") list = list.filter((s: any) => s.isPublished && !s.isBuiltin);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s: any) => {
        const name = (s.name ?? "").toLowerCase();
        const slug = (s.slug ?? "").toLowerCase();
        const desc = (s.description ?? "").toLowerCase();
        const tags = (s.tags ?? []).join(" ").toLowerCase();
        return name.includes(q) || slug.includes(q) || desc.includes(q) || tags.includes(q);
      });
    }

    return list;
  }, [skills, filter, search]);

  // Tag counts based on beforeTag set, sorted desc by count; hide tags with count == 1
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of beforeTag) {
      for (const tag of (s.tags ?? [])) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [beforeTag]);

  // Final filtered list applies selected tag
  const filtered = useMemo(() => {
    if (!selectedTag) return beforeTag;
    return beforeTag.filter((s: any) => (s.tags ?? []).includes(selectedTag));
  }, [beforeTag, selectedTag]);

  // Reset tag if it becomes invalid (e.g., after switching filter tab)
  useEffect(() => {
    if (selectedTag && !tagCounts.some(([t]) => t === selectedTag)) {
      setSelectedTag(null);
    }
  }, [selectedTag, tagCounts]);

  // Detect whether tag row overflows two lines, and compute exact 2-row height from
  // the actual chip dimensions so we don't bleed a third row's top edge.
  useEffect(() => {
    const el = tagRowRef.current;
    if (!el) {
      setTagsOverflow(false);
      return;
    }
    const measure = () => {
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) return;
      const rowH = first.offsetHeight;
      const cs = window.getComputedStyle(el);
      const gap = parseFloat(cs.rowGap || cs.gap || "6") || 6;
      const twoRows = Math.ceil(rowH * 2 + gap);
      setCollapsedTagHeight(twoRows);

      const prevMaxHeight = el.style.maxHeight;
      el.style.maxHeight = "none";
      const fullHeight = el.scrollHeight;
      el.style.maxHeight = prevMaxHeight;
      setTagsOverflow(fullHeight > twoRows + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tagCounts]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: t("skills.all") },
    { key: "builtin", label: t("skills.builtinTab") },
    { key: "published", label: t("skills.published") },
  ];

  return (
    <div className="px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white/90 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-400" />
            {t("skills.title")}
          </h1>
          <p className="text-sm text-white/40 mt-1">{t("skills.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowSearchDialog(true)}
          className="shrink-0 mt-1 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-teal-500/15 text-teal-300 hover:bg-teal-500/25 transition-colors"
          title="基于描述向某个项目推荐 Skill"
        >
          <Search className="w-3.5 h-3.5" />
          推荐到项目
        </button>
      </div>

      <SkillSearchDialog
        open={showSearchDialog}
        onClose={() => setShowSearchDialog(false)}
      />


      {/* Search bar */}
      <div className={`${cardClass} rounded-xl px-4 py-2.5 flex items-center gap-3 mb-4`}>
        <Search className="w-4 h-4 text-white/30 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("skills.search")}
          className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/30 outline-none"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              filter === tab.key
                ? "bg-teal-500/15 text-teal-400"
                : "text-white/40 hover:text-white/60 hover:bg-white/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tag filter */}
      {tagCounts.length > 0 && (
        <div className="mb-5">
          <div
            ref={tagRowRef}
            className="flex flex-wrap items-center gap-1.5 overflow-hidden"
            style={{ maxHeight: tagsExpanded ? "none" : `${collapsedTagHeight}px` }}
          >
            <button
              onClick={() => setSelectedTag(null)}
              className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                selectedTag === null
                  ? "bg-teal-500/15 text-teal-400"
                  : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
              }`}
            >
              {t("skills.all")}
              <span className="opacity-70">({beforeTag.length})</span>
            </button>
            {tagCounts.map(([tag, count]) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                  selectedTag === tag
                    ? "bg-teal-500/15 text-teal-400"
                    : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
                }`}
              >
                <Tag className="w-2.5 h-2.5" />
                {tag}
                <span className="opacity-70">({count})</span>
              </button>
            ))}
          </div>
          {(tagsOverflow || tagsExpanded) && (
            <button
              onClick={() => setTagsExpanded((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-teal-400 transition-colors"
            >
              {tagsExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  收起
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  展开全部 ({tagCounts.length})
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Skill list */}
      {skillsQuery.isLoading ? (
        <div className="text-center text-white/40 text-sm py-12">{t("common.loading")}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-white/30 text-sm py-16">
          {search.trim() ? t("skills.noResults") : t("skills.empty")}
        </div>
      ) : (
        <div className={`${cardClass} rounded-xl overflow-hidden divide-y divide-white/5`}>
          {filtered.map((skill: any, index: number) => (
            <Link
              key={skill._id}
              to="/skills/$skillId"
              params={{ skillId: skill._id }}
              className="flex items-start gap-4 px-5 py-3.5 hover:bg-white/5 transition-colors group"
            >
              {/* Index */}
              <span className="text-xs text-white/20 w-6 text-right shrink-0 tabular-nums mt-1">
                {index + 1}
              </span>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-white/90 group-hover:text-teal-400 transition-colors">
                    {skill.name}
                  </span>
                  {skill.slug && (
                    <span className="text-[10px] text-white/30 font-mono">
                      {skill.slug}
                    </span>
                  )}
                  {skill.isBuiltin && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-400">
                      {t("skills.builtin")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/35 whitespace-pre-wrap leading-snug">
                  {skill.description}
                </p>
              </div>

              {/* Tags */}
              <div className="hidden sm:flex items-center gap-1.5 shrink-0 mt-1">
                {(skill.tags ?? []).slice(0, 3).map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/25"
                  >
                    <Tag className="w-2.5 h-2.5" />
                    {tag}
                  </span>
                ))}
              </div>

              {/* Arrow */}
              <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/40 shrink-0 transition-colors mt-1" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
