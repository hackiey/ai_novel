import { useState, useCallback } from "react";
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
import { colors, base } from "../lib/theme";

interface Props {
  worldId: string;
}

export default function DraftsTab({ worldId }: Props) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const query = trpc.draft.list.useQuery({ worldId });
  const createMut = trpc.draft.create.useMutation({
    onSuccess: () => {
      query.refetch();
      setShowForm(false);
      setTitle("");
      setContent("");
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

  const drafts = (query.data ?? []) as any[];

  const openEditMode = useCallback((draft: any) => {
    setExpandedId(draft._id);
    setEditingId(draft._id);
    setEditTitle(draft.title || "");
    setEditContent(draft.content || "");
  }, []);

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

  return (
    <View>
      <View style={[base.rowCenter, s.headerRow]}>
        <Text style={s.sectionLabel}>
          {t("draft.count", { count: drafts.length })}
        </Text>
        <TouchableOpacity
          onPress={() => setShowForm(true)}
          style={s.addBtn}
        >
          <Text style={s.addBtnText}>
            {t("draft.addDraft")}
          </Text>
        </TouchableOpacity>
      </View>

      {showForm && (
        <View style={[base.card, base.p4, base.mb4]}>
          <Text style={[s.formTitle, base.mb3]}>
            {t("draft.newDraft")}
          </Text>
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
                createMut.mutate({
                  worldId,
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
                <Text style={s.draftTitle}>
                  {draft.title}
                </Text>
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
                      <TextInput
                        value={editTitle}
                        onChangeText={setEditTitle}
                        placeholder={t("draft.titlePlaceholder")}
                        placeholderTextColor={colors.slate500}
                        style={[base.input, base.mb3, { fontSize: 13 }]}
                      />
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
                            updateMut.mutate({
                              id: draft._id,
                              data: {
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
                          <Text style={s.contentText}>
                            {draft.content}
                          </Text>
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

const s = StyleSheet.create({
  headerRow: {
    justifyContent: "space-between",
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  addBtn: {
    backgroundColor: colors.teal,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addBtnText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "500",
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
  contentBox: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  contentText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
  },
  noContentText: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: "italic",
  },
  editBtn: {
    borderWidth: 1,
    borderColor: colors.border,
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
