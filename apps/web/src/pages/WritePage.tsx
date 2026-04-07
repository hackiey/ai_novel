import { useState, useCallback, useEffect, useRef } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { FileEdit, Check, X } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import { CreatorEditor } from "@ai-creator/editor";
import AgentChatPanel from "../components/AgentChatPanel.js";
import DiffViewer from "../components/DiffViewer.js";
import { useBreadcrumb } from "../contexts/BreadcrumbContext.js";
import { useWriteTheme } from "../contexts/WriteThemeContext.js";
import FloatingControls from "../components/write/FloatingControls.js";
import ShareDialog from "../components/write/ShareDialog.js";

export default function WritePage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { chapterId } = useSearch({ from: "/project/$projectId/write" });
  const [selectedChapterId, setSelectedChapterId] = useState<string>(chapterId ?? "");
  const [appendText, setAppendText] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [pendingEdit, setPendingEdit] = useState<{ oldContent: string; newContent: string } | null>(null);
  const queryClient = useQueryClient();
  const trpcUtils = trpc.useUtils();

  // Theme & font
  const { theme, setTheme, font, setFont } = useWriteTheme();

  // Chat drawer state — open by default
  const [chatDrawerOpen, setChatDrawerOpen] = useState(true);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // Word/char stats for floating controls
  const [statCount, setStatCount] = useState(0);
  const [statIsCjk, setStatIsCjk] = useState(false);
  const handleStatsChange = useCallback((count: number, isCjk: boolean) => {
    setStatCount(count);
    setStatIsCjk(isCjk);
  }, []);

  // Local content cache: survives chapter switches while saves are in-flight
  const contentCache = useRef<Map<string, string>>(new Map());

  const projectQuery = trpc.project.getById.useQuery({ id: projectId });
  const project = projectQuery.data as any;
  const worldQuery = trpc.world.getById.useQuery(
    { id: project?.worldId },
    { enabled: !!project?.worldId },
  );
  const world = worldQuery.data as any;
  const chaptersQuery = trpc.chapter.list.useQuery({ projectId });
  const chapterQuery = trpc.chapter.getById.useQuery(
    { id: selectedChapterId },
    { enabled: !!selectedChapterId },
  );

  const updateChapter = trpc.chapter.update.useMutation({
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => {
      setSaveStatus("saved");
      setSavedAt(new Date());
      chaptersQuery.refetch();
    },
    onError: () => setSaveStatus("idle"),
  });

  const createChapter = trpc.chapter.create.useMutation({
    onSuccess: (newChapter: any) => {
      chaptersQuery.refetch();
      handleChapterSelect(newChapter._id);
    },
  });

  const deleteChapter = trpc.chapter.delete.useMutation({
    onSuccess: () => {
      contentCache.current.delete(selectedChapterId);
      setSelectedChapterId("");
      chaptersQuery.refetch();
      void navigate({
        to: "/project/$projectId/write",
        params: { projectId },
        search: { chapterId: undefined },
        replace: true,
      });
    },
  });

  const chapters = (chaptersQuery.data ?? []) as any[];
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const chapter = chapterQuery.data as any;

  useEffect(() => {
    setSelectedChapterId(chapterId ?? "");
    setSaveStatus("idle");
  }, [chapterId]);

  // Auto-select the latest chapter when no chapterId in URL
  useEffect(() => {
    if (!chapterId && sorted.length > 0 && !selectedChapterId) {
      const latest = sorted[sorted.length - 1];
      setSelectedChapterId(latest._id);
      void navigate({
        to: "/project/$projectId/write",
        params: { projectId },
        search: { chapterId: latest._id },
        replace: true,
      });
    }
  }, [chapterId, sorted.length, selectedChapterId, navigate, projectId]);

  // Sync cache with server: once server data matches cached content, clear the cache entry
  const serverContent = chapter?.content ?? "";
  const cachedContent = selectedChapterId ? contentCache.current.get(selectedChapterId) : undefined;
  if (cachedContent !== undefined && cachedContent === serverContent) {
    contentCache.current.delete(selectedChapterId);
  }

  // Use cached content if available (it's always fresher than server data during saves)
  const editorContent = selectedChapterId
    ? contentCache.current.get(selectedChapterId) ?? serverContent
    : "";

  const handleContentUpdate = useCallback(
    (html: string) => {
      if (!selectedChapterId) return;
      contentCache.current.set(selectedChapterId, html);
      updateChapter.mutate({ id: selectedChapterId, data: { content: html } });
    },
    [selectedChapterId, updateChapter],
  );

  const handleAgentAppend = useCallback((text: string) => {
    setAppendText(text);
  }, []);

  const handleChapterEdit = useCallback(async (chapterId: string) => {
    if (chapterId !== selectedChapterId) {
      queryClient.invalidateQueries({ queryKey: [["chapter"]] });
      return;
    }
    const oldContent = contentCache.current.get(selectedChapterId) ?? serverContent;
    try {
      const fresh = await trpcUtils.chapter.getById.fetch({ id: chapterId }, { staleTime: 0 }) as any;
      const newContent = fresh?.content ?? "";
      if (newContent !== oldContent) {
        setPendingEdit({ oldContent, newContent });
      } else {
        queryClient.invalidateQueries({ queryKey: [["chapter"]] });
      }
    } catch {
      queryClient.invalidateQueries({ queryKey: [["chapter"]] });
    }
  }, [selectedChapterId, serverContent, queryClient]);

  const handleAcceptEdit = useCallback(() => {
    if (!pendingEdit || !selectedChapterId) return;
    contentCache.current.set(selectedChapterId, pendingEdit.newContent);
    setPendingEdit(null);
    queryClient.invalidateQueries({ queryKey: [["chapter"]] });
  }, [pendingEdit, selectedChapterId, queryClient]);

  const handleCancelEdit = useCallback(() => {
    if (!pendingEdit || !selectedChapterId) return;
    updateChapter.mutate({ id: selectedChapterId, data: { content: pendingEdit.oldContent } });
    contentCache.current.set(selectedChapterId, pendingEdit.oldContent);
    setPendingEdit(null);
    queryClient.invalidateQueries({ queryKey: [["chapter"]] });
  }, [pendingEdit, selectedChapterId, updateChapter, queryClient]);

  const handleDeleteChapter = useCallback(() => {
    if (!selectedChapterId || !chapter) return;
    if (!window.confirm(t("write.deleteChapterConfirm", { name: chapter.title }))) return;
    deleteChapter.mutate({ id: selectedChapterId });
  }, [selectedChapterId, chapter, deleteChapter, t]);

  const handleDeleteChapterById = useCallback((id: string) => {
    const ch = sorted.find((c) => c._id === id);
    if (!ch) return;
    if (!window.confirm(t("write.deleteChapterConfirm", { name: ch.title }))) return;
    if (id === selectedChapterId) {
      deleteChapter.mutate({ id });
    } else {
      deleteChapter.mutate({ id }, {
        onSuccess: () => {
          chaptersQuery.refetch();
        },
      });
    }
  }, [sorted, selectedChapterId, deleteChapter, chaptersQuery, t]);

  const handleChapterSelect = useCallback((nextChapterId: string) => {
    setSelectedChapterId(nextChapterId);
    setSaveStatus("idle");
    void navigate({
      to: "/project/$projectId/write",
      params: { projectId },
      search: { chapterId: nextChapterId },
      replace: true,
    });
  }, [navigate, projectId]);

  // Hide global header — WritePage has its own top bar
  const { setBreadcrumb, setImmersive } = useBreadcrumb();
  useEffect(() => {
    setImmersive(true);
    setBreadcrumb(null);
    return () => {
      setBreadcrumb(null);
      setImmersive(false);
    };
  }, [setBreadcrumb, setImmersive]);

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      {/* Top bar: breadcrumb + save status */}
      <div className="fixed top-0 left-0 right-0 z-20 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Link
            to="/"
            className="text-white/60 hover:text-white transition-colors font-bold shrink-0"
          >
            AI Creator
          </Link>
          <span className="text-white/30 shrink-0">/</span>
          {project?.worldId && (
            <>
              <Link
                to="/world/$worldId"
                params={{ worldId: project.worldId }}
                className="text-white/50 hover:text-white transition-colors truncate"
              >
                {world?.name ?? "..."}
              </Link>
              <span className="text-white/30 shrink-0">/</span>
            </>
          )}
          <span className="font-medium text-white/80 truncate">
            {project?.name ?? "..."}
          </span>
          {saveStatus === "saving" && (
            <span className="text-[10px] text-amber-400/80 ml-2">{t("write.saving")}</span>
          )}
          {saveStatus === "saved" && (
            <span className="text-[10px] text-emerald-400/80 ml-2">
              {t("write.saved")}{savedAt && ` ${savedAt.toLocaleTimeString()}`}
            </span>
          )}
        </div>
      </div>

      {/* Center: Editor + Chat side by side */}
      <div className="absolute inset-0 flex items-center justify-center z-10 pt-12 pb-20 px-4">
        <div
          className="h-full flex gap-3 transition-all duration-300 ease-in-out"
          style={{ width: "100%", maxWidth: chatDrawerOpen ? "90rem" : "56rem" }}
        >
          {/* Editor */}
          <div className="flex-1 min-w-0 flex flex-col">
            {selectedChapterId && chapter ? (
              pendingEdit ? (
                <div className="glass-panel rounded-xl flex flex-col flex-1 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
                    <span className="text-sm font-medium text-amber-300">{t("write.reviewTitle")}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCancelEdit}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-white/70 bg-white/10 hover:bg-white/20 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        {t("write.cancel")}
                      </button>
                      <button
                        onClick={handleAcceptEdit}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-white/80 bg-white/10 border border-white/15 hover:bg-white/20 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {t("write.accept")}
                      </button>
                    </div>
                  </div>
                  <DiffViewer oldContent={pendingEdit.oldContent} newContent={pendingEdit.newContent} />
                </div>
              ) : (
                <CreatorEditor
                  key={selectedChapterId}
                  content={editorContent}
                  onUpdate={handleContentUpdate}
                  placeholder={t("write.editorPlaceholder")}
                  appendText={appendText}
                  className="flex-1"
                  onDelete={handleDeleteChapter}
                  deleteTitle={t("write.deleteChapter")}
                  variant="immersive"
                  fontClass={font !== "default" ? `tiptap-font-${font}` : undefined}
                  font={font}
                  onFontChange={setFont}
                  onStatsChange={handleStatsChange}
                />
              )
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-md px-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/10 flex items-center justify-center">
                    <FileEdit className="w-8 h-8 text-white/40" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-lg font-semibold text-white/70 mb-2">{t("write.selectChapter")}</h3>
                  <p className="text-sm text-white/40">
                    {t("write.selectChapterText")}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Chat — inline, animated width */}
          <div
            className="shrink-0 flex flex-col overflow-hidden glass-panel rounded-xl transition-all duration-300 ease-in-out"
            style={{
              width: chatDrawerOpen ? "420px" : "0px",
              opacity: chatDrawerOpen ? 1 : 0,
              borderWidth: chatDrawerOpen ? undefined : 0,
            }}
          >
            {chatDrawerOpen && (
              <AgentChatPanel
                projectId={projectId}
                worldId={(project as any)?.worldId}
                currentChapterId={selectedChapterId || undefined}
                onAgentAppend={handleAgentAppend}
                onChapterEdit={handleChapterEdit}
                variant="immersive"
              />
            )}
          </div>
        </div>
      </div>

      {/* Floating Controls (includes chapter popover) */}
      <FloatingControls
        onOpenChat={() => setChatDrawerOpen(!chatDrawerOpen)}
        theme={theme}
        onThemeChange={setTheme}
        statCount={statCount}
        statIsCjk={statIsCjk}
        chapters={sorted}
        selectedChapterId={selectedChapterId}
        onChapterSelect={handleChapterSelect}
        onChapterCreate={() => createChapter.mutate({ projectId, title: t("write.newChapter") })}
        onChapterRename={(id, title) => updateChapter.mutate({ id, data: { title } })}
        onChapterDelete={handleDeleteChapterById}
        chapterCreating={createChapter.isPending}
        chatOpen={chatDrawerOpen}
        onShare={() => setShareDialogOpen(true)}
      />

      <ShareDialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        projectId={projectId}
      />
    </div>
  );
}
