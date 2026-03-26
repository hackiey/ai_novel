import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { Settings, FileEdit } from "lucide-react-native";
import { trpc } from "../../lib/trpc";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../contexts/ThemeContext";
import ThemeBackground from "../../components/backgrounds/ThemeBackground";

export default function HomeScreen() {
  const { t } = useTranslation();
  const { colors, baseStyles: base, themeVariant } = useTheme();
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const worldsQuery = trpc.world.list.useQuery();
  const projectsQuery = trpc.project.list.useQuery();
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
  const projects = (projectsQuery.data ?? []) as any[];

  const worldMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of worlds) map.set(w._id, w.name);
    return map;
  }, [worlds]);

  const s = useMemo(() => createStyles(colors), [colors]);

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
      <ThemeBackground theme={themeVariant} bgColor={colors.bg} />
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("header.brand"),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/settings")}
              style={s.settingsBtn}
            >
              <Settings size={20} color={colors.muted} />
            </TouchableOpacity>
          ),
        }}
      />

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
          <View>
            {/* Novels section */}
            {projects.length > 0 && (
              <View style={base.mb6}>
                <Text style={[s.sectionLabel, base.mb3]}>
                  {t("home.novels")}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {projects.map((project: any) => (
                    <TouchableOpacity
                      key={project._id}
                      onPress={() => router.push(`/project/${project._id}`)}
                      style={[base.card, s.novelCard]}
                      activeOpacity={0.7}
                    >
                      <View style={s.novelCardRow}>
                        <FileEdit size={14} color={colors.teal} />
                        <Text style={s.novelName} numberOfLines={1}>
                          {project.name}
                        </Text>
                      </View>
                      {project.worldId && worldMap.has(project.worldId) && (
                        <Text style={s.novelWorld} numberOfLines={1}>
                          {worldMap.get(project.worldId)}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Worlds section header */}
            <Text style={[s.sectionLabel, base.mb3]}>
              {t("home.title")}
            </Text>
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
              <TouchableOpacity
                onPress={() => worldsQuery.refetch()}
                style={s.glassBtn}
              >
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
                style={[base.btnPrimary, { paddingHorizontal: 24 }]}
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
                <Text style={[base.textMuted, { fontWeight: "600" }]}>
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

function createStyles(colors: any) {
  return StyleSheet.create({
    settingsBtn: {
      marginRight: 8,
      padding: 4,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    novelCard: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginRight: 10,
      minWidth: 160,
      maxWidth: 220,
    },
    novelCardRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    novelName: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.text,
      flexShrink: 1,
    },
    novelWorld: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 4,
    },
    worldCard: {
      padding: 20,
      marginBottom: 12,
    },
    emptyContainer: {
      alignItems: "center",
      paddingVertical: 80,
    },
    glassBtn: {
      backgroundColor: "rgba(255,255,255,0.08)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.15)",
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    fab: {
      position: "absolute",
      bottom: 24,
      right: 24,
      backgroundColor: "rgba(20,184,166,0.25)",
      borderWidth: 1,
      borderColor: "rgba(20,184,166,0.4)",
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
      color: colors.teal,
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
}
