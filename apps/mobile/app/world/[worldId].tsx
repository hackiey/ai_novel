import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { trpc } from "../../lib/trpc";
import { useTranslation } from "react-i18next";
import CharactersTab from "../../components/CharactersTab";
import WorldSettingsTab from "../../components/WorldSettingsTab";
import DraftsTab from "../../components/DraftsTab";
import { colors, base } from "../../lib/theme";

type Tab = "characters" | "worldSettings" | "drafts";

const TAB_SCOPE_MAP: Record<Tab, string[]> = {
  characters: ["characters"],
  worldSettings: ["world_settings"],
  drafts: ["drafts"],
};

export default function WorldDetailScreen() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("characters");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const worldQuery = trpc.world.getById.useQuery({ id: worldId! });
  const projectsQuery = trpc.project.listByWorld.useQuery({
    worldId: worldId!,
  });
  const charactersQuery = trpc.character.list.useQuery({ worldId: worldId! });
  const worldSettingsQuery = trpc.worldSetting.list.useQuery({
    worldId: worldId!,
  });
  const draftsQuery = trpc.draft.list.useQuery({ worldId: worldId! });

  const searchResult = trpc.search.search.useQuery(
    {
      worldId: worldId!,
      query: searchQuery,
      scope: TAB_SCOPE_MAP[activeTab],
    },
    { enabled: !!searchQuery && searchQuery.length > 0 }
  );

  const handleSearchChange = useCallback((text: string) => {
    setSearchInput(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(text.trim());
    }, 300);
  }, []);

  const searchResultIds = searchQuery && searchResult.data
    ? new Set(searchResult.data.results.map((r: any) => r.id || r._id))
    : undefined;
  const searchMethod = searchResult.data?.method as "vector" | "regex" | undefined;

  const createProjectMut = trpc.project.create.useMutation({
    onSuccess: () => {
      projectsQuery.refetch();
      setShowProjectForm(false);
      setProjectName("");
    },
  });
  const deleteProjectMut = trpc.project.delete.useMutation({
    onSuccess: () => projectsQuery.refetch(),
  });

  const world = worldQuery.data;
  const projects = (projectsQuery.data ?? []) as any[];
  const characters = (charactersQuery.data ?? []) as any[];
  const worldSettings = (worldSettingsQuery.data ?? []) as any[];
  const drafts = (draftsQuery.data ?? []) as any[];

  if (worldQuery.isLoading) {
    return (
      <View style={[base.flex1, base.bgDark, base.center]}>
        <ActivityIndicator color={colors.teal} size="large" />
        <Text style={[base.textSm, base.mt3]}>{t("world.loading")}</Text>
      </View>
    );
  }

  if (!world) {
    return (
      <View style={[base.flex1, base.bgDark, base.center]}>
        <Text style={base.textMuted}>{t("world.notFound")}</Text>
      </View>
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    {
      key: "characters",
      label: t("world.characters"),
      count: characters.length,
    },
    {
      key: "worldSettings",
      label: t("world.worldSettings"),
      count: worldSettings.length,
    },
    { key: "drafts", label: t("world.drafts"), count: drafts.length },
  ];

  function handleDeleteProject(project: any) {
    Alert.alert(
      t("common.delete"),
      t("world.deleteConfirm", { name: project.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => deleteProjectMut.mutate({ id: project._id }),
        },
      ]
    );
  }

  return (
    <View style={[base.flex1, base.bgDark]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: world.name,
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView style={base.flex1} contentContainerStyle={{ padding: 16 }}>
        {/* Description */}
        {world.description ? (
          <Text style={[base.textSm, base.mb4]}>{world.description}</Text>
        ) : null}

        {/* Projects */}
        <View style={base.mb6}>
          <Text style={[s.sectionLabel, base.mb3]}>{t("world.novels")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {projects.map((project: any) => (
              <TouchableOpacity
                key={project._id}
                onLongPress={() => handleDeleteProject(project)}
                style={[base.card, s.projectCard]}
              >
                <Text style={s.projectName} numberOfLines={1}>
                  {project.name}
                </Text>
                {project.settings?.genre ? (
                  <Text style={[base.textXs, base.mt1]}>
                    {project.settings.genre}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}

            {showProjectForm ? (
              <View style={[base.rowCenter, base.gap2]}>
                <TextInput
                  value={projectName}
                  onChangeText={setProjectName}
                  placeholder={t("world.novelNamePlaceholder")}
                  placeholderTextColor={colors.slate500}
                  autoFocus
                  style={[base.input, { width: 140, fontSize: 13, paddingVertical: 8, paddingHorizontal: 12 }]}
                />
                <TouchableOpacity
                  onPress={() => {
                    if (!projectName.trim()) return;
                    createProjectMut.mutate({
                      name: projectName.trim(),
                      worldId: worldId!,
                    });
                  }}
                  disabled={
                    createProjectMut.isPending || !projectName.trim()
                  }
                  style={s.addProjectBtn}
                >
                  <Text style={s.addProjectText}>{t("world.add")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setShowProjectForm(false);
                    setProjectName("");
                  }}
                >
                  <Text style={[base.textSm]}>{t("world.cancel")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowProjectForm(true)}
                style={s.addProjectDashed}
              >
                <Text style={base.textSm}>+ {t("world.newNovel")}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* AI Chat button */}
        <TouchableOpacity
          onPress={() => router.push(`/chat/${worldId}`)}
          style={[base.btnPrimary, base.mb6, { paddingVertical: 14 }]}
        >
          <Text style={[base.textWhite, { fontSize: 15 }]}>
            {t("chat.aiAssistant")}
          </Text>
        </TouchableOpacity>

        {/* Search Bar */}
        <View style={s.searchBar}>
          <TextInput
            value={searchInput}
            onChangeText={handleSearchChange}
            placeholder={t("search.placeholder")}
            placeholderTextColor={colors.slate500}
            style={s.searchInput}
          />
          {searchQuery && searchResult.data && (
            <View style={s.searchMeta}>
              <View style={[s.searchBadge, searchMethod === "vector" ? s.searchBadgeVector : s.searchBadgeRegex]}>
                <Text style={s.searchBadgeText}>
                  {searchMethod === "vector" ? t("search.semantic") : t("search.keyword")}
                </Text>
              </View>
              <Text style={s.searchCount}>
                {t("search.resultCount", { count: searchResult.data.results.length })}
              </Text>
            </View>
          )}
        </View>

        {/* Tabs */}
        <View style={[base.row, base.mb4, s.tabBar]}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[
                s.tabItem,
                activeTab === tab.key ? s.tabActive : s.tabInactive,
              ]}
            >
              <Text
                style={[
                  s.tabText,
                  activeTab === tab.key ? s.tabTextActive : s.tabTextInactive,
                ]}
              >
                {tab.label}{" "}
                <Text style={base.textXs}>{tab.count}</Text>
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        {activeTab === "characters" && (
          <CharactersTab worldId={worldId!} searchResultIds={searchResultIds} />
        )}
        {activeTab === "worldSettings" && (
          <WorldSettingsTab worldId={worldId!} searchResultIds={searchResultIds} />
        )}
        {activeTab === "drafts" && (
          <DraftsTab worldId={worldId!} searchResultIds={searchResultIds} />
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  projectCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 12,
    minWidth: 140,
  },
  projectName: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
  },
  addProjectBtn: {
    backgroundColor: colors.teal,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addProjectText: {
    color: colors.white,
    fontSize: 13,
  },
  addProjectDashed: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  // Search
  searchBar: {
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 13,
  },
  searchMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  searchBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  searchBadgeVector: {
    backgroundColor: colors.tealBg,
  },
  searchBadgeRegex: {
    backgroundColor: colors.emeraldBg,
  },
  searchBadgeText: {
    fontSize: 11,
    color: colors.teal,
  },
  searchCount: {
    fontSize: 11,
    color: colors.muted,
  },
  // Tabs
  tabBar: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
  },
  tabActive: {
    borderBottomColor: colors.teal,
  },
  tabInactive: {
    borderBottomColor: "transparent",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
  },
  tabTextActive: {
    color: colors.teal,
  },
  tabTextInactive: {
    color: colors.muted,
  },
});
