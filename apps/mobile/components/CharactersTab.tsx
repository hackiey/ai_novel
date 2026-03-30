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

const importanceBadgeColors: Record<string, { bg: string; text: string }> = {
  core: { bg: "#fef3c7", text: "#b45309" },
  major: { bg: "#dbeafe", text: "#2563eb" },
  minor: { bg: "#f3f4f6", text: "#6b7280" },
};

interface Props {
  worldId: string;
  searchResultIds?: Set<string>;
}

export default function CharactersTab({ worldId, searchResultIds }: Props) {
  const { t } = useTranslation();
  const { colors, baseStyles: base } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [charName, setCharName] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");

  const charactersQuery = trpc.character.list.useQuery({ worldId });
  const createMut = trpc.character.create.useMutation({
    onSuccess: () => {
      charactersQuery.refetch();
      setShowForm(false);
      setCharName("");
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
  const characters = useMemo(() => {
    if (!searchResultIds) return allCharacters;
    return allCharacters.filter((c: any) => searchResultIds.has(c._id));
  }, [allCharacters, searchResultIds]);

  const openEditMode = useCallback((char: any) => {
    setExpandedId(char._id);
    setEditingId(char._id);
    setEditName(char.name || "");
    setEditContent(char.content || "");
  }, []);

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
                createMut.mutate({
                  worldId,
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
                  <Text style={[s.charName, base.flex1]}>
                    {char.name}
                  </Text>
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
                      <TextInput
                        value={editName}
                        onChangeText={setEditName}
                        placeholder={t("character.namePlaceholder")}
                        placeholderTextColor={colors.slate500}
                        style={[base.input, base.mb3, { fontSize: 13 }]}
                      />
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
                            updateMut.mutate({
                              id: char._id,
                              data: {
                                name: editName.trim(),
                                content: editContent,
                              },
                            });
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
  });
}
