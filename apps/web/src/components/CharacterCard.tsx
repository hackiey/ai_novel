import { useTranslation } from "react-i18next";

interface CharacterCardProps {
  character: {
    _id: string;
    name: string;
    importance?: string;
    content?: string;
  };
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const importanceBadgeColors: Record<string, string> = {
  core: "bg-amber-50 text-amber-700 border-amber-200",
  major: "bg-blue-50 text-blue-700 border-blue-200",
  minor: "bg-gray-50 text-gray-600 border-gray-200",
};

export default function CharacterCard({ character, onEdit, onDelete }: CharacterCardProps) {
  const { t } = useTranslation();
  const badgeClass = importanceBadgeColors[character.importance ?? "minor"] ?? importanceBadgeColors.minor;
  const summary =
    character.content?.slice(0, 200) || t("character.noDescription");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 hover:shadow-sm transition-all group">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {character.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-gray-900 truncate">{character.name}</h4>
          </div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${badgeClass}`}
        >
          {t(`character.importance_${character.importance ?? "minor"}`)}
        </span>
      </div>

      <p className="text-xs text-gray-500 line-clamp-2 mb-3">{summary}</p>

      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(character._id)}
          className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
        >
          {t("character.edit")}
        </button>
        <button
          onClick={() => onDelete(character._id)}
          className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
        >
          {t("character.delete")}
        </button>
      </div>
    </div>
  );
}
