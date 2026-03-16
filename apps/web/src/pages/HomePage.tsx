import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { trpc } from "../lib/trpc.js";

export default function HomePage() {
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
    onSuccess: () => {
      worldsQuery.refetch();
    },
  });

  const worlds = worldsQuery.data ?? [];

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your Worlds</h1>
          <p className="text-sm text-gray-500 mt-1">
            Each world contains characters, settings, and novels
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-500 transition-colors font-medium"
          >
            + New World
          </button>
        )}
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New World</h2>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">World Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Fantasy World"
                required
                maxLength={200}
                className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief description of this world..."
                rows={3}
                maxLength={2000}
                className="w-full rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setShowForm(false); setName(""); setDescription(""); }}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || !name.trim()}
                className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? "Creating..." : "Create World"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading */}
      {worldsQuery.isLoading && (
        <div className="text-center py-16">
          <div className="inline-block w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 mt-3">Loading worlds...</p>
        </div>
      )}

      {/* Error */}
      {worldsQuery.isError && (
        <div className="text-center py-16">
          <p className="text-sm text-red-500">
            Failed to load. Make sure the server is running on port 3001.
          </p>
          <button
            onClick={() => worldsQuery.refetch()}
            className="mt-3 text-sm text-teal-600 hover:text-teal-500"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!worldsQuery.isLoading && !worldsQuery.isError && worlds.length === 0 && !showForm && (
        <div className="text-center py-20 rounded-xl border border-dashed border-gray-300">
          <h3 className="text-lg font-medium text-gray-700 mb-1">No worlds yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            Create a world to start building characters, settings, and writing novels.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-500 transition-colors"
          >
            + New World
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
              className="block rounded-2xl border border-gray-200 bg-white p-6 hover:border-teal-300 hover:shadow-lg transition-all group"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="text-lg font-semibold text-gray-900 group-hover:text-teal-600 transition-colors">
                  {world.name}
                </h3>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm(`Delete "${world.name}" and all its data?`)) {
                      deleteMutation.mutate({ id: world._id });
                    }
                  }}
                  className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  title="Delete world"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {world.description && (
                <p className="text-sm text-gray-500 line-clamp-3 mb-4">{world.description}</p>
              )}
              <div className="text-xs text-gray-400">
                Updated{" "}
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
