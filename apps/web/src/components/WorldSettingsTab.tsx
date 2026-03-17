import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
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
  worldLink?: boolean;
}

export default function WorldSettingsTab({ worldId, worldLink }: WorldSettingsTabProps) {
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

  const openEditMode = useCallback((ws: any) => {
    setExpandedWorldSettingId(ws._id);
    setEditingWorldSettingId(ws._id);
    setEditWorldCategory(ws.category || "");
    setEditWorldTitle(ws.title || "");
    setEditWorldContent(ws.content || "");
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
          {t("worldSetting.count", { count: worldSettings.length })}
          {worldLink && (
            <Link to="/world/$worldId" params={{ worldId }} className="ml-2 text-[10px] text-teal-500 hover:text-teal-600 normal-case font-normal">
              {t("worldSetting.fromWorld")}
            </Link>
          )}
        </h3>
        <button
          onClick={() => setShowWorldForm(true)}
          className="text-xs px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-500 transition-colors"
        >
          {t("worldSetting.addSetting")}
        </button>
      </div>

      {showWorldForm && (
        <div className="mb-4 p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">{t("worldSetting.newSetting")}</h4>
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
                className="flex-1 rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <input
                value={worldTitle}
                onChange={(e) => setWorldTitle(e.target.value)}
                placeholder={t("worldSetting.titlePlaceholder")}
                className="flex-1 rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <textarea
              value={worldContent}
              onChange={(e) => setWorldContent(e.target.value)}
              placeholder={t("worldSetting.descriptionPlaceholder")}
              rows={3}
              className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowWorldForm(false); setWorldCategory(""); setWorldTitle(""); setWorldContent(""); }}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                {t("worldSetting.cancel")}
              </button>
              <button
                type="submit"
                disabled={createWorldSettingMut.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
              >
                {createWorldSettingMut.isPending ? t("worldSetting.adding") : t("worldSetting.add")}
              </button>
            </div>
          </form>
        </div>
      )}

      {worldSettings.length === 0 && !showWorldForm ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          {t("worldSetting.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {worldSettings.map((ws: any) => {
            const isExpanded = expandedWorldSettingId === ws._id;
            const isEditing = editingWorldSettingId === ws._id;
            return (
              <div
                key={ws._id}
                className={`rounded-lg border bg-white transition-all ${isExpanded ? "border-teal-300 shadow-md" : "border-gray-200 hover:border-gray-300 hover:shadow-sm"}`}
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
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {ws.category}
                      </span>
                      <h4 className="text-sm font-medium text-gray-800">{ws.title}</h4>
                    </div>
                    {!isExpanded && ws.content && (
                      <p className="text-xs text-gray-500 line-clamp-2 ml-5">{ws.content}</p>
                    )}
                    {!isExpanded && ws.tags && ws.tags.length > 0 && (
                      <div className="flex gap-1 mt-2 ml-5">
                        {ws.tags.map((tag: string) => (
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
                        if (confirm(t("worldSetting.deleteConfirm", { name: ws.title }))) {
                          deleteWorldSettingMut.mutate({ id: ws._id });
                        }
                      }}
                      className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      {t("worldSetting.delete")}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
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
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("worldSetting.category")}</label>
                            <input
                              value={editWorldCategory}
                              onChange={(e) => setEditWorldCategory(e.target.value)}
                              placeholder={t("worldSetting.editCategoryPlaceholder")}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("worldSetting.title")}</label>
                            <input
                              value={editWorldTitle}
                              onChange={(e) => setEditWorldTitle(e.target.value)}
                              placeholder={t("worldSetting.titlePlaceholder")}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-3 mb-1.5">
                            <label className="block text-xs font-medium text-gray-500">{t("worldSetting.content")}</label>
                            <span className="text-[11px] text-gray-400">{t("worldSetting.supportsMarkdown")}</span>
                          </div>
                          <textarea
                            ref={editContentTextarea.ref}
                            value={editWorldContent}
                            onChange={(e) => setEditWorldContent(e.target.value)}
                            onInput={editContentTextarea.onInput}
                            onClick={(e) => e.stopPropagation()}
                            placeholder={t("worldSetting.contentPlaceholder")}
                            className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y leading-relaxed"
                            style={{ minHeight: "160px" }}
                          />
                        </div>
                        {ws.tags && ws.tags.length > 0 && (
                          <div className="flex gap-1">
                            {ws.tags.map((tag: string) => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingWorldSettingId(null)}
                            className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            {t("worldSetting.cancel")}
                          </button>
                          <button
                            type="submit"
                            disabled={updateWorldSettingMut.isPending}
                            className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
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
                        <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                          {ws.content ? (
                            <div className="world-setting-markdown text-sm text-gray-700 leading-relaxed break-words">
                              <Markdown remarkPlugins={[remarkGfm]}>{ws.content}</Markdown>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400 italic">{t("worldSetting.noContent")}</p>
                          )}
                        </div>
                        {ws.tags && ws.tags.length > 0 && (
                          <div className="flex gap-1">
                            {ws.tags.map((tag: string) => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3 text-[11px] text-gray-400">
                          <span>{t("worldSetting.clickHint")}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditMode(ws);
                            }}
                            className="px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:border-teal-300 hover:text-teal-600 transition-colors"
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
