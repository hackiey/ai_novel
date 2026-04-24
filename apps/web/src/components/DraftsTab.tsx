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

interface DraftsTabProps {
  worldId: string;
  createRequestKey?: number;
  searchQuery?: string;
  searchResultIds?: string[];
  searchMethod?: "vector" | "regex" | null;
  isSearching?: boolean;
}

type ScopeFilter = "all" | "world" | string; // string = a projectId

export default function DraftsTab({
  worldId,
  createRequestKey = 0,
  searchQuery = "",
  searchResultIds = [],
  searchMethod = null,
  isSearching = false,
}: DraftsTabProps) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  // Scope picker in the create form. "world" = world-level draft, otherwise a projectId.
  const [newScopeChoice, setNewScopeChoice] = useState<"world" | string>("world");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const editContentTextarea = useAutoResizeTextarea(editContent);

  const projectsQuery = trpc.project.listByWorld.useQuery({ worldId });
  const projects = (projectsQuery.data ?? []) as Array<{ _id: string; name: string }>;
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p._id, p.name);
    return map;
  }, [projects]);

  const draftsQuery = trpc.draft.list.useQuery({ worldId, includeAllProjectsUnderWorld: true });
  const createMut = trpc.draft.create.useMutation({
    onSuccess: () => { draftsQuery.refetch(); setShowForm(false); setTitle(""); setContent(""); setNewScopeChoice("world"); },
  });
  const updateMut = trpc.draft.update.useMutation({
    onSuccess: () => { draftsQuery.refetch(); setEditingId(null); },
  });
  const deleteMut = trpc.draft.delete.useMutation({
    onSuccess: () => { draftsQuery.refetch(); },
  });

  const drafts = (draftsQuery.data ?? []) as any[];
  const hasSearch = searchQuery.length > 0;
  const filteredByScope = useMemo(() => {
    if (scopeFilter === "all") return drafts;
    if (scopeFilter === "world") return drafts.filter((d) => !d.projectId);
    return drafts.filter((d) => d.projectId && String(d.projectId) === scopeFilter);
  }, [drafts, scopeFilter]);
  const visibleDrafts = useMemo(() => {
    if (!hasSearch) return filteredByScope;
    const byId = new Map(filteredByScope.map((draft) => [draft._id, draft]));
    return searchResultIds
      .map((id) => byId.get(id))
      .filter((draft): draft is any => Boolean(draft));
  }, [filteredByScope, hasSearch, searchResultIds]);

  useEffect(() => {
    if (createRequestKey > 0) {
      setShowForm(true);
    }
  }, [createRequestKey]);

  const openEditMode = useCallback((draft: any) => {
    setExpandedId(draft._id);
    setEditingId(draft._id);
    setEditTitle(draft.title || "");
    setEditContent(draft.content || "");
  }, []);

  return (
    <div>
      {!hasSearch && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-white/50">{t("draft.scope")}:</span>
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
            className="rounded-md bg-white/5 border border-white/15 px-2 py-1 text-white/80 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="all">{t("draft.scopeFilterAll")}</option>
            <option value="world">{t("draft.scopeFilterWorld")}</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {hasSearch && (
        <div className="mb-4 flex items-center gap-2 text-xs text-white/50">
          <span className="rounded-full border border-teal-500/20 bg-teal-500/10 px-2 py-1 text-teal-400">
            {searchMethod === "vector" ? t("search.semanticBadge") : t("search.keywordBadge")}
          </span>
          <span>
            {isSearching
              ? t("search.searching")
              : t("search.results", { count: visibleDrafts.length, query: searchQuery })}
          </span>
        </div>
      )}

      {showForm && (
        <div className="mb-4 p-4 rounded-xl glass-panel">
          <h4 className="text-sm font-semibold text-white/90 mb-3">{t("draft.newDraft")}</h4>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              const isProject = newScopeChoice !== "world";
              createMut.mutate({
                worldId,
                ...(isProject ? { projectId: newScopeChoice } : {}),
                scope: isProject ? "project" : "world",
                title: title.trim(),
                content: content.trim() || undefined,
              });
            }}
            className="space-y-3"
          >
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1.5">{t("draft.scopePickerLabel")}</label>
              <select
                value={newScopeChoice}
                onChange={(e) => setNewScopeChoice(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="world">{t("draft.scopePickerWorld")}</option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {t("draft.scopePickerProject", { name: p.name })}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-white/40">{t("draft.scopeHint")}</p>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("draft.titlePlaceholder")}
              autoFocus
              className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("draft.contentPlaceholder")}
              rows={4}
              className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowForm(false); setTitle(""); setContent(""); }}
                className="px-3 py-2 text-sm rounded-lg border border-white/20 text-white/60 hover:bg-white/5 transition-colors"
              >
                {t("draft.cancel")}
              </button>
              <button
                type="submit"
                disabled={createMut.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 disabled:opacity-50 transition-colors"
              >
                {createMut.isPending ? t("draft.adding") : t("draft.add")}
              </button>
            </div>
          </form>
        </div>
      )}

      {isSearching ? (
        <div className="text-center py-8 text-white/40 text-sm">
          {t("search.searching")}
        </div>
      ) : hasSearch && visibleDrafts.length === 0 && !showForm ? (
        <div className="text-center py-8 text-white/40 text-sm">
          {t("search.noResults", { query: searchQuery })}
        </div>
      ) : drafts.length === 0 && !showForm ? (
        <div className="text-center py-8 text-white/40 text-sm">
          {t("draft.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleDrafts.map((draft: any) => {
            const isExpanded = expandedId === draft._id;
            const isEditing = editingId === draft._id;
            return (
              <div
                key={draft._id}
                className={`rounded-lg border transition-all ${isExpanded ? "border-teal-400/30 bg-white/8" : "border-white/10 bg-white/5 hover:border-white/20"}`}
              >
                <div
                  className="flex items-start justify-between gap-3 p-4 cursor-pointer group"
                  onClick={() => {
                    if (isEditing) return;
                    setExpandedId(isExpanded ? null : draft._id);
                  }}
                  onDoubleClick={() => openEditMode(draft)}
                  title={isExpanded ? t("draft.doubleClickEdit") : t("draft.clickHint")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs transition-transform inline-block ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                      <h4 className="text-sm font-medium text-white/80">{draft.title}</h4>
                      {draft.projectId ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-400/10 text-amber-300">
                          {projectNameById.get(String(draft.projectId)) ?? t("draft.scopeProject")}
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-400/30 bg-sky-400/10 text-sky-300">
                          {t("draft.scopeWorld")}
                        </span>
                      )}
                    </div>
                    {!isExpanded && draft.content && (
                      <p className="text-xs text-white/50 line-clamp-2 ml-5">{draft.content}</p>
                    )}
                    {!isExpanded && draft.tags && draft.tags.length > 0 && (
                      <div className="flex gap-1 mt-2 ml-5">
                        {draft.tags.map((tag: string) => (
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
                        if (confirm(t("draft.deleteConfirm", { name: draft.title }))) {
                          deleteMut.mutate({ id: draft._id });
                        }
                      }}
                      className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      {t("draft.delete")}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/5">
                    {isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!editTitle.trim()) return;
                          updateMut.mutate({
                            id: draft._id,
                            data: {
                              title: editTitle.trim(),
                              content: editContent.trim(),
                            },
                          });
                        }}
                        className="space-y-4 pt-4"
                      >
                        <div>
                          <label className="block text-xs font-medium text-white/50 mb-1.5">{t("draft.title")}</label>
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder={t("draft.titlePlaceholder")}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-3 mb-1.5">
                            <label className="block text-xs font-medium text-white/50">{t("draft.content")}</label>
                            <span className="text-[11px] text-white/40">{t("draft.supportsMarkdown")}</span>
                          </div>
                          <textarea
                            ref={editContentTextarea.ref}
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onInput={editContentTextarea.onInput}
                            onClick={(e) => e.stopPropagation()}
                            placeholder={t("draft.contentPlaceholder")}
                            className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y leading-relaxed"
                            style={{ minHeight: "160px" }}
                          />
                        </div>
                        {draft.tags && draft.tags.length > 0 && (
                          <div className="flex gap-1">
                            {draft.tags.map((tag: string) => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-2 text-sm rounded-lg border border-white/20 text-white/60 hover:bg-white/5 transition-colors"
                          >
                            {t("draft.cancel")}
                          </button>
                          <button
                            type="submit"
                            disabled={updateMut.isPending}
                            className="px-4 py-2 text-sm rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 disabled:opacity-50 transition-colors"
                          >
                            {updateMut.isPending ? t("draft.saving") : t("draft.save")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div
                        className="space-y-4 pt-4"
                        onDoubleClick={() => openEditMode(draft)}
                        title={t("draft.doubleClickEdit")}
                      >
                        <div className="rounded-xl bg-white/5 border border-white/5 px-4 py-3">
                          {draft.content ? (
                            <div className="world-setting-markdown text-sm text-white/70 leading-relaxed break-words">
                              <Markdown remarkPlugins={[remarkGfm]}>{draft.content}</Markdown>
                            </div>
                          ) : (
                            <p className="text-sm text-white/40 italic">{t("draft.noContent")}</p>
                          )}
                        </div>
                        {draft.tags && draft.tags.length > 0 && (
                          <div className="flex gap-1">
                            {draft.tags.map((tag: string) => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3 text-[11px] text-white/40">
                          <span>{t("draft.clickHint")}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditMode(draft);
                            }}
                            className="px-2.5 py-1 rounded-md border border-white/10 text-white/50 hover:border-teal-400/30 hover:text-teal-400 transition-colors"
                          >
                            {t("draft.edit")}
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
