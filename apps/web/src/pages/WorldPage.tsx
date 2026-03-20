import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Upload } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import CharactersTab from "../components/CharactersTab.js";
import WorldSettingsTab from "../components/WorldSettingsTab.js";
import DraftsTab from "../components/DraftsTab.js";
import AgentChatPanel from "../components/AgentChatPanel.js";
import FileImportDialog from "../components/FileImportDialog.js";

type Tab = "characters" | "worldSettings" | "drafts";

export default function WorldPage() {
  const { worldId } = useParams({ strict: false }) as { worldId: string };
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("characters");

  // Project creation form
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Queries
  const worldQuery = trpc.world.getById.useQuery({ id: worldId });
  const projectsQuery = trpc.project.listByWorld.useQuery({ worldId });
  const charactersQuery = trpc.character.list.useQuery({ worldId });
  const worldSettingsQuery = trpc.worldSetting.list.useQuery({ worldId });
  const draftsQuery = trpc.draft.list.useQuery({ worldId });
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

  if (worldQuery.isLoading) {
    return (
      <div className="text-center py-20">
        <div className="inline-block w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 mt-3">{t("world.loading")}</p>
      </div>
    );
  }

  if (!world) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{t("world.notFound")}</p>
        <Link to="/" className="text-sm text-teal-600 hover:text-teal-500 mt-2 inline-block">
          {t("world.backToHome")}
        </Link>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "characters", label: t("world.characters"), count: characters.length },
    { key: "worldSettings", label: t("world.worldSettings"), count: worldSettings.length },
    { key: "drafts", label: t("world.drafts"), count: drafts.length },
  ];

  return (
    <div className="flex h-[calc(100vh-53px)]">
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          {/* Header */}
          <div className="mb-6">
            <Link to="/" className="text-xs text-gray-400 hover:text-gray-600 mb-2 inline-block">
              &larr; {t("world.backToHome")}
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{world.name}</h1>
              <button
                onClick={() => setShowImportDialog(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-teal-600 border border-gray-300 hover:border-teal-300 rounded-lg transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                {t("import.button")}
              </button>
            </div>
            {world.description && (
              <p className="text-sm text-gray-500 mt-1 max-w-2xl">{world.description}</p>
            )}
          </div>

          {/* Projects Bar */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("world.novels")}</h2>
            </div>
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              {projects.map((project: any) => (
                <Link
                  key={project._id}
                  to="/project/$projectId/write"
                  params={{ projectId: project._id }}
                  search={{ chapterId: undefined }}
                  className="flex-shrink-0 group relative px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-teal-300 hover:shadow-md transition-all min-w-[160px] max-w-[220px]"
                >
                  <div className="text-sm font-medium text-gray-800 group-hover:text-teal-600 truncate pr-5">
                    {project.name}
                  </div>
                  {project.settings?.genre && (
                    <div className="text-[10px] text-gray-400 mt-1 truncate">{project.settings.genre}</div>
                  )}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (confirm(t("world.deleteConfirm", { name: project.name }))) {
                        deleteProjectMut.mutate({ id: project._id });
                      }
                    }}
                    className="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
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
                    className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                  <button
                    type="submit"
                    disabled={createProjectMut.isPending || !projectName.trim()}
                    className="px-3 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
                  >
                    {createProjectMut.isPending ? "..." : t("world.add")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowProjectForm(false); setProjectName(""); }}
                    className="px-2 py-2 text-sm text-gray-400 hover:text-gray-600"
                  >
                    {t("world.cancel")}
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setShowProjectForm(true)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 rounded-xl border border-dashed border-gray-300 text-sm text-gray-400 hover:text-teal-600 hover:border-teal-300 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t("world.newNovel")}
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <div className="flex gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    activeTab === tab.key
                      ? "bg-white text-gray-900 border border-gray-200 border-b-white -mb-px"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && <span className="ml-1.5 text-xs text-gray-400">{tab.count}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div>
            {activeTab === "characters" && <CharactersTab worldId={worldId} />}

            {activeTab === "worldSettings" && <WorldSettingsTab worldId={worldId} />}

            {activeTab === "drafts" && <DraftsTab worldId={worldId} />}
          </div>
        </div>
      </div>

      {/* AI Chat Panel */}
      <div className="w-1/3 min-w-[320px] border-l border-gray-200 bg-gray-50/50 shrink-0">
        <AgentChatPanel worldId={worldId} />
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
