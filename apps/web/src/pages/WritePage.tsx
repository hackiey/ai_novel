import { useState, useCallback, useEffect, useRef } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { FileEdit } from "lucide-react";
import { trpc } from "../lib/trpc.js";
import { NovelEditor } from "@ai-novel/editor";
import AgentChatPanel from "../components/AgentChatPanel.js";
import EditableText from "../components/EditableText.js";

export default function WritePage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const navigate = useNavigate();
  const { chapterId } = useSearch({ from: "/project/$projectId/write" });
  const [selectedChapterId, setSelectedChapterId] = useState<string>(chapterId ?? "");
  const [appendText, setAppendText] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("idle");

  // Local content cache: survives chapter switches while saves are in-flight
  const contentCache = useRef<Map<string, string>>(new Map());

  const projectQuery = trpc.project.getById.useQuery({ id: projectId });
  const chaptersQuery = trpc.chapter.list.useQuery({ projectId });
  const chapterQuery = trpc.chapter.getById.useQuery(
    { id: selectedChapterId },
    { enabled: !!selectedChapterId },
  );

  const updateChapter = trpc.chapter.update.useMutation({
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => {
      setSaveStatus("saved");
      chaptersQuery.refetch();
    },
    onError: () => setSaveStatus("idle"),
  });

  const updateProject = trpc.project.update.useMutation({
    onSuccess: () => projectQuery.refetch(),
  });

  const project = projectQuery.data;
  const chapters = (chaptersQuery.data ?? []) as any[];
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const chapter = chapterQuery.data as any;

  useEffect(() => {
    setSelectedChapterId(chapterId ?? "");
    setSaveStatus("idle");
  }, [chapterId]);

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

  return (
    <div className="h-[calc(100vh-53px)] flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center px-4 py-2 border-b border-gray-200 bg-white/60 backdrop-blur-sm shrink-0">
        <Link
          to={project?.worldId ? "/world/$worldId" : "/"}
          params={project?.worldId ? { worldId: project.worldId } : {}}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; Back
        </Link>
        <span className="text-gray-300 mx-3">|</span>
        {project ? (
          <EditableText
            value={project.name}
            onSave={(name) => updateProject.mutate({ id: projectId, data: { name } })}
            className="text-sm font-medium text-gray-700"
            inputClassName="text-sm font-medium text-gray-700"
          />
        ) : (
          <span className="text-sm text-gray-400">Loading...</span>
        )}
        {saveStatus === "saving" && (
          <span className="text-[10px] text-amber-500 ml-3">Saving...</span>
        )}
        {saveStatus === "saved" && (
          <span className="text-[10px] text-emerald-500 ml-3">Saved</span>
        )}
      </div>

      {/* Three-column layout: sidebar | editor | chat */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Chapter sidebar */}
        <div className="w-56 border-r border-gray-200 bg-gray-50/80 flex flex-col shrink-0">
          <div className="px-3 py-3 border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Chapters</span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {sorted.length === 0 ? (
              <div className="px-3 py-6 text-xs text-gray-400 text-center">
                No chapters yet.
              </div>
            ) : (
              sorted.map((ch) => (
                <button
                  key={ch._id}
                  onClick={() => handleChapterSelect(ch._id)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    selectedChapterId === ch._id
                      ? "bg-teal-50 text-teal-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <span className="text-xs text-gray-400 mr-1.5">{ch.order + 1}.</span>
                  <EditableText
                    value={ch.title}
                    onSave={(title) =>
                      updateChapter.mutate({ id: ch._id, data: { title } })
                    }
                    className={`truncate ${
                      selectedChapterId === ch._id ? "text-teal-700" : "text-gray-600"
                    }`}
                    inputClassName="text-sm w-full"
                  />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Center: Editor */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {selectedChapterId && chapter ? (
            <NovelEditor
              key={selectedChapterId}
              content={editorContent}
              onUpdate={handleContentUpdate}
              placeholder="Start writing your story..."
              appendText={appendText}
              className="flex-1 border-0 rounded-none"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md px-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <FileEdit className="w-8 h-8 text-gray-400" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Select a Chapter</h3>
                <p className="text-sm text-gray-400">
                  Choose a chapter from the left sidebar to start editing.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: AI Chat */}
        <div className="w-1/3 min-w-[320px] border-l border-gray-200 bg-gray-50/50">
          <AgentChatPanel
            projectId={projectId}
            worldId={(project as any)?.worldId}
            onAgentAppend={handleAgentAppend}
          />
        </div>
      </div>
    </div>
  );
}
