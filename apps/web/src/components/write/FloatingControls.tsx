import { useState } from "react";
import { useTranslation } from "react-i18next";
import { List, MessageSquare, Palette } from "lucide-react";
import ThemePicker from "./ThemePicker.js";
import ChapterDrawer from "./ChapterDrawer.js";
import { type WriteTheme } from "../../contexts/WriteThemeContext.js";

interface FloatingControlsProps {
  onOpenChat: () => void;
  theme: WriteTheme;
  onThemeChange: (theme: WriteTheme) => void;
  statCount: number;
  statIsCjk: boolean;
  chapters: any[];
  selectedChapterId: string;
  onChapterSelect: (id: string) => void;
  onChapterCreate: () => void;
  onChapterRename: (id: string, title: string) => void;
  chapterCreating: boolean;
  chatOpen?: boolean;
}

export default function FloatingControls({
  onOpenChat,
  theme,
  onThemeChange,
  statCount,
  statIsCjk,
  chapters,
  selectedChapterId,
  onChapterSelect,
  onChapterCreate,
  onChapterRename,
  chapterCreating,
  chatOpen = false,
}: FloatingControlsProps) {
  const { t } = useTranslation();
  const [themeOpen, setThemeOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
      {/* Pill bar */}
      <div className="glass-panel rounded-full px-2 py-1.5 flex items-center gap-1">
        {/* Chapter button + popover anchor */}
        <div className="relative">
          <ChapterDrawer
            open={chaptersOpen}
            onClose={() => setChaptersOpen(false)}
            chapters={chapters}
            selectedChapterId={selectedChapterId}
            onSelect={onChapterSelect}
            onCreate={onChapterCreate}
            onRename={onChapterRename}
            creating={chapterCreating}
          />
          <button
            onClick={() => { setChaptersOpen(!chaptersOpen); setThemeOpen(false); }}
            className={`p-2 rounded-full transition-colors ${chaptersOpen ? "text-white bg-white/15" : "text-white/70 hover:text-white hover:bg-white/10"}`}
            title={t("write.chapters")}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => { onOpenChat(); setChaptersOpen(false); setThemeOpen(false); }}
          className={`p-2 rounded-full transition-colors ${chatOpen ? "text-white bg-white/15" : "text-white/70 hover:text-white hover:bg-white/10"}`}
          title={t("chat.aiAssistant")}
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        {/* Theme button + picker anchor */}
        <div className="relative">
          <ThemePicker
            open={themeOpen}
            onClose={() => setThemeOpen(false)}
            current={theme}
            onSelect={onThemeChange}
          />
          <button
            onClick={() => { setThemeOpen(!themeOpen); setChaptersOpen(false); }}
            className={`p-2 rounded-full transition-colors ${themeOpen ? "text-white bg-white/15" : "text-white/70 hover:text-white hover:bg-white/10"}`}
            title={t("write.theme")}
          >
            <Palette className="w-4 h-4" />
          </button>
        </div>

        <div className="w-px h-5 bg-white/20 mx-1" />
        <span className="text-xs text-white/50 px-2 tabular-nums">
          {statCount} {statIsCjk ? "字" : "words"}
        </span>
      </div>
    </div>
  );
}
