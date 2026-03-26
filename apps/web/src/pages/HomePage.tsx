import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Trash2, FileEdit } from "lucide-react";
import { trpc } from "../lib/trpc.js";

export default function HomePage() {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const projectsQuery = trpc.project.list.useQuery();
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
    onSuccess: () => {
      worldsQuery.refetch();
    },
  });

  const projects = (projectsQuery.data ?? []) as any[];
  const worlds = worldsQuery.data ?? [];

  // Build a worldId -> world name map for display
  const worldMap = new Map<string, string>();
  for (const w of worlds as any[]) {
    worldMap.set(w._id, w.name);
  }

  return (
    <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      {/* Novels — quick access row */}
      {projects.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">{t("home.novels")}</h2>
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-none pb-1">
            {projects.map((project: any) => (
              <Link
                key={project._id}
                to="/project/$projectId/write"
                params={{ projectId: project._id }}
                search={{ chapterId: undefined }}
                className="flex-shrink-0 group relative px-4 py-3 rounded-xl glass-panel hover:border-teal-400/30 hover:bg-white/10 transition-all min-w-[180px] max-w-[240px]"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileEdit className="w-3.5 h-3.5 text-teal-400/60 shrink-0" />
                  <div className="text-sm font-medium text-white/80 group-hover:text-teal-400 truncate">
                    {project.name}
                  </div>
                </div>
                {project.worldId && worldMap.has(project.worldId) && (
                  <div className="text-[10px] text-white/40 truncate pl-5.5">
                    {worldMap.get(project.worldId)}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Worlds header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wide">{t("home.title")}</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 text-xs rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 transition-colors font-medium"
          >
            {t("home.newWorld")}
          </button>
        )}
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="mb-6 rounded-xl glass-panel p-6">
          <h2 className="text-lg font-semibold text-white/90 mb-4">{t("home.createTitle")}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              createMutation.mutate({
                name: name.trim(),
                description: description.trim() || undefined,
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">{t("home.worldName")}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("home.worldNamePlaceholder")}
                required
                maxLength={200}
                className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">{t("home.description")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("home.descriptionPlaceholder")}
                rows={3}
                maxLength={2000}
                className="w-full rounded-lg bg-white/5 border border-white/20 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setShowForm(false); setName(""); setDescription(""); }}
                className="px-4 py-2 text-sm rounded-lg border border-white/20 text-white/60 hover:bg-white/10 transition-colors"
              >
                {t("home.cancel")}
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || !name.trim()}
                className="px-4 py-2 text-sm rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? t("home.creating") : t("home.createWorld")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading */}
      {worldsQuery.isLoading && (
        <div className="text-center py-16">
          <div className="inline-block w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-white/50 mt-3">{t("home.loading")}</p>
        </div>
      )}

      {/* Error */}
      {worldsQuery.isError && (
        <div className="text-center py-16">
          <p className="text-sm text-red-400">
            {t("home.loadFailed")}
          </p>
          <button
            onClick={() => worldsQuery.refetch()}
            className="mt-3 text-sm text-teal-400 hover:text-teal-300"
          >
            {t("home.retry")}
          </button>
        </div>
      )}

      {/* Empty State */}
      {!worldsQuery.isLoading && !worldsQuery.isError && worlds.length === 0 && !showForm && (
        <div className="text-center py-20 rounded-xl border border-dashed border-white/20">
          <h3 className="text-lg font-medium text-white/70 mb-1">{t("home.noWorldsTitle")}</h3>
          <p className="text-sm text-white/50 mb-4">
            {t("home.noWorldsText")}
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 text-sm rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 transition-colors"
          >
            {t("home.newWorld")}
          </button>
        </div>
      )}

      {/* World Grid — large cards */}
      {worlds.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {worlds.map((world: any) => (
            <Link
              key={world._id}
              to="/world/$worldId"
              params={{ worldId: world._id }}
              className="block rounded-2xl glass-panel p-6 hover:border-teal-400/30 hover:bg-white/12 transition-all group"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="text-lg font-semibold text-white/90 group-hover:text-teal-400 transition-colors">
                  {world.name}
                </h3>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm(t("home.deleteConfirm", { name: world.name }))) {
                      deleteMutation.mutate({ id: world._id });
                    }
                  }}
                  className="text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  title={t("common.delete")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {world.description && (
                <p className="text-sm text-white/50 line-clamp-3 mb-4">{world.description}</p>
              )}
              <div className="text-xs text-white/30">
                {t("home.updated")}{" "}
                {new Date(world.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
