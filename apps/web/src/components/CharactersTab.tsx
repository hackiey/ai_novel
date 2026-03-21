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

const roleBadgeColors: Record<string, string> = {
  protagonist: "bg-amber-50 text-amber-700 border-amber-200",
  antagonist: "bg-red-50 text-red-700 border-red-200",
  supporting: "bg-blue-50 text-blue-700 border-blue-200",
  minor: "bg-gray-50 text-gray-600 border-gray-200",
  other: "bg-gray-50 text-gray-500 border-gray-200",
};

const profileFields = ["appearance", "personality", "background", "goals"] as const;

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
  const [charRole, setCharRole] = useState("other");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("other");
  const [editProfile, setEditProfile] = useState<Record<string, string>>({});

  // Auto-resize for the currently focused textarea
  const [activeField, setActiveField] = useState("");
  const editTextarea = useAutoResizeTextarea(editProfile[activeField] || "");

  const charactersQuery = trpc.character.list.useQuery({ worldId });
  const createCharMut = trpc.character.create.useMutation({
    onSuccess: () => { charactersQuery.refetch(); setShowCharForm(false); setCharName(""); setCharRole("other"); },
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
    setEditRole(char.role || "other");
    setEditProfile({
      appearance: char.profile?.appearance || "",
      personality: char.profile?.personality || "",
      background: char.profile?.background || "",
      goals: char.profile?.goals || "",
    });
  }, []);

  const getSummary = (char: any) => {
    return char.profile?.personality || char.profile?.background || "";
  };

  const hasProfileContent = (char: any) => {
    return profileFields.some((f) => char.profile?.[f]);
  };

  return (
    <div>
      {hasSearch && (
        <div className="mb-4 flex items-center gap-2 text-xs text-gray-500">
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-teal-700">
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
        <div className="mb-4 p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">{t("character.newCharacter")}</h4>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!charName.trim()) return;
              createCharMut.mutate({
                worldId,
                name: charName.trim(),
                role: charRole as any,
              });
            }}
            className="flex gap-3 flex-wrap"
          >
            <input
              value={charName}
              onChange={(e) => setCharName(e.target.value)}
              placeholder={t("character.namePlaceholder")}
              className="flex-1 min-w-[200px] rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <select
              value={charRole}
              onChange={(e) => setCharRole(e.target.value)}
              className="rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="protagonist">{t("character.protagonist")}</option>
              <option value="antagonist">{t("character.antagonist")}</option>
              <option value="supporting">{t("character.supporting")}</option>
              <option value="minor">{t("character.minor")}</option>
              <option value="other">{t("character.other")}</option>
            </select>
            <button
              type="submit"
              disabled={createCharMut.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
            >
              {createCharMut.isPending ? t("character.adding") : t("character.add")}
            </button>
            <button
              type="button"
              onClick={() => { setShowCharForm(false); setCharName(""); setCharRole("other"); }}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {t("character.cancel")}
            </button>
          </form>
        </div>
      )}

      {isSearching ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          {t("search.searching")}
        </div>
      ) : hasSearch && visibleCharacters.length === 0 && !showCharForm ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          {t("search.noResults", { query: searchQuery })}
        </div>
      ) : characters.length === 0 && !showCharForm ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          {t("character.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleCharacters.map((char: any) => {
            const isExpanded = expandedId === char._id;
            const isEditing = editingId === char._id;
            const badgeClass = roleBadgeColors[char.role] ?? roleBadgeColors.other;
            const summary = getSummary(char);
            return (
              <div
                key={char._id}
                className={`rounded-lg border bg-white transition-all ${isExpanded ? "border-teal-300 shadow-md" : "border-gray-200 hover:border-gray-300 hover:shadow-sm"}`}
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
                        {t(`character.${char.role}`) || char.role}
                      </span>
                      <h4 className="text-sm font-medium text-gray-800">{char.name}</h4>
                      {char.aliases && char.aliases.length > 0 && (
                        <span className="text-xs text-gray-400">({char.aliases.join(", ")})</span>
                      )}
                    </div>
                    {!isExpanded && summary && (
                      <p className="text-xs text-gray-500 line-clamp-2 ml-5">{summary}</p>
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
                      className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      {t("character.delete")}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    {isEditing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!editName.trim()) return;
                          updateCharMut.mutate({
                            id: char._id,
                            data: {
                              name: editName.trim(),
                              role: editRole as any,
                              profile: {
                                appearance: editProfile.appearance || "",
                                personality: editProfile.personality || "",
                                background: editProfile.background || "",
                                goals: editProfile.goals || "",
                                relationships: char.profile?.relationships || [],
                                customFields: char.profile?.customFields || {},
                              },
                            },
                          });
                        }}
                        className="space-y-4 pt-4"
                      >
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("character.name")}</label>
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder={t("character.namePlaceholder")}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">{t("character.role")}</label>
                            <select
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            >
                              <option value="protagonist">{t("character.protagonist")}</option>
                              <option value="antagonist">{t("character.antagonist")}</option>
                              <option value="supporting">{t("character.supporting")}</option>
                              <option value="minor">{t("character.minor")}</option>
                              <option value="other">{t("character.other")}</option>
                            </select>
                          </div>
                        </div>
                        {profileFields.map((field) => (
                          <div key={field}>
                            <div className="flex items-center justify-between gap-3 mb-1.5">
                              <label className="block text-xs font-medium text-gray-500">{t(`character.${field}`)}</label>
                              <span className="text-[11px] text-gray-400">{t("character.supportsMarkdown")}</span>
                            </div>
                            <textarea
                              ref={activeField === field ? editTextarea.ref : undefined}
                              value={editProfile[field] || ""}
                              onChange={(e) => setEditProfile((prev) => ({ ...prev, [field]: e.target.value }))}
                              onFocus={() => setActiveField(field)}
                              onInput={activeField === field ? editTextarea.onInput : undefined}
                              onClick={(e) => e.stopPropagation()}
                              placeholder={t(`character.${field}Placeholder`)}
                              className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y leading-relaxed"
                              style={{ minHeight: "80px" }}
                            />
                          </div>
                        ))}
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            {t("character.cancel")}
                          </button>
                          <button
                            type="submit"
                            disabled={updateCharMut.isPending}
                            className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
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
                        {hasProfileContent(char) ? (
                          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 space-y-3">
                            {profileFields.map((field) => {
                              const val = char.profile?.[field];
                              if (!val) return null;
                              return (
                                <div key={field}>
                                  <h5 className="text-xs font-medium text-gray-500 mb-1">{t(`character.${field}`)}</h5>
                                  <div className="world-setting-markdown text-sm text-gray-700 leading-relaxed break-words">
                                    <Markdown remarkPlugins={[remarkGfm]}>{val}</Markdown>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                            <p className="text-sm text-gray-400 italic">{t("character.noContent")}</p>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3 text-[11px] text-gray-400">
                          <span>{t("character.clickHint")}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditMode(char);
                            }}
                            className="px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:border-teal-300 hover:text-teal-600 transition-colors"
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
