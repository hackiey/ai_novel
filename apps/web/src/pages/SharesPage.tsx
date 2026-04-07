import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check, ExternalLink, Trash2, Settings } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import { useWriteTheme } from "../contexts/WriteThemeContext.js";
import ShareDialog from "../components/write/ShareDialog.js";

export default function SharesPage() {
  const { t } = useTranslation();
  const { theme } = useWriteTheme();
  const cardClass = theme === "starfield" ? "glass-panel-lighter" : "glass-panel-light";
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);

  const sharesQuery = trpc.share.list.useQuery();
  const utils = trpc.useUtils();

  const updateMutation = trpc.share.update.useMutation({
    onSuccess: () => utils.share.list.invalidate(),
  });
  const deleteMutation = trpc.share.delete.useMutation({
    onSuccess: () => utils.share.list.invalidate(),
  });

  const shares = (sharesQuery.data ?? []) as any[];

  const handleDelete = (share: any) => {
    if (!confirm(t("share.deleteConfirm"))) return;
    deleteMutation.mutate({ id: share._id });
  };

  const handleToggleActive = (share: any) => {
    updateMutation.mutate({
      id: share._id,
      data: { isActive: !share.isActive },
    });
  };

  return (
    <div className="px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      <h1 className="text-lg font-bold text-white/90 mb-6">{t("header.shares")}</h1>

      {sharesQuery.isLoading ? (
        <div className="text-center text-white/40 text-sm py-12">{t("common.loading")}</div>
      ) : shares.length === 0 ? (
        <div className="text-center text-white/30 text-sm py-16">{t("share.noShares")}</div>
      ) : (
        <div className="space-y-3">
          {shares.map((share: any) => (
            <ShareCard
              key={share._id}
              share={share}
              cardClass={cardClass}
              onToggle={() => handleToggleActive(share)}
              onDelete={() => handleDelete(share)}
              onManage={() => setEditingProjectId(share.projectId)}
            />
          ))}
        </div>
      )}

      {editingProjectId && (
        <ShareDialog
          open
          onClose={() => {
            setEditingProjectId(null);
            utils.share.list.invalidate();
          }}
          projectId={editingProjectId}
        />
      )}
    </div>
  );
}

function ShareCard({
  share,
  cardClass,
  onToggle,
  onDelete,
  onManage,
}: {
  share: any;
  cardClass: string;
  onToggle: () => void;
  onDelete: () => void;
  onManage: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/s/${share.shareToken}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sharedCount = share.includedChapterIds?.length ?? 0;
  const totalCount = share.totalChapterCount ?? 0;

  return (
    <div className={`${cardClass} rounded-xl px-5 py-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium text-white/90 truncate">{share.projectName}</h3>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                share.isActive
                  ? "bg-teal-500/15 text-teal-400"
                  : "bg-white/5 text-white/30"
              }`}
            >
              {share.isActive ? t("share.status_active") : t("share.status_inactive")}
            </span>
          </div>
          <div className="text-xs text-white/30">
            {t("share.chapterCount", { shared: sharedCount, total: totalCount })}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onManage}
            className="p-1.5 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            title={t("share.manage")}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            title={t("share.copyLink")}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            title={t("share.openReader")}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={onToggle}
            className={`relative w-8 h-4 rounded-full transition-colors mx-1 ${share.isActive ? "bg-teal-500" : "bg-white/20"}`}
            title={share.isActive ? t("share.inactive") : t("share.active")}
          >
            <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${share.isActive ? "translate-x-4" : ""}`} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md text-white/30 hover:text-red-400 hover:bg-white/5 transition-colors"
            title={t("share.delete")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
