import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import EditableText from "../EditableText.js";

interface ChapterDrawerProps {
  open: boolean;
  onClose: () => void;
  chapters: any[];
  selectedChapterId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
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
            <button
              key={ch._id}
              onClick={() => {
                onSelect(ch._id);
                onClose();
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                selectedChapterId === ch._id
                  ? "bg-white/15 text-white font-medium"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <EditableText
                value={ch.title}
                onSave={(title) => onRename(ch._id, title)}
                className={`truncate ${
                  selectedChapterId === ch._id ? "text-white" : "text-white/70"
                }`}
                inputClassName="text-sm w-full bg-white/10 text-white border-white/20 rounded px-1"
              />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
