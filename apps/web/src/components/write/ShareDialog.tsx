import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { X, Copy, Check, ExternalLink } from "lucide-react";
import { trpc } from "../../lib/trpc.js";

type ShareTheme = "rain" | "starfield";
type ShareFont = "default" | "longcang" | "liujianmaocao" | "zhimangxing" | "mashanzheng" | "zcoolkuaile" | "zcoolqingkehuangyou" | "zcoolxiaowei" | "xiaolai" | "neoxihei" | "markergothic";

const THEMES: { key: ShareTheme; gradient: string; label: string }[] = [
  { key: "rain", gradient: "linear-gradient(135deg, #0a0c12 0%, #1a2030 100%)", label: "write.theme_rain" },
  { key: "starfield", gradient: "linear-gradient(135deg, #050510 0%, #151530 100%)", label: "write.theme_starfield" },
];

const FONT_OPTIONS: { key: ShareFont; label: string }[] = [
  { key: "default", label: "楷体" },
  { key: "longcang", label: "龙藏" },
  { key: "liujianmaocao", label: "毛草" },
  { key: "zhimangxing", label: "芒行" },
  { key: "mashanzheng", label: "马善" },
  { key: "zcoolkuaile", label: "快乐" },
  { key: "zcoolqingkehuangyou", label: "黄油" },
  { key: "zcoolxiaowei", label: "小薇" },
  { key: "xiaolai", label: "小赖" },
  { key: "neoxihei", label: "晰黑" },
  { key: "markergothic", label: "漫黑" },
];

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export default function ShareDialog({ open, onClose, projectId }: ShareDialogProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Local form state
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [theme, setTheme] = useState<ShareTheme>("starfield");
  const [font, setFont] = useState<ShareFont>("default");
  const [isActive, setIsActive] = useState(true);

  const utils = trpc.useUtils();

  const chaptersQuery = trpc.chapter.list.useQuery({ projectId }, { enabled: open });
  const shareQuery = trpc.share.getByProject.useQuery({ projectId }, { enabled: open });

  const createMutation = trpc.share.create.useMutation({
    onSuccess: () => utils.share.getByProject.invalidate({ projectId }),
  });
  const updateMutation = trpc.share.update.useMutation({
    onSuccess: () => utils.share.getByProject.invalidate({ projectId }),
  });
  const deleteMutation = trpc.share.delete.useMutation({
    onSuccess: () => {
      utils.share.getByProject.invalidate({ projectId });
      onClose();
    },
  });

  const share = shareQuery.data;
  const chapters = (chaptersQuery.data ?? []).sort(
    (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0),
  );

  // Sync local state when share data loads
  useEffect(() => {
    if (share) {
      setSelectedChapterIds(share.includedChapterIds ?? []);
      setTheme((share.theme as ShareTheme) ?? "starfield");
      setFont((share.font as ShareFont) ?? "default");
      setIsActive(share.isActive ?? true);
    } else if (chapters.length > 0 && !share) {
      setSelectedChapterIds(chapters.map((c: any) => c._id));
    }
  }, [share, chapters.length]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const id = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handleClick); };
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const shareUrl = share ? `${window.location.origin}/s/${share.shareToken}` : "";

  const toggleChapter = (id: string) => {
    setSelectedChapterIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAll = () => setSelectedChapterIds(chapters.map((c: any) => c._id));
  const deselectAll = () => setSelectedChapterIds([]);

  const handleCreate = () => {
    createMutation.mutate({
      projectId,
      includedChapterIds: selectedChapterIds,
      theme,
      font,
    });
  };

  const handleSave = () => {
    if (!share) return;
    updateMutation.mutate({
      id: share._id,
      data: {
        includedChapterIds: selectedChapterIds,
        theme,
        font,
        isActive,
      },
    });
  };

  const handleDelete = () => {
    if (!share || !confirm(t("share.deleteConfirm"))) return;
    deleteMutation.mutate({ id: share._id });
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div ref={panelRef} className="glass-panel-solid rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto scrollbar-none mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-white text-sm font-medium">
            {share ? t("share.title") : t("share.createTitle")}
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Share link (if exists) */}
          {share && (
            <div>
              <label className="text-xs text-white/40 mb-1.5 block">{t("share.link")}</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/70 font-mono truncate"
                />
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
                  title={t("share.copyLink")}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
                  title={t("share.openReader")}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Active toggle (if exists) */}
          {share && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">
                {isActive ? t("share.active") : t("share.inactive")}
              </span>
              <button
                onClick={() => setIsActive(!isActive)}
                className={`relative w-10 h-5 rounded-full transition-colors ${isActive ? "bg-teal-500" : "bg-white/20"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isActive ? "translate-x-5" : ""}`} />
              </button>
            </div>
          )}

          {/* Chapter selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-white/40">{t("share.chapters")}</label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-teal-400/70 hover:text-teal-400 transition-colors">
                  {t("share.selectAll")}
                </button>
                <button onClick={deselectAll} className="text-xs text-white/30 hover:text-white/50 transition-colors">
                  {t("share.deselectAll")}
                </button>
              </div>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-none">
              {chapters.map((ch: any, i: number) => (
                <label
                  key={ch._id}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedChapterIds.includes(ch._id)}
                    onChange={() => toggleChapter(ch._id)}
                    className="w-3.5 h-3.5 rounded accent-teal-500"
                  />
                  <span className="text-white/30 text-xs w-5">{i + 1}.</span>
                  <span className="text-sm text-white/70 truncate">{ch.title}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Theme picker */}
          <div>
            <label className="text-xs text-white/40 mb-1.5 block">{t("share.theme")}</label>
            <div className="flex gap-2">
              {THEMES.map(({ key, gradient, label }) => (
                <button
                  key={key}
                  onClick={() => setTheme(key)}
                  className={`w-16 h-12 rounded-lg border-2 transition-all flex items-end justify-center pb-1 ${
                    theme === key ? "border-teal-400 scale-105" : "border-white/20 hover:border-white/40"
                  }`}
                  style={{ background: gradient }}
                >
                  <span className="text-[10px] font-medium text-white/70">{t(label)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font picker */}
          <div>
            <label className="text-xs text-white/40 mb-1.5 block">{t("share.font")}</label>
            <div className="flex flex-wrap gap-1.5">
              {FONT_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFont(key)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    font === key
                      ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                      : "bg-white/5 text-white/50 border border-white/10 hover:border-white/20"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between">
          {share ? (
            <>
              <button
                onClick={handleDelete}
                className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
              >
                {t("share.delete")}
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-1.5 bg-teal-500/20 text-teal-400 rounded-lg text-sm hover:bg-teal-500/30 transition-colors disabled:opacity-50"
              >
                {isSaving ? t("share.saving") : t("share.save")}
              </button>
            </>
          ) : (
            <>
              <div />
              <button
                onClick={handleCreate}
                disabled={isSaving || selectedChapterIds.length === 0}
                className="px-4 py-1.5 bg-teal-500/20 text-teal-400 rounded-lg text-sm hover:bg-teal-500/30 transition-colors disabled:opacity-50"
              >
                {isSaving ? t("share.creating") : t("share.create")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
