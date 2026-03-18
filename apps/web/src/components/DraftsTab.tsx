import { useState, useRef, useEffect, useCallback } from "react";
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
}

export default function DraftsTab({ worldId }: DraftsTabProps) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const editContentTextarea = useAutoResizeTextarea(editContent);

  const draftsQuery = trpc.draft.list.useQuery({ worldId });
  const createMut = trpc.draft.create.useMutation({
    onSuccess: () => { draftsQuery.refetch(); setShowForm(false); setTitle(""); setContent(""); },
  });
  const updateMut = trpc.draft.update.useMutation({
    onSuccess: () => { draftsQuery.refetch(); setEditingId(null); },
  });
  const deleteMut = trpc.draft.delete.useMutation({
    onSuccess: () => { draftsQuery.refetch(); },
  });

  const drafts = (draftsQuery.data ?? []) as any[];

  const openEditMode = useCallback((draft: any) => {
    setExpandedId(draft._id);
    setEditingId(draft._id);
    setEditTitle(draft.title || "");
    setEditContent(draft.content || "");
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
          {t("draft.count", { count: drafts.length })}
        </h3>
        <button
          onClick={() => setShowForm(true)}
          className="text-xs px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-500 transition-colors"
        >
          {t("draft.addDraft")}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">{t("draft.newDraft")}</h4>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              createMut.mutate({
                worldId,
                title: title.trim(),
                content: content.trim() || undefined,
              });
            }}
            className="space-y-3"
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("draft.titlePlaceholder")}
              autoFocus
              className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("draft.contentPlaceholder")}
              rows={4}
              className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowForm(false); setTitle(""); setContent(""); }}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {t("draft.cancel")}
              </button>
              <button
                type="submit"
                disabled={createMut.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
              >
                {createMut.isPending ? t("draft.adding") : t("draft.add")}
              </button>
            </div>
          </form>
        </div>
      )}

      {drafts.length === 0 && !showForm ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          {t("draft.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((draft: any) => {
            const isExpanded = expandedId === draft._id;
            const isEditing = editingId === draft._id;
            return (
              <div
                key={draft._id}
                className={`rounded-lg border bg-white transition-all ${isExpanded ? "border-teal-300 shadow-md" : "border-gray-200 hover:border-gray-300 hover:shadow-sm"}`}
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
                      <h4 className="text-sm font-medium text-gray-800">{draft.title}</h4>
                    </div>
                    {!isExpanded && draft.content && (
                      <p className="text-xs text-gray-500 line-clamp-2 ml-5">{draft.content}</p>
                    )}
                    {!isExpanded && draft.tags && draft.tags.length > 0 && (
                      <div className="flex gap-1 mt-2 ml-5">
                        {draft.tags.map((tag: string) => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
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
                      className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      {t("draft.delete")}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
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
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("draft.title")}</label>
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder={t("draft.titlePlaceholder")}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-3 mb-1.5">
                            <label className="block text-xs font-medium text-gray-500">{t("draft.content")}</label>
                            <span className="text-[11px] text-gray-400">{t("draft.supportsMarkdown")}</span>
                          </div>
                          <textarea
                            ref={editContentTextarea.ref}
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onInput={editContentTextarea.onInput}
                            onClick={(e) => e.stopPropagation()}
                            placeholder={t("draft.contentPlaceholder")}
                            className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y leading-relaxed"
                            style={{ minHeight: "160px" }}
                          />
                        </div>
                        {draft.tags && draft.tags.length > 0 && (
                          <div className="flex gap-1">
                            {draft.tags.map((tag: string) => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            {t("draft.cancel")}
                          </button>
                          <button
                            type="submit"
                            disabled={updateMut.isPending}
                            className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
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
                        <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                          {draft.content ? (
                            <div className="world-setting-markdown text-sm text-gray-700 leading-relaxed break-words">
                              <Markdown remarkPlugins={[remarkGfm]}>{draft.content}</Markdown>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400 italic">{t("draft.noContent")}</p>
                          )}
                        </div>
                        {draft.tags && draft.tags.length > 0 && (
                          <div className="flex gap-1">
                            {draft.tags.map((tag: string) => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3 text-[11px] text-gray-400">
                          <span>{t("draft.clickHint")}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditMode(draft);
                            }}
                            className="px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:border-teal-300 hover:text-teal-600 transition-colors"
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
