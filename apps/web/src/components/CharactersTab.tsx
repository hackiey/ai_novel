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

const importanceBadgeColors: Record<string, string> = {
  core: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  major: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  minor: "bg-white/5 text-white/60 border-white/10",
};

interface CharactersTabProps {
  worldId: string;
  createRequestKey?: number;
  searchQuery?: string;
  searchResultIds?: string[];
  searchMethod?: "vector" | "regex" | null;
  isSearching?: boolean;
}

export default function CharactersTab({
  worldId,
  createRequestKey = 0,
  searchQuery = "",
  searchResultIds = [],
  searchMethod = null,
  isSearching = false,
}: CharactersTabProps) {
  const { t } = useTranslation();
  const [showCharForm, setShowCharForm] = useState(false);
  const [charName, setCharName] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");

  const editTextarea = useAutoResizeTextarea(editContent);

  const charactersQuery = trpc.character.list.useQuery({ worldId });
  const createCharMut = trpc.character.create.useMutation({
    onSuccess: () => { charactersQuery.refetch(); setShowCharForm(false); setCharName(""); },
  });
  const updateCharMut = trpc.character.update.useMutation({
    onSuccess: () => { charactersQuery.refetch(); setEditingId(null); },
  });
  const deleteCharMut = trpc.character.delete.useMutation({
    onSuccess: () => { charactersQuery.refetch(); },
  });

  const characters = (charactersQuery.data ?? []) as any[];
  const hasSearch = searchQuery.length > 0;
  const visibleCharacters = useMemo(() => {
    if (!hasSearch) return characters;
    const byId = new Map(characters.map((char) => [char._id, char]));
    return searchResultIds
      .map((id) => byId.get(id))
      .filter((char): char is any => Boolean(char));
  }, [characters, hasSearch, searchResultIds]);

  useEffect(() => {
    if (createRequestKey > 0) {
      setShowCharForm(true);
    }
  }, [createRequestKey]);

  const openEditMode = useCallback((char: any) => {
    setExpandedId(char._id);
    setEditingId(char._id);
    setEditName(char.name || "");
    setEditContent(char.content || "");
  }, []);

  const getSummary = (char: any) => {
    return char.content || "";
  };

  const hasContent = (char: any) => {
    return !!char.content;
  };

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
              : t("search.results", { count: visibleCharacters.length, query: searchQuery })}
          </span>
        </div>
      )}

      {showCharForm && (
        <div className="mb-4 p-4 rounded-xl glass-panel">
          <h4 className="text-sm font-semibold text-white/90 mb-3">{t("character.newCharacter")}</h4>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!charName.trim()) return;
              createCharMut.mutate({
                worldId,
                name: charName.trim(),
              });
            }}
            className="flex gap-3 flex-wrap"
          >
            <input
              value={charName}
              onChange={(e) => setCharName(e.target.value)}
              placeholder={t("character.namePlaceholder")}
              className="flex-1 min-w-[200px] rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={createCharMut.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 disabled:opacity-50 transition-colors"
            >
              {createCharMut.isPending ? t("character.adding") : t("character.add")}
            </button>
            <button
              type="button"
              onClick={() => { setShowCharForm(false); setCharName(""); }}
              className="px-3 py-2 text-sm rounded-lg border border-white/20 text-white/60 hover:bg-white/5 transition-colors"
            >
              {t("character.cancel")}
            </button>
          </form>
        </div>
      )}

      {isSearching ? (
        <div className="text-center py-8 text-white/40 text-sm">
          {t("search.searching")}
        </div>
      ) : hasSearch && visibleCharacters.length === 0 && !showCharForm ? (
        <div className="text-center py-8 text-white/40 text-sm">
          {t("search.noResults", { query: searchQuery })}
        </div>
      ) : characters.length === 0 && !showCharForm ? (
        <div className="text-center py-8 text-white/40 text-sm">
          {t("character.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleCharacters.map((char: any) => {
            const isExpanded = expandedId === char._id;
            const isEditing = editingId === char._id;
            const badgeClass = importanceBadgeColors[char.importance] ?? importanceBadgeColors.minor;
            const summary = getSummary(char);
            return (
              <div
                key={char._id}
                className={`rounded-lg border transition-all ${isExpanded ? "border-teal-400/30 bg-white/8" : "border-white/10 bg-white/5 hover:border-white/20"}`}
              >
                <div
                  className="flex items-start justify-between gap-3 p-4 cursor-pointer group"
                  onClick={() => {
                    if (isEditing) return;
                    setExpandedId(isExpanded ? null : char._id);
                  }}
                  onDoubleClick={() => openEditMode(char)}
                  title={isExpanded ? t("character.doubleClickEdit") : t("character.clickHint")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs transition-transform inline-block ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeClass}`}>
                        {t(`character.importance_${char.importance}`) || char.importance}
                      </span>
                      <h4 className="text-sm font-medium text-white/80">{char.name}</h4>
                      {char.aliases && char.aliases.length > 0 && (
                        <span className="text-xs text-white/40">({char.aliases.join(", ")})</span>
                      )}
                    </div>
                    {!isExpanded && summary && (
                      <p className="text-xs text-white/50 line-clamp-2 ml-5">{summary}</p>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(t("character.deleteConfirm", { name: char.name }))) {
                          deleteCharMut.mutate({ id: char._id });
                        }
                      }}
                      className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      {t("character.delete")}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-white/5">
                    {isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!editName.trim()) return;
                          updateCharMut.mutate({
                            id: char._id,
                            data: {
                              name: editName.trim(),
                              content: editContent,
                            },
                          });
                        }}
                        className="space-y-4 pt-4"
                      >
                        <div>
                          <label className="block text-xs font-medium text-white/50 mb-1.5">{t("character.name")}</label>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder={t("character.namePlaceholder")}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-3 mb-1.5">
                            <label className="block text-xs font-medium text-white/50">{t("character.content")}</label>
                            <span className="text-[11px] text-white/40">{t("character.supportsMarkdown")}</span>
                          </div>
                          <textarea
                            ref={editTextarea.ref}
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            onInput={editTextarea.onInput}
                            onClick={(e) => e.stopPropagation()}
                            placeholder={t("character.contentPlaceholder")}
                            className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y leading-relaxed"
                            style={{ minHeight: "120px" }}
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-2 text-sm rounded-lg border border-white/20 text-white/60 hover:bg-white/5 transition-colors"
                          >
                            {t("character.cancel")}
                          </button>
                          <button
                            type="submit"
                            disabled={updateCharMut.isPending}
                            className="px-4 py-2 text-sm rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 disabled:opacity-50 transition-colors"
                          >
                            {updateCharMut.isPending ? t("character.saving") : t("character.save")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div
                        className="space-y-4 pt-4"
                        onDoubleClick={() => openEditMode(char)}
                        title={t("character.doubleClickEdit")}
                      >
                        {hasContent(char) ? (
                          <div className="rounded-xl bg-white/5 border border-white/5 px-4 py-3">
                            <div className="world-setting-markdown text-sm text-white/70 leading-relaxed break-words">
                              <Markdown remarkPlugins={[remarkGfm]}>{char.content}</Markdown>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl bg-white/5 border border-white/5 px-4 py-3">
                            <p className="text-sm text-white/40 italic">{t("character.noContent")}</p>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3 text-[11px] text-white/40">
                          <span>{t("character.clickHint")}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditMode(char);
                            }}
                            className="px-2.5 py-1 rounded-md border border-white/10 text-white/50 hover:border-teal-400/30 hover:text-teal-400 transition-colors"
                          >
                            {t("character.edit")}
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
