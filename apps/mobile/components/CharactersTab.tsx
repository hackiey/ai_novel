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

const roleBadgeColors: Record<string, { bg: string; text: string }> = {
  protagonist: { bg: "#fef3c7", text: "#b45309" },
  antagonist: { bg: "#fee2e2", text: "#dc2626" },
  supporting: { bg: "#dbeafe", text: "#2563eb" },
  minor: { bg: "#f3f4f6", text: "#6b7280" },
  other: { bg: "#f3f4f6", text: "#9ca3af" },
};

const profileFields = ["appearance", "personality", "background", "goals"] as const;

const roles = ["protagonist", "antagonist", "supporting", "minor", "other"] as const;

interface Props {
  worldId: string;
  searchResultIds?: Set<string>;
}

export default function CharactersTab({ worldId, searchResultIds }: Props) {
  const { t } = useTranslation();
  const { colors, baseStyles: base } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [charName, setCharName] = useState("");
  const [charRole, setCharRole] = useState("other");
  const [selectedRoleIdx, setSelectedRoleIdx] = useState(4);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("other");
  const [editProfile, setEditProfile] = useState<Record<string, string>>({});

  const charactersQuery = trpc.character.list.useQuery({ worldId });
  const createMut = trpc.character.create.useMutation({
    onSuccess: () => {
      charactersQuery.refetch();
      setShowForm(false);
      setCharName("");
      setCharRole("other");
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
    setEditRole(char.role || "other");
    setEditProfile({
      appearance: char.profile?.appearance || "",
      personality: char.profile?.personality || "",
      background: char.profile?.background || "",
      goals: char.profile?.goals || "",
    });
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
          <View style={[base.row, s.roleWrap, base.mb4]}>
            {roles.map((r, idx) => (
              <TouchableOpacity
                key={r}
                onPress={() => {
                  setCharRole(r);
                  setSelectedRoleIdx(idx);
                }}
                style={[
                  s.roleChip,
                  charRole === r ? s.roleChipActive : s.roleChipInactive,
                ]}
              >
                <Text
                  style={[
                    s.roleChipText,
                    charRole === r ? s.roleChipTextActive : s.roleChipTextInactive,
                  ]}
                >
                  {t(`character.${r}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
                  role: charRole as any,
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
          const badge = roleBadgeColors[char.role] ?? roleBadgeColors.other;
          const summary =
            char.profile?.personality || char.profile?.background || "";

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
                      {t(`character.${char.role}`) || char.role}
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
                      <View style={[base.row, s.roleWrap, base.mb3]}>
                        {roles.map((r) => (
                          <TouchableOpacity
                            key={r}
                            onPress={() => setEditRole(r)}
                            style={[
                              s.roleChip,
                              editRole === r ? s.roleChipActive : s.roleChipInactive,
                            ]}
                          >
                            <Text
                              style={[
                                s.roleChipText,
                                editRole === r ? s.roleChipTextActive : s.roleChipTextInactive,
                              ]}
                            >
                              {t(`character.${r}`)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {profileFields.map((field) => (
                        <View key={field} style={base.mb3}>
                          <Text style={[s.fieldLabel]}>
                            {t(`character.${field}`)}
                          </Text>
                          <TextInput
                            value={editProfile[field] || ""}
                            onChangeText={(v) =>
                              setEditProfile((prev) => ({
                                ...prev,
                                [field]: v,
                              }))
                            }
                            placeholder={t(
                              `character.${field}Placeholder`
                            )}
                            placeholderTextColor={colors.slate500}
                            multiline
                            style={[
                              base.input,
                              { fontSize: 13, minHeight: 80, textAlignVertical: "top" },
                            ]}
                          />
                        </View>
                      ))}
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
                                role: editRole as any,
                                profile: {
                                  appearance:
                                    editProfile.appearance || "",
                                  personality:
                                    editProfile.personality || "",
                                  background:
                                    editProfile.background || "",
                                  goals: editProfile.goals || "",
                                  relationships:
                                    char.profile?.relationships || [],
                                  customFields:
                                    char.profile?.customFields || {},
                                },
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
                      {profileFields.some((f) => char.profile?.[f]) ? (
                        <View style={s.profileBox}>
                          {profileFields.map((field) => {
                            const val = char.profile?.[field];
                            if (!val) return null;
                            return (
                              <View key={field} style={base.mb3}>
                                <Text style={s.profileFieldLabel}>
                                  {t(`character.${field}`)}
                                </Text>
                                <Markdown style={mdStyles}>
                                  {val}
                                </Markdown>
                              </View>
                            );
                          })}
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
    roleWrap: {
      flexWrap: "wrap",
      gap: 8,
    },
    roleChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    roleChipActive: {
      borderColor: colors.teal,
      backgroundColor: "rgba(20,184,166,0.2)",
    },
    roleChipInactive: {
      borderColor: colors.border,
    },
    roleChipText: {
      fontSize: 11,
    },
    roleChipTextActive: {
      color: colors.teal,
    },
    roleChipTextInactive: {
      color: colors.muted,
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
