import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trpc } from "../lib/trpc.js";

function useAutoResizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const adjust = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(el.scrollHeight, 120) + "px";
  }, []);
  useEffect(() => { adjust(); }, [value, adjust]);
  return { ref, onInput: adjust };
}

interface WorldSettingsTabProps {
  worldId: string;
  createRequestKey?: number;
  searchQuery?: string;
  searchResultIds?: string[];
  searchMethod?: "vector" | "regex" | null;
  isSearching?: boolean;
}

export default function WorldSettingsTab({
  worldId,
  createRequestKey = 0,
  searchQuery = "",
  searchResultIds = [],
  searchMethod = null,
  isSearching = false,
}: WorldSettingsTabProps) {
  const { t } = useTranslation();
  const [showWorldForm, setShowWorldForm] = useState(false);
  const [worldCategory, setWorldCategory] = useState("");
  const [worldTitle, setWorldTitle] = useState("");
  const [worldContent, setWorldContent] = useState("");

  const [expandedWorldSettingId, setExpandedWorldSettingId] = useState<string | null>(null);
  const [editingWorldSettingId, setEditingWorldSettingId] = useState<string | null>(null);
  const [editWorldCategory, setEditWorldCategory] = useState("");
  const [editWorldTitle, setEditWorldTitle] = useState("");
  const [editWorldContent, setEditWorldContent] = useState("");

  const editContentTextarea = useAutoResizeTextarea(editWorldContent);

  const worldSettingsQuery = trpc.worldSetting.list.useQuery({ worldId });
  const createWorldSettingMut = trpc.worldSetting.create.useMutation({
    onSuccess: () => { worldSettingsQuery.refetch(); setShowWorldForm(false); setWorldCategory(""); setWorldTitle(""); setWorldContent(""); },
  });
  const updateWorldSettingMut = trpc.worldSetting.update.useMutation({
    onSuccess: () => { worldSettingsQuery.refetch(); setEditingWorldSettingId(null); },
  });
  const deleteWorldSettingMut = trpc.worldSetting.delete.useMutation({
    onSuccess: () => { worldSettingsQuery.refetch(); },
  });

  const worldSettings = (worldSettingsQuery.data ?? []) as any[];
  const hasSearch = searchQuery.length > 0;
  const visibleWorldSettings = useMemo(() => {
    if (!hasSearch) return worldSettings;
    const byId = new Map(worldSettings.map((ws) => [ws._id, ws]));
    return searchResultIds
      .map((id) => byId.get(id))
      .filter((ws): ws is any => Boolean(ws));
  }, [worldSettings, hasSearch, searchResultIds]);

  useEffect(() => {
    if (createRequestKey > 0) {
      setShowWorldForm(true);
    }
  }, [createRequestKey]);

  const openEditMode = useCallback((ws: any) => {
    setExpandedWorldSettingId(ws._id);
    setEditingWorldSettingId(ws._id);
    setEditWorldCategory(ws.category || "");
    setEditWorldTitle(ws.title || "");
    setEditWorldContent(ws.content || "");
  }, []);

  return (
    <div>
      {hasSearch && (
        <div className="mb-4 flex items-center gap-2 text-xs text-white/50">
          <span className="rounded-full border border-teal-500/20 bg-teal-500/10 px-2 py-1 text-teal-400">
            {searchMethod === "vector" ? t("search.semanticBadge") : t("search.keywordBadge")}
          </span>
          <span>
            {isSearching
              ? t("search.searching")
              : t("search.results", { count: visibleWorldSettings.length, query: searchQuery })}
          </span>
        </div>
      )}

      {showWorldForm && (
        <div className="mb-4 p-4 rounded-xl glass-panel">
          <h4 className="text-sm font-semibold text-white/90 mb-3">{t("worldSetting.newSetting")}</h4>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!worldCategory.trim() || !worldTitle.trim()) return;
              createWorldSettingMut.mutate({
                worldId,
                category: worldCategory.trim(),
                title: worldTitle.trim(),
                content: worldContent.trim() || undefined,
              });
            }}
            className="space-y-3"
          >
            <div className="flex gap-3">
              <input
                value={worldCategory}
                onChange={(e) => setWorldCategory(e.target.value)}
                placeholder={t("worldSetting.categoryPlaceholder")}
                className="flex-1 rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <input
                value={worldTitle}
                onChange={(e) => setWorldTitle(e.target.value)}
                placeholder={t("worldSetting.titlePlaceholder")}
                className="flex-1 rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <textarea
              value={worldContent}
              onChange={(e) => setWorldContent(e.target.value)}
              placeholder={t("worldSetting.descriptionPlaceholder")}
              rows={3}
              className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowWorldForm(false); setWorldCategory(""); setWorldTitle(""); setWorldContent(""); }}
                className="px-3 py-2 text-sm rounded-lg border border-white/20 text-white/60 hover:bg-white/5 transition-colors"
              >
                {t("worldSetting.cancel")}
              </button>
              <button
                type="submit"
                disabled={createWorldSettingMut.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 disabled:opacity-50 transition-colors"
              >
                {createWorldSettingMut.isPending ? t("worldSetting.adding") : t("worldSetting.add")}
              </button>
            </div>
          </form>
        </div>
      )}

      {isSearching ? (
        <div className="text-center py-8 text-white/40 text-sm">
          {t("search.searching")}
        </div>
      ) : hasSearch && visibleWorldSettings.length === 0 && !showWorldForm ? (
        <div className="text-center py-8 text-white/40 text-sm">
          {t("search.noResults", { query: searchQuery })}
        </div>
      ) : worldSettings.length === 0 && !showWorldForm ? (
        <div className="text-center py-8 text-white/40 text-sm">
          {t("worldSetting.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleWorldSettings.map((ws: any) => {
            const isExpanded = expandedWorldSettingId === ws._id;
            const isEditing = editingWorldSettingId === ws._id;
            return (
              <div
                key={ws._id}
                className={`rounded-lg border transition-all ${isExpanded ? "border-teal-400/30 bg-white/8" : "border-white/10 bg-white/5 hover:border-white/20"}`}
              >
                <div
                  className="flex items-start justify-between gap-3 p-4 cursor-pointer group"
                  onClick={() => {
                    if (isEditing) return;
                    if (isExpanded) {
                      setExpandedWorldSettingId(null);
                    } else {
                      setExpandedWorldSettingId(ws._id);
                    }
                  }}
                  onDoubleClick={() => openEditMode(ws)}
                  title={isExpanded ? t("worldSetting.doubleClickEdit") : t("worldSetting.clickHint")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs transition-transform inline-block ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {ws.category}
                      </span>
                      <h4 className="text-sm font-medium text-white/80">{ws.title}</h4>
                    </div>
                    {!isExpanded && ws.content && (
                      <p className="text-xs text-white/50 line-clamp-2 ml-5">{ws.content}</p>
                    )}
                    {!isExpanded && ws.tags && ws.tags.length > 0 && (
                      <div className="flex gap-1 mt-2 ml-5">
                        {ws.tags.map((tag: string) => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(t("worldSetting.deleteConfirm", { name: ws.title }))) {
                          deleteWorldSettingMut.mutate({ id: ws._id });
                        }
                      }}
                      className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      {t("worldSetting.delete")}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/5">
                    {isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!editWorldCategory.trim() || !editWorldTitle.trim()) return;
                          updateWorldSettingMut.mutate({
                            id: ws._id,
                            data: {
                              category: editWorldCategory.trim(),
                              title: editWorldTitle.trim(),
                              content: editWorldContent.trim(),
                            },
                          });
                        }}
                        className="space-y-4 pt-4"
                      >
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-white/50 mb-1.5">{t("worldSetting.category")}</label>
                            <input
                              value={editWorldCategory}
                              onChange={(e) => setEditWorldCategory(e.target.value)}
                              placeholder={t("worldSetting.editCategoryPlaceholder")}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-white/50 mb-1.5">{t("worldSetting.title")}</label>
                            <input
                              value={editWorldTitle}
                              onChange={(e) => setEditWorldTitle(e.target.value)}
                              placeholder={t("worldSetting.titlePlaceholder")}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-3 mb-1.5">
                            <label className="block text-xs font-medium text-white/50">{t("worldSetting.content")}</label>
                            <span className="text-[11px] text-white/40">{t("worldSetting.supportsMarkdown")}</span>
                          </div>
                          <textarea
                            ref={editContentTextarea.ref}
                            value={editWorldContent}
                            onChange={(e) => setEditWorldContent(e.target.value)}
                            onInput={editContentTextarea.onInput}
                            onClick={(e) => e.stopPropagation()}
                            placeholder={t("worldSetting.contentPlaceholder")}
                            className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y leading-relaxed"
                            style={{ minHeight: "160px" }}
                          />
                        </div>
                        {ws.tags && ws.tags.length > 0 && (
                          <div className="flex gap-1">
                            {ws.tags.map((tag: string) => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingWorldSettingId(null)}
                            className="px-3 py-2 text-sm rounded-lg border border-white/20 text-white/60 hover:bg-white/5 transition-colors"
                          >
                            {t("worldSetting.cancel")}
                          </button>
                          <button
                            type="submit"
                            disabled={updateWorldSettingMut.isPending}
                            className="px-4 py-2 text-sm rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 disabled:opacity-50 transition-colors"
                          >
                            {updateWorldSettingMut.isPending ? t("worldSetting.saving") : t("worldSetting.save")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div
                        className="space-y-4 pt-4"
                        onDoubleClick={() => openEditMode(ws)}
                        title={t("worldSetting.doubleClickEdit")}
                      >
                        <div className="rounded-xl bg-white/5 border border-white/5 px-4 py-3">
                          {ws.content ? (
                            <div className="world-setting-markdown text-sm text-white/70 leading-relaxed break-words">
                              <Markdown remarkPlugins={[remarkGfm]}>{ws.content}</Markdown>
                            </div>
                          ) : (
                            <p className="text-sm text-white/40 italic">{t("worldSetting.noContent")}</p>
                          )}
                        </div>
                        {ws.tags && ws.tags.length > 0 && (
                          <div className="flex gap-1">
                            {ws.tags.map((tag: string) => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3 text-[11px] text-white/40">
                          <span>{t("worldSetting.clickHint")}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditMode(ws);
                            }}
                            className="px-2.5 py-1 rounded-md border border-white/10 text-white/50 hover:border-teal-400/30 hover:text-teal-400 transition-colors"
                          >
                            {t("worldSetting.edit")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
