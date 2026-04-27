import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from "react-native";
import { trpc } from "../lib/trpc";
import { useTranslation } from "react-i18next";
import Markdown from "react-native-markdown-display";
import { getMarkdownStyles } from "../lib/markdownStyles";
import { useTheme } from "../contexts/ThemeContext";
import TagsEditor from "./TagsEditor";

interface Props {
  worldId: string;
  searchResultIds?: Set<string>;
}

type ScopeFilter = "all" | "world" | string;

export default function DraftsTab({ worldId, searchResultIds }: Props) {
  const { t } = useTranslation();
  const { colors, baseStyles: base } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [newScopeChoice, setNewScopeChoice] = useState<"world" | string>("world");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editScopeChoice, setEditScopeChoice] = useState<"world" | string>("world");
  const [editOriginalScope, setEditOriginalScope] = useState<"world" | string>("world");

  const projectsQuery = trpc.project.listByWorld.useQuery({ worldId });
  const projects = (projectsQuery.data ?? []) as Array<{ _id: string; name: string }>;
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p._id, p.name);
    return map;
  }, [projects]);

  const query = trpc.draft.list.useQuery({ worldId, includeAllProjectsUnderWorld: true });
  const createMut = trpc.draft.create.useMutation({
    onSuccess: () => {
      query.refetch();
      setShowForm(false);
      setTitle("");
      setContent("");
      setNewScopeChoice("world");
    },
  });
  const updateMut = trpc.draft.update.useMutation({
    onSuccess: () => {
      query.refetch();
      setEditingId(null);
    },
  });
  const deleteMut = trpc.draft.delete.useMutation({
    onSuccess: () => query.refetch(),
  });

  const allDrafts = (query.data ?? []) as any[];
  const filteredByScope = useMemo(() => {
    if (scopeFilter === "all") return allDrafts;
    if (scopeFilter === "world") return allDrafts.filter((d: any) => !d.projectId);
    return allDrafts.filter((d: any) => d.projectId && String(d.projectId) === scopeFilter);
  }, [allDrafts, scopeFilter]);
  const drafts = useMemo(() => {
    if (!searchResultIds) return filteredByScope;
    return filteredByScope.filter((d: any) => searchResultIds.has(d._id));
  }, [filteredByScope, searchResultIds]);

  // Cycle filter: all -> world -> each project -> all
  const cycleFilter = useCallback(() => {
    setScopeFilter((current) => {
      if (current === "all") return "world";
      if (current === "world") {
        if (projects.length === 0) return "all";
        return projects[0]._id;
      }
      const idx = projects.findIndex((p) => p._id === current);
      if (idx === -1 || idx === projects.length - 1) return "all";
      return projects[idx + 1]._id;
    });
  }, [projects]);

  const cycleNewScopeChoice = useCallback(() => {
    setNewScopeChoice((current) => {
      if (current === "world") {
        if (projects.length === 0) return "world";
        return projects[0]._id;
      }
      const idx = projects.findIndex((p) => p._id === current);
      if (idx === -1 || idx === projects.length - 1) return "world";
      return projects[idx + 1]._id;
    });
  }, [projects]);

  const filterLabel = useMemo(() => {
    if (scopeFilter === "all") return t("draft.scopeFilterAll");
    if (scopeFilter === "world") return t("draft.scopeFilterWorld");
    return projectNameById.get(scopeFilter) ?? scopeFilter;
  }, [scopeFilter, projectNameById, t]);

  const newScopeLabel = useMemo(() => {
    if (newScopeChoice === "world") return t("draft.scopePickerWorld");
    return t("draft.scopePickerProject", {
      name: projectNameById.get(newScopeChoice) ?? newScopeChoice,
    });
  }, [newScopeChoice, projectNameById, t]);

  const openEditMode = useCallback((draft: any) => {
    setExpandedId(draft._id);
    setEditingId(draft._id);
    setEditTitle(draft.title || "");
    setEditContent(draft.content || "");
    setEditTags(Array.isArray(draft.tags) ? draft.tags : []);
    const scope = draft.projectId ? String(draft.projectId) : "world";
    setEditScopeChoice(scope);
    setEditOriginalScope(scope);
  }, []);

  const cycleEditScopeChoice = useCallback(() => {
    setEditScopeChoice((cur) => {
      if (cur === "world") return projects.length === 0 ? "world" : projects[0]._id;
      const idx = projects.findIndex((p) => p._id === cur);
      if (idx === -1 || idx === projects.length - 1) return "world";
      return projects[idx + 1]._id;
    });
  }, [projects]);

  const editScopeLabel = useMemo(() => {
    if (editScopeChoice === "world") return t("draft.scopePickerWorld");
    return t("draft.scopePickerProject", { name: projectNameById.get(editScopeChoice) ?? editScopeChoice });
  }, [editScopeChoice, projectNameById, t]);

  function handleDelete(draft: any) {
    Alert.alert(
      t("common.delete"),
      t("draft.deleteConfirm", { name: draft.title }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteMut.mutate({ id: draft._id }),
        },
      ]
    );
  }

  const s = useMemo(() => createStyles(colors), [colors]);
  const mdStyles = useMemo(() => getMarkdownStyles(colors), [colors]);

  return (
    <View>
      {!searchResultIds && (
        <TouchableOpacity onPress={cycleFilter} style={s.filterChip}>
          <Text style={s.filterChipText}>
            {t("draft.scope")}: {filterLabel}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={() => setShowForm(true)}
        style={s.addBtn}
      >
        <Text style={s.addBtnText}>+ {t("draft.add")}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={[base.card, base.p4, base.mb4]}>
          <Text style={[s.formTitle, base.mb3]}>
            {t("draft.newDraft")}
          </Text>
          <TouchableOpacity onPress={cycleNewScopeChoice} style={s.scopePickerBtn}>
            <Text style={s.scopePickerLabel}>{t("draft.scopePickerLabel")}</Text>
            <Text style={s.scopePickerValue}>{newScopeLabel}</Text>
          </TouchableOpacity>
          <Text style={s.scopeHint}>{t("draft.scopeHint")}</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t("draft.titlePlaceholder")}
            placeholderTextColor={colors.slate500}
            style={[base.input, base.mb3, { fontSize: 13 }]}
          />
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder={t("draft.contentPlaceholder")}
            placeholderTextColor={colors.slate500}
            multiline
            style={[base.input, base.mb3, { fontSize: 13, minHeight: 100, textAlignVertical: "top" }]}
          />
          <View style={[base.row, base.gap2]}>
            <TouchableOpacity
              onPress={() => {
                setShowForm(false);
                setTitle("");
                setContent("");
                setNewScopeChoice("world");
              }}
              style={[base.btnOutline, base.flex1]}
            >
              <Text style={base.textSm}>
                {t("draft.cancel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!title.trim()) return;
                const isProject = newScopeChoice !== "world";
                createMut.mutate({
                  worldId,
                  ...(isProject ? { projectId: newScopeChoice } : {}),
                  scope: isProject ? ("project" as const) : ("world" as const),
                  title: title.trim(),
                  content: content.trim() || undefined,
                });
              }}
              disabled={createMut.isPending || !title.trim()}
              style={[
                base.btnPrimary,
                base.flex1,
                (createMut.isPending || !title.trim()) && base.btnDisabled,
              ]}
            >
              <Text style={s.submitText}>
                {createMut.isPending ? t("draft.adding") : t("draft.add")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {drafts.length === 0 && !showForm ? (
        <View style={s.emptyContainer}>
          <Text style={base.textSm}>{t("draft.empty")}</Text>
        </View>
      ) : (
        drafts.map((draft: any) => {
          const isExpanded = expandedId === draft._id;
          const isEditing = editingId === draft._id;

          return (
            <View
              key={draft._id}
              style={[
                s.draftCard,
                isExpanded ? s.draftCardExpanded : s.draftCardDefault,
              ]}
            >
              <TouchableOpacity
                onPress={() => {
                  if (isEditing) return;
                  setExpandedId(isExpanded ? null : draft._id);
                }}
                onLongPress={() => handleDelete(draft)}
                style={base.p4}
              >
                <View style={s.titleRow}>
                  <Text style={s.draftTitle}>{draft.title}</Text>
                  <View
                    style={[
                      s.scopeBadge,
                      draft.projectId ? s.scopeBadgeProject : s.scopeBadgeWorld,
                    ]}
                  >
                    <Text
                      style={[
                        s.scopeBadgeText,
                        draft.projectId ? s.scopeBadgeProjectText : s.scopeBadgeWorldText,
                      ]}
                      numberOfLines={1}
                    >
                      {draft.projectId
                        ? projectNameById.get(String(draft.projectId)) ?? t("draft.scopeProject")
                        : t("draft.scopeWorld")}
                    </Text>
                  </View>
                </View>
                {!isExpanded && draft.content ? (
                  <Text
                    style={[base.textXs, base.mt1, { color: colors.muted }]}
                    numberOfLines={2}
                  >
                    {draft.content}
                  </Text>
                ) : null}
              </TouchableOpacity>

              {isExpanded && (
                <View style={s.expandedSection}>
                  {isEditing ? (
                    <View style={s.editContainer}>
                      <TouchableOpacity onPress={cycleEditScopeChoice} style={[s.scopePickerBtn, base.mb3]}>
                        <Text style={s.scopePickerLabel}>{t("draft.scopePickerLabel")}</Text>
                        <Text style={s.scopePickerValue}>{editScopeLabel}</Text>
                      </TouchableOpacity>
                      <TextInput
                        value={editTitle}
                        onChangeText={setEditTitle}
                        placeholder={t("draft.titlePlaceholder")}
                        placeholderTextColor={colors.slate500}
                        style={[base.input, base.mb3, { fontSize: 13 }]}
                      />
                      <View style={base.mb3}>
                        <Text style={s.fieldLabel}>{t("draft.tagsLabel")}</Text>
                        <TagsEditor
                          value={editTags}
                          onChange={setEditTags}
                          placeholder={t("draft.tagsAddPlaceholder")}
                        />
                      </View>
                      <TextInput
                        value={editContent}
                        onChangeText={setEditContent}
                        placeholder={t("draft.contentPlaceholder")}
                        placeholderTextColor={colors.slate500}
                        multiline
                        style={[base.input, base.mb3, { fontSize: 13, minHeight: 120, textAlignVertical: "top" }]}
                      />
                      <View style={[base.row, base.gap2]}>
                        <TouchableOpacity
                          onPress={() => setEditingId(null)}
                          style={[base.btnOutline, base.flex1]}
                        >
                          <Text style={base.textSm}>
                            {t("draft.cancel")}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            if (!editTitle.trim()) return;
                            const data: any = {
                              title: editTitle.trim(),
                              content: editContent.trim(),
                              tags: editTags,
                            };
                            if (editScopeChoice !== editOriginalScope) {
                              data.projectId = editScopeChoice === "world" ? null : editScopeChoice;
                            }
                            updateMut.mutate({ id: draft._id, data });
                          }}
                          disabled={updateMut.isPending}
                          style={[
                            base.btnPrimary,
                            base.flex1,
                            updateMut.isPending && base.btnDisabled,
                          ]}
                        >
                          <Text style={s.submitText}>
                            {updateMut.isPending
                              ? t("draft.saving")
                              : t("draft.save")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={s.editContainer}>
                      <View style={s.contentBox}>
                        {draft.content ? (
                          <Markdown style={mdStyles}>
                            {draft.content}
                          </Markdown>
                        ) : (
                          <Text style={s.noContentText}>
                            {t("draft.noContent")}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={() => openEditMode(draft)}
                        style={s.editBtn}
                      >
                        <Text style={s.editBtnText}>
                          {t("draft.edit")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    addBtn: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: "center",
      marginBottom: 12,
    },
    addBtnText: {
      color: colors.muted,
      fontSize: 13,
    },
    formTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text,
    },
    submitText: {
      color: colors.white,
      fontSize: 13,
      fontWeight: "500",
    },
    emptyContainer: {
      alignItems: "center",
      paddingVertical: 32,
    },
    draftCard: {
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 8,
      backgroundColor: colors.card,
    },
    draftCardExpanded: {
      borderColor: "rgba(20,184,166,0.5)",
    },
    draftCardDefault: {
      borderColor: colors.border,
    },
    draftTitle: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.text,
    },
    expandedSection: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    editContainer: {
      paddingTop: 16,
    },
    fieldLabel: {
      fontSize: 11,
      color: colors.muted,
      marginBottom: 6,
    },
    contentBox: {
      backgroundColor: colors.bg,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    noContentText: {
      fontSize: 13,
      color: colors.muted,
      fontStyle: "italic",
    },
    editBtn: {
      backgroundColor: "rgba(255,255,255,0.1)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.15)",
      borderRadius: 8,
      paddingVertical: 8,
      alignItems: "center",
    },
    editBtnText: {
      color: colors.teal,
      fontSize: 11,
      fontWeight: "500",
    },
    filterChip: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingVertical: 4,
      paddingHorizontal: 10,
      marginBottom: 8,
    },
    filterChipText: {
      color: colors.muted,
      fontSize: 12,
    },
    scopePickerBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginBottom: 4,
    },
    scopePickerLabel: {
      fontSize: 11,
      color: colors.muted,
      marginBottom: 2,
    },
    scopePickerValue: {
      fontSize: 13,
      color: colors.text,
    },
    scopeHint: {
      fontSize: 11,
      color: colors.muted,
      marginBottom: 12,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    scopeBadge: {
      borderWidth: 1,
      borderRadius: 6,
      paddingVertical: 2,
      paddingHorizontal: 6,
      maxWidth: 140,
    },
    scopeBadgeWorld: {
      borderColor: "rgba(56,189,248,0.4)",
      backgroundColor: "rgba(56,189,248,0.1)",
    },
    scopeBadgeProject: {
      borderColor: "rgba(251,191,36,0.4)",
      backgroundColor: "rgba(251,191,36,0.1)",
    },
    scopeBadgeText: {
      fontSize: 10,
      fontWeight: "500",
    },
    scopeBadgeWorldText: {
      color: "rgb(125,211,252)",
    },
    scopeBadgeProjectText: {
      color: "rgb(252,211,77)",
    },
  });
}
