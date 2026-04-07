import { useState, useEffect, useRef } from "react";
import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, List, X } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import { useBreadcrumb } from "../contexts/BreadcrumbContext.js";
import { useWriteTheme } from "../contexts/WriteThemeContext.js";

export default function ReaderPage() {
  const { shareToken } = useParams({ strict: false }) as { shareToken: string };
  const { t } = useTranslation();
  const { setImmersive } = useBreadcrumb();
  const { setTheme: setGlobalTheme } = useWriteTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const tocRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setImmersive(true);
    return () => setImmersive(false);
  }, [setImmersive]);

  // Close TOC on outside click
  useEffect(() => {
    if (!tocOpen) return;
    function handleClick(e: MouseEvent) {
      if (tocRef.current && !tocRef.current.contains(e.target as Node)) {
        setTocOpen(false);
      }
    }
    const id = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handleClick); };
  }, [tocOpen]);

  const { data, isLoading, error } = trpc.share.getPublic.useQuery(
    { shareToken },
    { retry: false },
  );

  // Set the global theme to match the share's theme (drives root ShaderCanvas)
  useEffect(() => {
    if (data?.share?.theme) {
      setGlobalTheme(data.share.theme as "rain" | "starfield");
    }
  }, [data?.share?.theme, setGlobalTheme]);

  const goTo = (index: number) => {
    setCurrentIndex(index);
    setTocOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/50 text-sm">{t("common.loading")}</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-panel rounded-2xl px-8 py-6 text-center max-w-sm">
          <p className="text-white/60 text-sm">{t("reader.notFound")}</p>
        </div>
      </div>
    );
  }

  const { share, project, chapters } = data;
  const chapter = chapters[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < chapters.length - 1;
  const fontClass = share.font !== "default" ? `tiptap-font-${share.font}` : "";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3">
        <div className="flex-1" />
        <h1 className="text-white/70 text-sm font-medium truncate max-w-md text-center">
          {project.name}
        </h1>
        <div className="flex-1 flex justify-end">
          {chapters.length > 1 && (
            <div className="relative" ref={tocRef}>
              <button
                onClick={() => setTocOpen(!tocOpen)}
                className={`p-2 rounded-full transition-colors ${tocOpen ? "text-white bg-white/15" : "text-white/50 hover:text-white hover:bg-white/10"}`}
                title={t("reader.chapters")}
              >
                <List className="w-4 h-4" />
              </button>

              {/* TOC dropdown */}
              {tocOpen && (
                <div className="absolute right-0 mt-2 w-72 glass-panel-solid rounded-xl py-2 shadow-xl max-h-96 overflow-y-auto scrollbar-none z-50">
                  <div className="flex items-center justify-between px-4 py-1 mb-1">
                    <span className="text-xs text-white/40 uppercase tracking-wider">{t("reader.chapters")}</span>
                    <button onClick={() => setTocOpen(false)} className="text-white/30 hover:text-white/60">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {chapters.map((ch, i) => (
                    <button
                      key={ch._id}
                      onClick={() => goTo(i)}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        i === currentIndex
                          ? "text-teal-400 bg-white/5"
                          : "text-white/60 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span className="text-white/30 mr-2">{i + 1}.</span>
                      {ch.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <div ref={contentRef} className="flex-1">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          {chapter && (
            <div className={fontClass}>
              {/* Chapter title */}
              <h2 className="text-white/90 text-xl sm:text-2xl font-bold mb-6 text-center tiptap-immersive">
                {chapter.title}
              </h2>

              {/* Chapter content */}
              <div
                className="tiptap tiptap-immersive leading-relaxed sm:leading-loose text-base sm:text-lg"
                dangerouslySetInnerHTML={{ __html: chapter.content }}
              />

              {/* Word count */}
              {chapter.wordCount > 0 && (
                <div className="mt-8 text-center text-white/20 text-xs">
                  {t("reader.wordCount", { count: chapter.wordCount })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom navigation */}
      {chapters.length > 1 && (
        <div className="sticky bottom-0 z-30 flex justify-center py-4">
          <div className="glass-panel rounded-full px-2 py-1.5 flex items-center gap-1">
            <button
              onClick={() => hasPrev && goTo(currentIndex - 1)}
              disabled={!hasPrev}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-colors ${
                hasPrev
                  ? "text-white/70 hover:text-white hover:bg-white/10"
                  : "text-white/20 cursor-not-allowed"
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{t("reader.prev")}</span>
            </button>

            <div className="w-px h-5 bg-white/20 mx-1" />

            <span className="text-xs text-white/40 px-2 tabular-nums">
              {currentIndex + 1} / {chapters.length}
            </span>

            <div className="w-px h-5 bg-white/20 mx-1" />

            <button
              onClick={() => hasNext && goTo(currentIndex + 1)}
              disabled={!hasNext}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-colors ${
                hasNext
                  ? "text-white/70 hover:text-white hover:bg-white/10"
                  : "text-white/20 cursor-not-allowed"
              }`}
            >
              <span className="hidden sm:inline">{t("reader.next")}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
