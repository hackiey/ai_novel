import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Plus, Search, Trash2, Upload, X } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import CharactersTab from "../components/CharactersTab.js";
import WorldSettingsTab from "../components/WorldSettingsTab.js";
import DraftsTab from "../components/DraftsTab.js";
import AgentChatPanel from "../components/AgentChatPanel.js";
import FileImportDialog from "../components/FileImportDialog.js";
import { useBreadcrumb } from "../contexts/BreadcrumbContext.js";

type Tab = "characters" | "worldSettings" | "drafts";

export default function WorldPage() {
  const { worldId } = useParams({ strict: false }) as { worldId: string };
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("characters");
  const [createRequestKey, setCreateRequestKey] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Project creation form
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [showImportDialog, setShowImportDialog] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Queries
  const worldQuery = trpc.world.getById.useQuery({ id: worldId });
  const projectsQuery = trpc.project.listByWorld.useQuery({ worldId });
  const charactersQuery = trpc.character.list.useQuery({ worldId });
  const worldSettingsQuery = trpc.worldSetting.list.useQuery({ worldId });
  const draftsQuery = trpc.draft.list.useQuery({ worldId });
  const searchScope =
    activeTab === "characters"
      ? ["characters"]
      : activeTab === "worldSettings"
        ? ["world_settings"]
        : ["drafts"];
  const semanticSearchQuery = trpc.search.search.useQuery(
    {
      worldId,
      query: searchQuery,
      scope: searchScope,
      limit: 20,
    },
    {
      enabled: searchQuery.length > 0,
    }
  );
  // Mutations
  const createProjectMut = trpc.project.create.useMutation({
    onSuccess: () => {
      projectsQuery.refetch();
      setShowProjectForm(false);
      setProjectName("");
    },
  });
  const deleteProjectMut = trpc.project.delete.useMutation({
    onSuccess: () => { projectsQuery.refetch(); },
  });
  const world = worldQuery.data;
  const projects = (projectsQuery.data ?? []) as any[];
  const characters = (charactersQuery.data ?? []) as any[];
  const worldSettings = (worldSettingsQuery.data ?? []) as any[];
  const drafts = (draftsQuery.data ?? []) as any[];
  const searchResultIds = useMemo(
    () => semanticSearchQuery.data?.results.map((result) => result.id) ?? [],
    [semanticSearchQuery.data]
  );
  const isSearchActive = searchQuery.length > 0;

  // Hide global header — WorldPage has its own top bar
  const { setBreadcrumb, setImmersive } = useBreadcrumb();
  useEffect(() => {
    setImmersive(true);
    setBreadcrumb(null);
    return () => {
      setBreadcrumb(null);
      setImmersive(false);
    };
  }, [setBreadcrumb, setImmersive]);

  if (worldQuery.isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-white/50 mt-3">{t("world.loading")}</p>
        </div>
      </div>
    );
  }

  if (!world) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <p className="text-white/50">{t("world.notFound")}</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "characters", label: t("world.characters"), count: characters.length },
    { key: "worldSettings", label: t("world.worldSettings"), count: worldSettings.length },
    { key: "drafts", label: t("world.drafts"), count: drafts.length },
  ];

  const activeTabCreateLabel =
    activeTab === "characters"
      ? t("world.createCharacter")
      : activeTab === "worldSettings"
        ? t("world.createWorldSetting")
        : t("world.createDraft");

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-20 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Link
            to="/"
            className="text-white/60 hover:text-white transition-colors font-bold shrink-0"
          >
            AI Creator
          </Link>
          <span className="text-white/30 shrink-0">/</span>
          <span className="font-medium text-white/80 truncate">
            {world.name}
          </span>
        </div>
      </div>

      {/* Center: Content + Chat side by side */}
      <div className="absolute inset-0 flex items-start justify-center z-10 pt-12 pb-4 px-4">
        <div
          className="h-full flex gap-3 transition-all duration-300 ease-in-out"
          style={{ width: "100%", maxWidth: "90rem" }}
        >
          {/* World content panel */}
          <div className="flex-1 min-w-0 flex flex-col glass-panel rounded-xl overflow-hidden">
            {/* Fixed header area */}
            <div className="shrink-0 px-4 sm:px-6 pt-5">
              {/* Header */}
              <div className="mb-5">
                <h1 className="text-xl font-bold text-white/90">{world.name}</h1>
                {world.description && (
                  <p className="text-sm text-white/50 mt-1 max-w-2xl">{world.description}</p>
                )}
              </div>

              {/* Projects Bar */}
              <div className="mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wide">{t("world.novels")}</h2>
                </div>
                <div className="flex items-center gap-3 overflow-x-auto pb-2">
                  {projects.map((project: any) => (
                    <Link
                      key={project._id}
                      to="/project/$projectId/write"
                      params={{ projectId: project._id }}
                      search={{ chapterId: undefined }}
                      className="flex-shrink-0 group relative px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:border-teal-400/30 hover:bg-white/10 transition-all min-w-[160px] max-w-[220px]"
                    >
                      <div className="text-sm font-medium text-white/80 group-hover:text-teal-400 truncate pr-5">
                        {project.name}
                      </div>
                      {project.settings?.genre && (
                        <div className="text-[10px] text-white/40 mt-1 truncate">{project.settings.genre}</div>
                      )}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (confirm(t("world.deleteConfirm", { name: project.name }))) {
                            deleteProjectMut.mutate({ id: project._id });
                          }
                        }}
                        className="absolute top-2 right-2 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </Link>
                  ))}

                  {/* New Project button / form */}
                  {showProjectForm ? (
                    <form
                      className="flex-shrink-0 flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!projectName.trim()) return;
                        createProjectMut.mutate({
                          name: projectName.trim(),
                          worldId,
                        });
                      }}
                    >
                      <input
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder={t("world.novelNamePlaceholder")}
                        autoFocus
                        className="w-40 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                      <button
                        type="submit"
                        disabled={createProjectMut.isPending || !projectName.trim()}
                        className="px-3 py-2 text-sm rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 disabled:opacity-50 transition-colors"
                      >
                        {createProjectMut.isPending ? "..." : t("world.add")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowProjectForm(false); setProjectName(""); }}
                        className="px-2 py-2 text-sm text-white/40 hover:text-white/60"
                      >
                        {t("world.cancel")}
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setShowProjectForm(true)}
                      className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 rounded-xl border border-dashed border-white/20 text-sm text-white/40 hover:text-teal-400 hover:border-teal-400/30 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      {t("world.newNovel")}
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="mb-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                  <div className="flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
                    {tabs.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                          activeTab === tab.key
                            ? "bg-white/10 text-white/90 shadow-sm"
                            : "text-white/50 hover:text-white/70 hover:bg-white/5"
                        }`}
                      >
                        {tab.label}
                        {tab.count !== undefined && <span className="ml-1.5 text-xs text-white/40">{tab.count}</span>}
                      </button>
                    ))}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <div className="relative w-full sm:w-72">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                      <input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder={t("search.placeholder")}
                        className="w-full rounded-lg border border-white/20 bg-white/5 py-1.5 pl-9 pr-9 text-xs text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                      {searchInput && (
                        <button
                          type="button"
                          onClick={() => setSearchInput("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/60 transition-colors"
                          aria-label={t("search.clear")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => setShowImportDialog(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/50 hover:text-teal-400 border border-white/20 hover:border-teal-400/30 rounded-lg transition-colors shrink-0"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t("import.button")}</span>
                    </button>
                    <button
                      onClick={() => setCreateRequestKey((value) => value + 1)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-xs text-white/80 hover:bg-white/20 transition-colors shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{activeTabCreateLabel}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Scrollable tab content */}
            <div className="flex-1 overflow-y-auto scrollbar-none px-4 sm:px-6 pb-5">
              {activeTab === "characters" && (
                <CharactersTab
                  worldId={worldId}
                  createRequestKey={createRequestKey}
                  searchQuery={searchQuery}
                  searchResultIds={searchResultIds}
                  searchMethod={semanticSearchQuery.data?.method ?? null}
                  isSearching={semanticSearchQuery.isFetching && isSearchActive}
                />
              )}

              {activeTab === "worldSettings" && (
                <WorldSettingsTab
                  worldId={worldId}
                  createRequestKey={createRequestKey}
                  searchQuery={searchQuery}
                  searchResultIds={searchResultIds}
                  searchMethod={semanticSearchQuery.data?.method ?? null}
                  isSearching={semanticSearchQuery.isFetching && isSearchActive}
                />
              )}

              {activeTab === "drafts" && (
                <DraftsTab
                  worldId={worldId}
                  createRequestKey={createRequestKey}
                  searchQuery={searchQuery}
                  searchResultIds={searchResultIds}
                  searchMethod={semanticSearchQuery.data?.method ?? null}
                  isSearching={semanticSearchQuery.isFetching && isSearchActive}
                />
              )}
            </div>
          </div>

          {/* Chat panel */}
          <div className="shrink-0 w-[420px] flex flex-col overflow-hidden glass-panel rounded-xl">
            <AgentChatPanel worldId={worldId} variant="immersive" />
          </div>
        </div>
      </div>

      {/* File Import Dialog */}
      {showImportDialog && (
        <FileImportDialog
          worldId={worldId}
          onClose={() => {
            setShowImportDialog(false);
            charactersQuery.refetch();
            worldSettingsQuery.refetch();
          }}
        />
      )}
    </div>
  );
}
