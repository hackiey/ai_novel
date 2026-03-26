import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "../lib/trpc.js";
import { useAuth } from "../contexts/AuthContext.js";
import { Loader2, Plus, Trash2, X } from "lucide-react";

export default function AdminPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  if (user?.role !== "admin") {
    return <div className="p-8 text-center text-white/50">{t("admin.noAccess")}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      <h1 className="text-2xl font-bold text-white/90">{t("admin.title")}</h1>
      <PermissionGroupSection />
      <UserSection />
    </div>
  );
}

function PermissionGroupSection() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const groupsQuery = trpc.permissionGroup.list.useQuery();
  const createMutation = trpc.permissionGroup.create.useMutation({
    onSuccess: () => utils.permissionGroup.list.invalidate(),
  });
  const updateMutation = trpc.permissionGroup.update.useMutation({
    onSuccess: () => utils.permissionGroup.list.invalidate(),
  });
  const deleteMutation = trpc.permissionGroup.delete.useMutation({
    onSuccess: () => utils.permissionGroup.list.invalidate(),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [models, setModels] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editModels, setEditModels] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await createMutation.mutateAsync({
      name,
      allowedModels: models ? models.split(",").map((m) => m.trim()).filter(Boolean) : undefined,
    });
    setName("");
    setModels("");
    setShowCreate(false);
  }

  async function handleUpdate(id: string) {
    await updateMutation.mutateAsync({
      id,
      data: {
        name: editName,
        allowedModels: editModels ? editModels.split(",").map((m) => m.trim()).filter(Boolean) : [],
      },
    });
    setEditingId(null);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white/80">{t("admin.permissionGroups")}</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20"
        >
          {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showCreate ? t("admin.cancel") : t("admin.new")}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-4 p-4 glass-panel rounded-lg space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("admin.groupNamePlaceholder")}
            required
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <input
            value={models}
            onChange={(e) => setModels(e.target.value)}
            placeholder={t("admin.allowedModelsPlaceholder")}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            type="submit"
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20"
          >
            {t("admin.create")}
          </button>
        </form>
      )}

      {groupsQuery.isLoading && <Loader2 className="w-5 h-5 animate-spin text-white/40" />}
      <div className="space-y-2">
        {groupsQuery.data?.map((g: any) => (
          <div key={g._id} className="p-3 glass-panel rounded-lg">
            {editingId === g._id ? (
              <div className="space-y-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded border border-white/20 bg-white/5 px-2 py-1 text-sm text-white/90"
                />
                <input
                  value={editModels}
                  onChange={(e) => setEditModels(e.target.value)}
                  placeholder={t("admin.allowedModelsPlaceholder")}
                  className="w-full rounded border border-white/20 bg-white/5 px-2 py-1 text-sm text-white/90 placeholder-white/30"
                />
                <div className="flex gap-2">
                  <button onClick={() => handleUpdate(g._id)} className="text-xs text-teal-400 hover:underline">{t("admin.save")}</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-white/50 hover:underline">{t("admin.cancel")}</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm text-white/80">{g.name}</span>
                  {g.allowedModels?.length > 0 && (
                    <span className="ml-2 text-xs text-white/40">{g.allowedModels.join(", ")}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditingId(g._id); setEditName(g.name); setEditModels(g.allowedModels?.join(", ") || ""); }}
                    className="text-xs text-white/50 hover:text-teal-400"
                  >
                    {t("admin.edit")}
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate({ id: g._id })}
                    className="text-xs text-white/40 hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function UserSection() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const usersQuery = trpc.permissionGroup.listUsers.useQuery();
  const groupsQuery = trpc.permissionGroup.list.useQuery();
  const assignMutation = trpc.permissionGroup.assignUser.useMutation({
    onSuccess: () => utils.permissionGroup.listUsers.invalidate(),
  });
  const roleMutation = trpc.permissionGroup.setUserRole.useMutation({
    onSuccess: () => utils.permissionGroup.listUsers.invalidate(),
  });

  return (
    <section>
      <h2 className="text-lg font-semibold text-white/80 mb-4">{t("admin.userManagement")}</h2>
      {usersQuery.isLoading && <Loader2 className="w-5 h-5 animate-spin text-white/40" />}
      <div className="overflow-x-auto glass-panel rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-white/50">
              <th className="py-2 px-3 pr-4">{t("admin.user")}</th>
              <th className="py-2 px-3 pr-4">{t("admin.email")}</th>
              <th className="py-2 px-3 pr-4">{t("admin.role")}</th>
              <th className="py-2 px-3 pr-4">{t("admin.permissionGroup")}</th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.data?.map((u: any) => (
              <tr key={u._id} className="border-b border-white/5">
                <td className="py-2 px-3 pr-4 text-white/80">{u.displayName}</td>
                <td className="py-2 px-3 pr-4 text-white/50">{u.email}</td>
                <td className="py-2 px-3 pr-4">
                  <select
                    value={u.role}
                    onChange={(e) => roleMutation.mutate({ userId: u._id, role: e.target.value as "admin" | "user" })}
                    className="text-xs border border-white/20 bg-white/5 text-white/80 rounded px-1.5 py-0.5"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="py-2 px-3 pr-4">
                  <select
                    value={u.permissionGroupId || ""}
                    onChange={(e) => assignMutation.mutate({
                      userId: u._id,
                      permissionGroupId: e.target.value || undefined,
                    })}
                    className="text-xs border border-white/20 bg-white/5 text-white/80 rounded px-1.5 py-0.5"
                  >
                    <option value="">{t("admin.none")}</option>
                    {groupsQuery.data?.map((g: any) => (
                      <option key={g._id} value={g._id}>{g.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
