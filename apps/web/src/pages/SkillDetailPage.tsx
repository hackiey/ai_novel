import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Tag, Calendar, BadgeCheck, Globe, EyeOff, Bot } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import { useWriteTheme } from "../contexts/WriteThemeContext.js";

export default function SkillDetailPage() {
  const { t } = useTranslation();
  const { theme } = useWriteTheme();
  const cardClass = theme === "starfield" ? "glass-panel-lighter" : "glass-panel-light";
  const { skillId } = useParams({ strict: false }) as { skillId: string };

  const skillQuery = trpc.skill.getById.useQuery({ id: skillId });
  const skill = skillQuery.data as any;

  if (skillQuery.isLoading) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
        <div className="text-center text-white/40 text-sm py-12">{t("common.loading")}</div>
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
        <div className="text-center text-white/30 text-sm py-16">{t("skillMarket.notFound")}</div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <Link
          to="/skills"
          className="flex items-center gap-1.5 text-white/40 hover:text-teal-400 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t("skillMarket.backToMarket")}
        </Link>
        <span className="text-white/20">/</span>
        <span className="text-white/60 font-mono">{skill.name}</span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Title */}
          <div>
            <h1 className="text-2xl font-bold text-white/90 mb-2 font-mono">
              {skill.name}
            </h1>
            <p className="text-sm text-white/50 leading-relaxed">{skill.description}</p>
          </div>

          {/* Argument hint */}
          {skill.argumentHint && (
            <section className={`${cardClass} rounded-xl px-5 py-4`}>
              <h2 className="text-sm font-medium text-white/70 mb-2">{t("skillMarket.argumentHint")}</h2>
              <code className="text-sm text-teal-400/80 bg-black/20 px-3 py-1.5 rounded block">
                {skill.name} {skill.argumentHint}
              </code>
            </section>
          )}

          {/* Content */}
          {skill.content && (
            <section className={`${cardClass} rounded-xl px-5 py-4`}>
              <h2 className="text-sm font-medium text-white/70 mb-3">{t("skillMarket.content")}</h2>
              <pre className="text-xs text-white/45 bg-black/20 rounded-lg p-4 whitespace-pre-wrap break-words leading-relaxed">
                {skill.content}
              </pre>
            </section>
          )}
        </div>

        {/* Right: Sidebar */}
        <div className="lg:w-64 shrink-0 space-y-4">
          {/* Status */}
          <div className={`${cardClass} rounded-xl px-5 py-4 space-y-3`}>
            {skill.isBuiltin && (
              <div className="flex items-center gap-2 text-xs">
                <BadgeCheck className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-teal-400">{t("skillMarket.builtin")}</span>
              </div>
            )}
            {skill.isPublished && (
              <div className="flex items-center gap-2 text-xs">
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-blue-400">{t("skillMarket.published")}</span>
              </div>
            )}
            {skill.disableModelInvocation && (
              <div className="flex items-center gap-2 text-xs">
                <EyeOff className="w-3.5 h-3.5 text-amber-400/70" />
                <span className="text-amber-400/70">{t("skillMarket.modelInvocationDisabled")}</span>
              </div>
            )}
            {skill.userInvocable === false && (
              <div className="flex items-center gap-2 text-xs">
                <Bot className="w-3.5 h-3.5 text-white/40" />
                <span className="text-white/40">{t("skillMarket.agentOnly")}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-white/35">
              <Calendar className="w-3.5 h-3.5" />
              <span>{t("skillMarket.createdAt")}: {formatDate(skill.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/35">
              <Calendar className="w-3.5 h-3.5" />
              <span>{t("skillMarket.updatedAt")}: {formatDate(skill.updatedAt)}</span>
            </div>
          </div>

          {/* Tags */}
          {skill.tags?.length > 0 && (
            <div className={`${cardClass} rounded-xl px-5 py-4`}>
              <h3 className="text-xs font-medium text-white/50 mb-2">{t("skillMarket.tags")}</h3>
              <div className="flex flex-wrap gap-1.5">
                {skill.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-white/35"
                  >
                    <Tag className="w-2.5 h-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Skill Name */}
          <div className={`${cardClass} rounded-xl px-5 py-4`}>
            <h3 className="text-xs font-medium text-white/50 mb-2">Skill Name</h3>
            <code className="text-xs text-white/40 bg-black/20 px-2 py-1 rounded block">
              {skill.name}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
