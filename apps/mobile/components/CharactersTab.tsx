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

const importanceBadgeColors: Record<string, { bg: string; text: string }> = {
  core: { bg: "#fef3c7", text: "#b45309" },
  major: { bg: "#dbeafe", text: "#2563eb" },
  minor: { bg: "#f3f4f6", text: "#6b7280" },
};

interface Props {
  worldId: string;
  searchResultIds?: Set<string>;
}

type ScopeFilter = "all" | "world" | string;

export default function CharactersTab({ worldId, searchResultIds }: Props) {
  const { t } = useTranslation();
  const { colors, baseStyles: base } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [charName, setCharName] = useState("");
  const [newScopeChoice, setNewScopeChoice] = useState<"world" | string>("world");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editScopeChoice, setEditScopeChoice] = useState<"world" | string>("world");
  const [editOriginalScope, setEditOriginalScope] = useState<"world" | string>("world");

  const projectsQuery = trpc.project.listByWorld.useQuery({ worldId });
  const projects = (projectsQuery.data ?? []) as Array<{ _id: string; name: string }>;
  const projectNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p._id, p.name);
    return m;
  }, [projects]);

  const charactersQuery = trpc.character.list.useQuery({ worldId, includeAllProjectsUnderWorld: true });
  const createMut = trpc.character.create.useMutation({
    onSuccess: () => {
      charactersQuery.refetch();
      setShowForm(false);
      setCharName("");
      setNewScopeChoice("world");
    },
  });
  const updateMut = trpc.character.update.useMutation({
    onSuccess: () => {
      charactersQuery.refetch();
      setEditingId(null);
    },
  });
  const deleteMut = trpc.character.delete.useMutation({
    onSuccess: () => charactersQuery.refetch(),
  });

  const allCharacters = (charactersQuery.data ?? []) as any[];
  const filteredByScope = useMemo(() => {
    if (scopeFilter === "all") return allCharacters;
    if (scopeFilter === "world") return allCharacters.filter((c: any) => !c.projectId);
    return allCharacters.filter((c: any) => c.projectId && String(c.projectId) === scopeFilter);
  }, [allCharacters, scopeFilter]);
  const characters = useMemo(() => {
    if (!searchResultIds) return filteredByScope;
    return filteredByScope.filter((c: any) => searchResultIds.has(c._id));
  }, [filteredByScope, searchResultIds]);

  const cycleFilter = useCallback(() => {
    setScopeFilter((cur) => {
      if (cur === "all") return "world";
      if (cur === "world") return projects.length === 0 ? "all" : projects[0]._id;
      const idx = projects.findIndex((p) => p._id === cur);
      if (idx === -1 || idx === projects.length - 1) return "all";
      return projects[idx + 1]._id;
    });
  }, [projects]);

  const cycleNewScopeChoice = useCallback(() => {
    setNewScopeChoice((cur) => {
      if (cur === "world") return projects.length === 0 ? "world" : projects[0]._id;
      const idx = projects.findIndex((p) => p._id === cur);
      if (idx === -1 || idx === projects.length - 1) return "world";
      return projects[idx + 1]._id;
    });
  }, [projects]);

  const filterLabel = useMemo(() => {
    if (scopeFilter === "all") return t("character.scopeFilterAll");
    if (scopeFilter === "world") return t("character.scopeFilterWorld");
    return projectNameById.get(scopeFilter) ?? scopeFilter;
  }, [scopeFilter, projectNameById, t]);

  const newScopeLabel = useMemo(() => {
    if (newScopeChoice === "world") return t("character.scopePickerWorld");
    return t("character.scopePickerProject", { name: projectNameById.get(newScopeChoice) ?? newScopeChoice });
  }, [newScopeChoice, projectNameById, t]);

  const openEditMode = useCallback((char: any) => {
    setExpandedId(char._id);
    setEditingId(char._id);
    setEditName(char.name || "");
    setEditContent(char.content || "");
    setEditTags(Array.isArray(char.tags) ? char.tags : []);
    const scope = char.projectId ? String(char.projectId) : "world";
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
    if (editScopeChoice === "world") return t("character.scopePickerWorld");
    return t("character.scopePickerProject", { name: projectNameById.get(editScopeChoice) ?? editScopeChoice });
  }, [editScopeChoice, projectNameById, t]);

  function handleDelete(char: any) {
    Alert.alert(
      t("common.delete"),
      t("character.deleteConfirm", { name: char.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteMut.mutate({ id: char._id }),
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
            {t("character.scope")}: {filterLabel}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={() => setShowForm(true)}
        style={s.addBtn}
      >
        <Text style={s.addBtnText}>+ {t("character.add")}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={[base.card, base.p4, base.mb4]}>
          <Text style={[s.formTitle, base.mb3]}>
            {t("character.newCharacter")}
          </Text>
          <TouchableOpacity onPress={cycleNewScopeChoice} style={s.scopePickerBtn}>
            <Text style={s.scopePickerLabel}>{t("character.scopePickerLabel")}</Text>
            <Text style={s.scopePickerValue}>{newScopeLabel}</Text>
          </TouchableOpacity>
          <Text style={s.scopeHint}>{t("character.scopeHint")}</Text>
          <TextInput
            value={charName}
            onChangeText={setCharName}
            placeholder={t("character.namePlaceholder")}
            placeholderTextColor={colors.slate500}
            style={[base.input, base.mb3, { fontSize: 13 }]}
          />
          <View style={[base.row, base.gap2]}>
            <TouchableOpacity
              onPress={() => {
                setShowForm(false);
                setCharName("");
                setNewScopeChoice("world");
              }}
              style={[base.btnOutline, base.flex1]}
            >
              <Text style={base.textSm}>
                {t("character.cancel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!charName.trim()) return;
                const isProject = newScopeChoice !== "world";
                createMut.mutate({
                  worldId,
                  ...(isProject ? { projectId: newScopeChoice } : {}),
                  scope: isProject ? ("project" as const) : ("world" as const),
                  name: charName.trim(),
                });
              }}
              disabled={createMut.isPending || !charName.trim()}
              style={[
                base.btnPrimary,
                base.flex1,
                (createMut.isPending || !charName.trim()) && base.btnDisabled,
              ]}
            >
              <Text style={s.submitText}>
                {createMut.isPending
                  ? t("character.adding")
                  : t("character.add")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {characters.length === 0 && !showForm ? (
        <View style={s.emptyContainer}>
          <Text style={base.textSm}>
            {t("character.empty")}
          </Text>
        </View>
      ) : (
        characters.map((char: any) => {
          const isExpanded = expandedId === char._id;
          const isEditing = editingId === char._id;
          const badge = importanceBadgeColors[char.importance] ?? importanceBadgeColors.minor;
          const summary = char.content || "";

          return (
            <View
              key={char._id}
              style={[
                s.charCard,
                isExpanded ? s.charCardExpanded : s.charCardDefault,
              ]}
            >
              <TouchableOpacity
                onPress={() => {
                  if (isEditing) return;
                  setExpandedId(isExpanded ? null : char._id);
                }}
                onLongPress={() => handleDelete(char)}
                style={base.p4}
              >
                <View style={[base.rowCenter, base.gap2, base.mb1]}>
                  <View
                    style={[s.badge, { backgroundColor: badge.bg }]}
                  >
                    <Text style={[s.badgeText, { color: badge.text }]}>
                      {t(`character.importance_${char.importance ?? "minor"}`)}
                    </Text>
                  </View>
                  <Text style={[s.charName, base.flex1]} numberOfLines={1}>
                    {char.name}
                  </Text>
                  <View style={[s.scopeBadge, char.projectId ? s.scopeBadgeProject : s.scopeBadgeWorld]}>
                    <Text
                      style={[s.scopeBadgeText, char.projectId ? s.scopeBadgeProjectText : s.scopeBadgeWorldText]}
                      numberOfLines={1}
                    >
                      {char.projectId
                        ? projectNameById.get(String(char.projectId)) ?? t("character.scopeProject")
                        : t("character.scopeWorld")}
                    </Text>
                  </View>
                </View>
                {!isExpanded && summary ? (
                  <Text
                    style={[base.textXs, base.mt1, { color: colors.muted }]}
                    numberOfLines={2}
                  >
                    {summary}
                  </Text>
                ) : null}
              </TouchableOpacity>

              {isExpanded && (
                <View style={s.expandedSection}>
                  {isEditing ? (
                    <View style={s.editContainer}>
                      <TouchableOpacity onPress={cycleEditScopeChoice} style={[s.scopePickerBtn, base.mb3]}>
                        <Text style={s.scopePickerLabel}>{t("character.scopePickerLabel")}</Text>
                        <Text style={s.scopePickerValue}>{editScopeLabel}</Text>
                      </TouchableOpacity>
                      <TextInput
                        value={editName}
                        onChangeText={setEditName}
                        placeholder={t("character.namePlaceholder")}
                        placeholderTextColor={colors.slate500}
                        style={[base.input, base.mb3, { fontSize: 13 }]}
                      />
                      <View style={base.mb3}>
                        <Text style={[s.fieldLabel]}>{t("character.tagsLabel")}</Text>
                        <TagsEditor
                          value={editTags}
                          onChange={setEditTags}
                          placeholder={t("character.tagsAddPlaceholder")}
                        />
                      </View>
                      <View style={base.mb3}>
                        <Text style={[s.fieldLabel]}>
                          {t("character.content")}
                        </Text>
                        <TextInput
                          value={editContent}
                          onChangeText={setEditContent}
                          placeholder={t("character.contentPlaceholder")}
                          placeholderTextColor={colors.slate500}
                          multiline
                          style={[
                            base.input,
                            { fontSize: 13, minHeight: 120, textAlignVertical: "top" },
                          ]}
                        />
                      </View>
                      <View style={[base.row, base.gap2]}>
                        <TouchableOpacity
                          onPress={() => setEditingId(null)}
                          style={[base.btnOutline, base.flex1]}
                        >
                          <Text style={base.textSm}>
                            {t("character.cancel")}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            if (!editName.trim()) return;
                            const data: any = {
                              name: editName.trim(),
                              content: editContent,
                              tags: editTags,
                            };
                            if (editScopeChoice !== editOriginalScope) {
                              data.projectId = editScopeChoice === "world" ? null : editScopeChoice;
                            }
                            updateMut.mutate({ id: char._id, data });
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
                              ? t("character.saving")
                              : t("character.save")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={s.editContainer}>
                      {char.content ? (
                        <View style={s.profileBox}>
                          <Markdown style={mdStyles}>
                            {char.content}
                          </Markdown>
                        </View>
                      ) : (
                        <View style={s.profileBox}>
                          <Text style={s.noContentText}>
                            {t("character.noContent")}
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => openEditMode(char)}
                        style={s.editBtn}
                      >
                        <Text style={s.editBtnText}>
                          {t("character.edit")}
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
    charCard: {
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 8,
      backgroundColor: colors.card,
    },
    charCardExpanded: {
      borderColor: "rgba(20,184,166,0.5)",
    },
    charCardDefault: {
      borderColor: colors.border,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    badgeText: {
      fontSize: 11,
    },
    charName: {
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
    profileBox: {
      backgroundColor: colors.bg,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    profileFieldLabel: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.muted,
      marginBottom: 4,
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
    scopeBadge: {
      borderWidth: 1,
      borderRadius: 6,
      paddingVertical: 2,
      paddingHorizontal: 6,
      maxWidth: 120,
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
