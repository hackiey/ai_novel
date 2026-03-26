import { useTranslation } from "react-i18next";

interface Chapter {
  _id: string;
  title: string;
  order: number;
  status: string;
  wordCount: number;
  synopsis?: string;
}

interface ChapterListProps {
  chapters: Chapter[];
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const statusColors: Record<string, string> = {
  draft: "bg-yellow-50 text-yellow-700",
  revision: "bg-cyan-50 text-cyan-700",
  final: "bg-green-50 text-green-700",
};

export default function ChapterList({ chapters, onAdd, onEdit, onDelete }: ChapterListProps) {
  const { t } = useTranslation();
  const sorted = [...chapters].sort((a, b) => a.order - b.order);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
          {t("chapter.count", { count: chapters.length })}
        </h3>
        <button
          onClick={onAdd}
          className="text-xs px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 transition-colors"
        >
          {t("chapter.addChapter")}
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          {t("chapter.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((ch) => (
            <div
              key={ch._id}
              role="button"
              tabIndex={0}
              onClick={() => onEdit(ch._id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEdit(ch._id);
                }
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all group cursor-pointer"
            >
              <span className="text-xs font-mono text-gray-400 w-6 text-right shrink-0">
                {ch.order + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800 truncate">
                    {ch.title}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${statusColors[ch.status] ?? statusColors.draft}`}
                  >
                    {ch.status}
                  </span>
                </div>
                {ch.synopsis && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{ch.synopsis}</p>
                )}
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {ch.wordCount.toLocaleString()} {t("chapter.words")}
              </span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(ch._id);
                  }}
                  className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  {t("chapter.edit")}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(ch._id);
                  }}
                  className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                >
                  {t("chapter.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
