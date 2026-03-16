import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import CharactersTab from "../components/CharactersTab.js";
import WorldSettingsTab from "../components/WorldSettingsTab.js";
import AgentChatPanel from "../components/AgentChatPanel.js";

type Tab = "characters" | "worldSettings" | "drafts";

export default function WorldPage() {
  const { worldId } = useParams({ strict: false }) as { worldId: string };
  const [activeTab, setActiveTab] = useState<Tab>("characters");

  // Project creation form
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");

  // Draft form
  const [showDraftForm, setShowDraftForm] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

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
  const createDraftMut = trpc.draft.create.useMutation({
    onSuccess: () => { draftsQuery.refetch(); setShowDraftForm(false); setDraftTitle(""); setDraftContent(""); },
  });
  const deleteDraftMut = trpc.draft.delete.useMutation({
    onSuccess: () => { draftsQuery.refetch(); },
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
        <p className="text-sm text-gray-500 mt-3">Loading world...</p>
      </div>
    );
  }

  if (!world) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">World not found.</p>
        <Link to="/" className="text-sm text-teal-600 hover:text-teal-500 mt-2 inline-block">
          Back to home
        </Link>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "characters", label: "Characters", count: characters.length },
    { key: "worldSettings", label: "World Settings", count: worldSettings.length },
    { key: "drafts", label: "Drafts", count: drafts.length },
  ];

  return (
    <div className="flex h-[calc(100vh-53px)]">
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          {/* Header */}
          <div className="mb-6">
            <Link to="/" className="text-xs text-gray-400 hover:text-gray-600 mb-2 inline-block">
              &larr; Back to home
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">{world.name}</h1>
            {world.description && (
              <p className="text-sm text-gray-500 mt-1 max-w-2xl">{world.description}</p>
            )}
          </div>

          {/* Projects Bar */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Novels</h2>
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
                      if (confirm(`Delete "${project.name}"?`)) {
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
                    placeholder="Novel name"
                    autoFocus
                    className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                  <button
                    type="submit"
                    disabled={createProjectMut.isPending || !projectName.trim()}
                    className="px-3 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
                  >
                    {createProjectMut.isPending ? "..." : "Add"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowProjectForm(false); setProjectName(""); }}
                    className="px-2 py-2 text-sm text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setShowProjectForm(true)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 rounded-xl border border-dashed border-gray-300 text-sm text-gray-400 hover:text-teal-600 hover:border-teal-300 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Novel
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
                  <span className="ml-1.5 text-xs text-gray-400">{tab.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div>
            {activeTab === "characters" && <CharactersTab worldId={worldId} />}

            {activeTab === "worldSettings" && <WorldSettingsTab worldId={worldId} />}

            {/* Drafts Tab */}
            {activeTab === "drafts" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                    Drafts ({drafts.length})
                  </h3>
                  <button
                    onClick={() => setShowDraftForm(true)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-500 transition-colors"
                  >
                    + Add Draft
                  </button>
                </div>

                {showDraftForm && (
                  <div className="mb-4 p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">New Draft</h4>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!draftTitle.trim()) return;
                        createDraftMut.mutate({
                          worldId,
                          title: draftTitle.trim(),
                          content: draftContent.trim() || undefined,
                        });
                      }}
                      className="space-y-3"
                    >
                      <input
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        placeholder="Draft title"
                        className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                      <textarea
                        value={draftContent}
                        onChange={(e) => setDraftContent(e.target.value)}
                        placeholder="Notes, ideas, brainstorming..."
                        rows={4}
                        className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => { setShowDraftForm(false); setDraftTitle(""); setDraftContent(""); }}
                          className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={createDraftMut.isPending}
                          className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
                        >
                          {createDraftMut.isPending ? "Adding..." : "Add"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {drafts.length === 0 && !showDraftForm ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    No drafts yet. Start a draft to brainstorm ideas.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {drafts.map((disc: any) => (
                      <div
                        key={disc._id}
                        className="p-4 rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="text-sm font-medium text-gray-800 mb-1">{disc.title}</h4>
                            {disc.content && (
                              <p className="text-xs text-gray-500 line-clamp-3">{disc.content}</p>
                            )}
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() => {
                                if (confirm(`Delete "${disc.title}"?`)) {
                                  deleteDraftMut.mutate({ id: disc._id });
                                }
                              }}
                              className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Chat Panel */}
      <div className="w-1/3 min-w-[320px] border-l border-gray-200 bg-gray-50/50 shrink-0">
        <AgentChatPanel worldId={worldId} />
      </div>
    </div>
  );
}
