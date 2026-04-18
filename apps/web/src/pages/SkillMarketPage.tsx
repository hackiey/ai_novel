import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Sparkles, Search, Tag, ChevronRight } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import { useWriteTheme } from "../contexts/WriteThemeContext.js";

type FilterTab = "all" | "builtin" | "published";

export default function SkillMarketPage() {
  const { t } = useTranslation();
  const { theme } = useWriteTheme();
  const cardClass = theme === "starfield" ? "glass-panel-lighter" : "glass-panel-light";

  const skillsQuery = trpc.skill.list.useQuery();
  const skills = (skillsQuery.data ?? []) as any[];

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");

  const filtered = useMemo(() => {
    let list = skills;

    // filter tab
    if (filter === "builtin") list = list.filter((s: any) => s.isBuiltin);
    if (filter === "published") list = list.filter((s: any) => s.isPublished && !s.isBuiltin);

    // search
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

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: t("skillMarket.all") },
    { key: "builtin", label: t("skillMarket.builtinTab") },
    { key: "published", label: t("skillMarket.published") },
  ];

  return (
    <div className="px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white/90 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-teal-400" />
          {t("skillMarket.title")}
        </h1>
        <p className="text-sm text-white/40 mt-1">{t("skillMarket.subtitle")}</p>
      </div>

      {/* Search bar */}
      <div className={`${cardClass} rounded-xl px-4 py-2.5 flex items-center gap-3 mb-4`}>
        <Search className="w-4 h-4 text-white/30 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("skillMarket.search")}
          className="flex-1 bg-transparent text-sm text-white/80 placeholder-white/30 outline-none"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-5">
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

      {/* Skill list */}
      {skillsQuery.isLoading ? (
        <div className="text-center text-white/40 text-sm py-12">{t("common.loading")}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-white/30 text-sm py-16">
          {search.trim() ? t("skillMarket.noResults") : t("skillMarket.empty")}
        </div>
      ) : (
        <div className={`${cardClass} rounded-xl overflow-hidden divide-y divide-white/5`}>
          {filtered.map((skill: any, index: number) => (
            <Link
              key={skill._id}
              to="/skills/$skillId"
              params={{ skillId: skill._id }}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 transition-colors group"
            >
              {/* Index */}
              <span className="text-xs text-white/20 w-6 text-right shrink-0 tabular-nums">
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
                      {t("skillMarket.builtin")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/35 truncate">
                  {skill.description}
                </p>
              </div>

              {/* Tags */}
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
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
              <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-white/40 shrink-0 transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
