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

interface Props {
  worldId: string;
  searchResultIds?: Set<string>;
}

export default function WorldSettingsTab({ worldId, searchResultIds }: Props) {
  const { t } = useTranslation();
  const { colors, baseStyles: base } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const query = trpc.worldSetting.list.useQuery({ worldId });
  const createMut = trpc.worldSetting.create.useMutation({
    onSuccess: () => {
      query.refetch();
      setShowForm(false);
      setCategory("");
      setTitle("");
      setContent("");
    },
  });
  const updateMut = trpc.worldSetting.update.useMutation({
    onSuccess: () => {
      query.refetch();
      setEditingId(null);
    },
  });
  const deleteMut = trpc.worldSetting.delete.useMutation({
    onSuccess: () => query.refetch(),
  });

  const allItems = (query.data ?? []) as any[];
  const items = useMemo(() => {
    if (!searchResultIds) return allItems;
    return allItems.filter((ws: any) => searchResultIds.has(ws._id));
  }, [allItems, searchResultIds]);

  const openEditMode = useCallback((ws: any) => {
    setExpandedId(ws._id);
    setEditingId(ws._id);
    setEditCategory(ws.category || "");
    setEditTitle(ws.title || "");
    setEditContent(ws.content || "");
  }, []);

  function handleDelete(ws: any) {
    Alert.alert(
      t("common.delete"),
      t("worldSetting.deleteConfirm", { name: ws.title }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteMut.mutate({ id: ws._id }),
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
        <Text style={s.addBtnText}>+ {t("worldSetting.add")}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={[base.card, base.p4, base.mb4]}>
          <Text style={[s.formTitle, base.mb3]}>
            {t("worldSetting.newSetting")}
          </Text>
          <View style={[base.row, base.gap2, base.mb3]}>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder={t("worldSetting.categoryPlaceholder")}
              placeholderTextColor={colors.slate500}
              style={[base.input, base.flex1, { fontSize: 13 }]}
            />
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t("worldSetting.titlePlaceholder")}
              placeholderTextColor={colors.slate500}
              style={[base.input, base.flex1, { fontSize: 13 }]}
            />
          </View>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder={t("worldSetting.descriptionPlaceholder")}
            placeholderTextColor={colors.slate500}
            multiline
            style={[base.input, base.mb3, { fontSize: 13, minHeight: 80, textAlignVertical: "top" }]}
          />
          <View style={[base.row, base.gap2]}>
            <TouchableOpacity
              onPress={() => {
                setShowForm(false);
                setCategory("");
                setTitle("");
                setContent("");
              }}
              style={[base.btnOutline, base.flex1]}
            >
              <Text style={base.textSm}>
                {t("worldSetting.cancel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!category.trim() || !title.trim()) return;
                createMut.mutate({
                  worldId,
                  category: category.trim(),
                  title: title.trim(),
                  content: content.trim() || undefined,
                });
              }}
              disabled={
                createMut.isPending || !category.trim() || !title.trim()
              }
              style={[
                base.btnPrimary,
                base.flex1,
                (createMut.isPending || !category.trim() || !title.trim()) && base.btnDisabled,
              ]}
            >
              <Text style={s.submitText}>
                {createMut.isPending
                  ? t("worldSetting.adding")
                  : t("worldSetting.add")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {items.length === 0 && !showForm ? (
        <View style={s.emptyContainer}>
          <Text style={base.textSm}>
            {t("worldSetting.empty")}
          </Text>
        </View>
      ) : (
        items.map((ws: any) => {
          const isExpanded = expandedId === ws._id;
          const isEditing = editingId === ws._id;

          return (
            <View
              key={ws._id}
              style={[
                s.itemCard,
                isExpanded ? s.itemCardExpanded : s.itemCardDefault,
              ]}
            >
              <TouchableOpacity
                onPress={() => {
                  if (isEditing) return;
                  setExpandedId(isExpanded ? null : ws._id);
                }}
                onLongPress={() => handleDelete(ws)}
                style={base.p4}
              >
                <View style={[base.rowCenter, base.gap2, base.mb1]}>
                  <View style={s.categoryBadge}>
                    <Text style={s.categoryBadgeText}>
                      {ws.category}
                    </Text>
                  </View>
                  <Text style={[s.itemTitle, base.flex1]}>
                    {ws.title}
                  </Text>
                </View>
                {!isExpanded && ws.content ? (
                  <Text
                    style={[base.textXs, base.mt1, { color: colors.muted }]}
                    numberOfLines={2}
                  >
                    {ws.content}
                  </Text>
                ) : null}
              </TouchableOpacity>

              {isExpanded && (
                <View style={s.expandedSection}>
                  {isEditing ? (
                    <View style={s.editContainer}>
                      <View style={[base.row, base.gap2, base.mb3]}>
                        <TextInput
                          value={editCategory}
                          onChangeText={setEditCategory}
                          placeholder={t(
                            "worldSetting.editCategoryPlaceholder"
                          )}
                          placeholderTextColor={colors.slate500}
                          style={[base.input, base.flex1, { fontSize: 13 }]}
                        />
                        <TextInput
                          value={editTitle}
                          onChangeText={setEditTitle}
                          placeholder={t("worldSetting.titlePlaceholder")}
                          placeholderTextColor={colors.slate500}
                          style={[base.input, base.flex1, { fontSize: 13 }]}
                        />
                      </View>
                      <TextInput
                        value={editContent}
                        onChangeText={setEditContent}
                        placeholder={t("worldSetting.contentPlaceholder")}
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
                            {t("worldSetting.cancel")}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            if (
                              !editCategory.trim() ||
                              !editTitle.trim()
                            )
                              return;
                            updateMut.mutate({
                              id: ws._id,
                              data: {
                                category: editCategory.trim(),
                                title: editTitle.trim(),
                                content: editContent.trim(),
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
                              ? t("worldSetting.saving")
                              : t("worldSetting.save")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={s.editContainer}>
                      <View style={s.contentBox}>
                        {ws.content ? (
                          <Markdown style={mdStyles}>
                            {ws.content}
                          </Markdown>
                        ) : (
                          <Text style={s.noContentText}>
                            {t("worldSetting.noContent")}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={() => openEditMode(ws)}
                        style={s.editBtn}
                      >
                        <Text style={s.editBtnText}>
                          {t("worldSetting.edit")}
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
    itemCard: {
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 8,
      backgroundColor: colors.card,
    },
    itemCardExpanded: {
      borderColor: "rgba(20,184,166,0.5)",
    },
    itemCardDefault: {
      borderColor: colors.border,
    },
    categoryBadge: {
      backgroundColor: "rgba(52,211,153,0.15)",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
    },
    categoryBadgeText: {
      fontSize: 11,
      color: colors.emerald,
    },
    itemTitle: {
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
  });
}
