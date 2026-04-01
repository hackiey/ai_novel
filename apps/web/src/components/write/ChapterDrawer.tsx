import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus } from "lucide-react";

interface ChapterDrawerProps {
  open: boolean;
  onClose: () => void;
  chapters: any[];
  selectedChapterId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete?: (id: string) => void;
  creating: boolean;
}

export default function ChapterDrawer({
  open,
  onClose,
  chapters,
  selectedChapterId,
  onSelect,
  onCreate,
  onRename,
  creating,
}: ChapterDrawerProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Close on any click outside the popover
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Use setTimeout so the opening click doesn't immediately close it
    const id = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, onClose]);

  return (
    <div
      ref={panelRef}
      className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 glass-panel-solid rounded-xl w-64 max-h-80 flex flex-col overflow-hidden
        transition-all duration-200 ease-out origin-bottom
        ${open
          ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
          : "opacity-0 scale-95 translate-y-2 pointer-events-none"
        }`}
    >
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-white/70">{t("write.chapters")}</span>
        <button
          onClick={onCreate}
          disabled={creating}
          className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          title={t("write.addChapter")}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {chapters.length === 0 ? (
          <div className="px-3 py-4 text-xs text-white/40 text-center">
            {t("write.noChapters")}
          </div>
        ) : (
          chapters.map((ch) => (
            <div
              key={ch._id}
              className={`group/ch flex items-center gap-1 px-3 py-2 text-sm transition-colors cursor-pointer ${
                selectedChapterId === ch._id
                  ? "bg-white/15 text-white font-medium"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
              onClick={() => {
                if (editingId !== ch._id) {
                  onSelect(ch._id);
                  onClose();
                }
              }}
            >
              {editingId === ch._id ? (
                <input
                  ref={editInputRef}
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onBlur={() => {
                    const trimmed = editDraft.trim();
                    if (trimmed && trimmed !== ch.title) onRename(ch._id, trimmed);
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const trimmed = editDraft.trim();
                      if (trimmed && trimmed !== ch.title) onRename(ch._id, trimmed);
                      setEditingId(null);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 text-sm bg-white/10 text-white border border-white/20 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-teal-400"
                />
              ) : (
                <>
                  <span className={`flex-1 min-w-0 truncate ${
                    selectedChapterId === ch._id ? "text-white" : "text-white/70"
                  }`}>
                    {ch.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(ch._id);
                      setEditDraft(ch.title);
                      setTimeout(() => editInputRef.current?.focus(), 0);
                    }}
                    className="shrink-0 p-0.5 text-white/0 group-hover/ch:text-white/30 hover:!text-teal-400 transition-colors"
                    title={t("common.edit")}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
