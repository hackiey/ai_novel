import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { trpc } from "../../lib/trpc";
import { useTranslation } from "react-i18next";
import { colors, base } from "../../lib/theme";

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const worldsQuery = trpc.world.list.useQuery();
  const createMutation = trpc.world.create.useMutation({
    onSuccess: () => {
      worldsQuery.refetch();
      setShowForm(false);
      setName("");
      setDescription("");
    },
  });
  const deleteMutation = trpc.world.delete.useMutation({
    onSuccess: () => worldsQuery.refetch(),
  });

  const worlds = (worldsQuery.data ?? []) as any[];

  function handleDelete(world: any) {
    Alert.alert(
      t("common.delete"),
      t("home.deleteConfirm", { name: world.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteMutation.mutate({ id: world._id }),
        },
      ]
    );
  }

  function renderWorld({ item }: { item: any }) {
    return (
      <TouchableOpacity
        onPress={() => router.push(`/world/${item._id}`)}
        onLongPress={() => handleDelete(item)}
        style={[base.card, s.worldCard]}
        activeOpacity={0.7}
      >
        <Text style={[base.textLg, base.mb1]}>{item.name}</Text>
        {item.description ? (
          <Text style={[base.textSm, base.mb3]} numberOfLines={2}>
            {item.description}
          </Text>
        ) : null}
        <Text style={base.textXs}>
          {t("home.updated")}{" "}
          {new Date(item.updatedAt).toLocaleDateString("zh-CN", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[base.flex1, base.bgDark]}>
      <FlatList
        data={worlds}
        renderItem={renderWorld}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={worldsQuery.isRefetching}
            onRefresh={() => worldsQuery.refetch()}
            tintColor={colors.teal}
          />
        }
        ListHeaderComponent={
          <View style={base.mb4}>
            <Text style={base.textSm}>{t("home.subtitle")}</Text>
          </View>
        }
        ListEmptyComponent={
          worldsQuery.isLoading ? (
            <View style={s.emptyContainer}>
              <ActivityIndicator color={colors.teal} size="large" />
              <Text style={[base.textSm, base.mt3]}>{t("home.loading")}</Text>
            </View>
          ) : worldsQuery.isError ? (
            <View style={s.emptyContainer}>
              <Text style={[base.textSm, base.mb3, { color: colors.red }]}>
                {t("home.loadFailed")}
              </Text>
              <TouchableOpacity onPress={() => worldsQuery.refetch()}>
                <Text style={base.textTeal}>{t("home.retry")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.emptyContainer}>
              <Text style={[base.textLg, base.mb1]}>
                {t("home.noWorldsTitle")}
              </Text>
              <Text style={[base.textSm, base.mb4, base.textCenter]}>
                {t("home.noWorldsText")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowForm(true)}
                style={s.emptyNewWorldBtn}
              >
                <Text style={base.textWhite}>{t("home.newWorld")}</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      {/* FAB */}
      <TouchableOpacity
        onPress={() => setShowForm(true)}
        style={s.fab}
        activeOpacity={0.8}
      >
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      {/* Create Modal */}
      <Modal visible={showForm} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={[base.textLg, base.mb4]}>
              {t("home.createTitle")}
            </Text>
            <View style={base.mb3}>
              <Text style={[base.textSm, s.labelSpacing]}>
                {t("home.worldName")}
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t("home.worldNamePlaceholder")}
                placeholderTextColor={colors.slate500}
                maxLength={200}
                style={base.input}
              />
            </View>
            <View style={s.mb5}>
              <Text style={[base.textSm, s.labelSpacing]}>
                {t("home.description")}
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={t("home.descriptionPlaceholder")}
                placeholderTextColor={colors.slate500}
                multiline
                numberOfLines={3}
                maxLength={2000}
                style={[base.input, { minHeight: 80, textAlignVertical: "top" }]}
              />
            </View>
            <View style={[base.row, base.gap3]}>
              <TouchableOpacity
                onPress={() => {
                  setShowForm(false);
                  setName("");
                  setDescription("");
                }}
                style={[base.btnOutline, base.flex1]}
              >
                <Text style={[base.textMuted, base.textWhite, { fontWeight: "600", color: colors.muted }]}>
                  {t("home.cancel")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (!name.trim()) return;
                  createMutation.mutate({
                    name: name.trim(),
                    description: description.trim() || undefined,
                  });
                }}
                disabled={createMutation.isPending || !name.trim()}
                style={[
                  base.btnPrimary,
                  base.flex1,
                  (createMutation.isPending || !name.trim()) && base.btnDisabled,
                ]}
              >
                <Text style={base.textWhite}>
                  {createMutation.isPending
                    ? t("home.creating")
                    : t("home.createWorld")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  worldCard: {
    padding: 20,
    marginBottom: 12,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 80,
  },
  emptyNewWorldBtn: {
    backgroundColor: colors.teal,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    backgroundColor: colors.teal,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    color: colors.white,
    fontSize: 24,
    fontWeight: "300",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.black50,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  labelSpacing: {
    marginBottom: 6,
  },
  mb5: {
    marginBottom: 20,
  },
});
