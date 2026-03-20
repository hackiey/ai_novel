import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Upload, X, FileText, Check, Loader2 } from "lucide-react";
import { getToken } from "../lib/auth.js";
import { AgentEvent, AssistantMessageContent } from "./AgentMessageDisplay.js";

const API_BASE = "http://localhost:3001";

type Stage = "select" | "importing" | "done";

interface ImportEvent {
  type: string;
  chunkIndex?: number;
  totalChunks?: number;
  fileName?: string;
  event?: {
    type: string;
    text?: string;
    toolName?: string;
    toolInput?: unknown;
    result?: unknown;
    error?: string;
  };
  error?: string;
}

export default function FileImportDialog({
  worldId,
  onClose,
}: {
  worldId: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Stage>("select");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Import progress state
  const [totalChunks, setTotalChunks] = useState(0);
  const [currentChunk, setCurrentChunk] = useState(-1);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [chunkText, setChunkText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFile(files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const startImport = async () => {
    if (!file) return;

    setStage("importing");
    setChunkText("");
    setEvents([]);
    setErrorMsg("");

    const controller = new AbortController();
    abortRef.current = controller;

    const formData = new FormData();
    // Fields must be appended BEFORE the file for @fastify/multipart to parse them
    formData.append("worldId", worldId);
    formData.append("locale", i18n.language);
    formData.append("file", file);

    try {
      const token = getToken();
      const response = await fetch(`${API_BASE}/api/world/import-file`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errBody = await response.text();
        let msg = `HTTP ${response.status}`;
        try { msg = JSON.parse(errBody).error || msg; } catch {}
        setErrorMsg(msg);
        setStage("done");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;

          try {
            const evt: ImportEvent = JSON.parse(payload);
            processEvent(evt);
          } catch {
            // skip malformed events
          }
        }
      }

      setStage("done");
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setStage("done");
      } else {
        setErrorMsg(err?.message || String(err));
        setStage("done");
      }
    }
  };

  const processEvent = (evt: ImportEvent) => {
    switch (evt.type) {
      case "import_start":
        setTotalChunks(evt.totalChunks || 0);
        break;
      case "chunk_start":
        setCurrentChunk(evt.chunkIndex ?? 0);
        setChunkText("");
        setEvents([]);
        break;
      case "chunk_event":
        if (evt.event) {
          const e = evt.event;
          if (e.type === "text" && e.text) {
            setChunkText((prev) => prev + e.text);
            setEvents((prev) => [...prev, { type: "text", text: e.text }]);
            setTimeout(scrollToBottom, 0);
          } else if (e.type === "tool_use" && e.toolName) {
            setEvents((prev) => [...prev, { type: "tool_use", toolName: e.toolName, toolInput: e.toolInput }]);
            setTimeout(scrollToBottom, 0);
          } else if (e.type === "tool_result") {
            const result = typeof e.result === "string" ? e.result : JSON.stringify(e.result);
            setEvents((prev) => [...prev, { type: "tool_result", result }]);
            setTimeout(scrollToBottom, 0);
          }
        }
        break;
      case "chunk_done":
        break;
      case "chunk_error":
        setErrorMsg((prev) => prev + (prev ? "\n" : "") + `${t("import.chunkError", { index: (evt.chunkIndex ?? 0) + 1 })}: ${evt.error}`);
        break;
      case "import_done":
        break;
    }
  };

  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  };

  const handleClose = () => {
    handleCancel();
    // Invalidate queries to refresh data
    queryClient.invalidateQueries({ queryKey: [["character"]] });
    queryClient.invalidateQueries({ queryKey: [["worldSetting"]] });
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{t("import.title")}</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4" ref={scrollRef}>
          {stage === "select" && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  dragOver
                    ? "border-teal-400 bg-teal-50"
                    : file
                    ? "border-teal-300 bg-teal-50/50"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="w-8 h-8 text-teal-500" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                    </div>
                    <button
                      onClick={() => setFile(null)}
                      className="ml-2 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-600 mb-1">{t("import.dropHint")}</p>
                    <p className="text-xs text-gray-400">{t("import.supportedFormats")}</p>
                    <label className="mt-3 inline-block px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 cursor-pointer transition-colors">
                      {t("import.selectFile")}
                      <input
                        type="file"
                        accept=".txt,.md,.docx,.pdf"
                        onChange={(e) => handleFiles(e.target.files)}
                        className="hidden"
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          )}

          {stage === "importing" && (
            <div className="space-y-4">
              {/* Progress */}
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-600">
                    {t("import.processing", { current: currentChunk + 1, total: totalChunks })}
                  </span>
                  <span className="text-gray-400">
                    {totalChunks > 0 ? `${Math.round(((currentChunk + 1) / totalChunks) * 100)}%` : ""}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-teal-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: totalChunks > 0 ? `${((currentChunk + 1) / totalChunks) * 100}%` : "0%" }}
                  />
                </div>
              </div>

              {/* Agent output (tool calls and text interleaved) */}
              {events.length > 0 && (
                <div className="space-y-2">
                  <AssistantMessageContent events={events} content={chunkText} isStreaming={stage === "importing"} />
                </div>
              )}

              {errorMsg && (
                <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {stage === "done" && (
            <div className="text-center py-8">
              {errorMsg ? (
                <>
                  <div className="text-red-500 text-sm mb-4 bg-red-50 rounded-lg p-3 text-left whitespace-pre-wrap">
                    {errorMsg}
                  </div>
                  <p className="text-sm text-gray-500">{t("import.doneWithErrors")}</p>
                </>
              ) : (
                <>
                  <Check className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <p className="text-gray-900 font-medium">{t("import.done")}</p>
                  <p className="text-sm text-gray-500 mt-1">{t("import.doneHint")}</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          {stage === "select" && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={startImport}
                disabled={!file}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t("import.start")}
              </button>
            </>
          )}
          {stage === "importing" && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm text-red-600 hover:text-red-700 transition-colors"
            >
              {t("import.cancel")}
            </button>
          )}
          {stage === "done" && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors"
            >
              {t("import.close")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
