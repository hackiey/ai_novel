import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Upload, X, FileText, Check, Loader2, AlertCircle } from "lucide-react";
import { trpc } from "../lib/trpc.js";

type Stage = "select" | "preview" | "importing" | "done";

interface PreviewInfo {
  version: number;
  exportedAt: string;
  worldId?: string;
  worldName?: string;
  characters: number;
  worldSettings: number;
  drafts: number;
  projects: number;
  chapters: number;
  hasMemory: boolean;
}

function extractPreview(data: any): PreviewInfo | null {
  if (!data || typeof data !== "object" || !data.version || data.type !== "world") return null;
  const d = data.data;
  if (!d?.world) return null;
  let totalChapters = 0;
  for (const p of d.projects ?? []) {
    totalChapters += (p.chapters ?? []).length;
  }
  const hasWorldMemory = (d.agentMemory ?? []).some((m: any) => m.content);
  const hasProjectMemory = (d.projects ?? []).some((p: any) =>
    (p.agentMemory ?? []).some((m: any) => m.content),
  );
  return {
    version: data.version,
    exportedAt: data.exportedAt,
    worldId: d.world._id,
    worldName: d.world.name,
    characters: (d.characters ?? []).length,
    worldSettings: (d.worldSettings ?? []).length,
    drafts: (d.drafts ?? []).length,
    projects: (d.projects ?? []).length,
    chapters: totalChapters,
    hasMemory: hasWorldMemory || hasProjectMemory,
  };
}

export default function DataImportDialog({
  onClose,
  onSuccess,
  currentWorldId,
}: {
  onClose: () => void;
  onSuccess?: (importedWorldId?: string) => void;
  currentWorldId?: string;
}) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>("select");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [preview, setPreview] = useState<PreviewInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [merged, setMerged] = useState(false);
  const [overwriteMemory, setOverwriteMemory] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const importWorldMut = trpc.exportImport.importWorld.useMutation({
    onSuccess: (result) => {
      setMerged(result.merged);
      setStage("done");
      onSuccess?.(result.worldId);
    },
    onError: (err) => {
      setErrorMsg(err.message);
      setStage("done");
    },
  });

  const isImporting = importWorldMut.isPending;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        if (!isImporting) onClose();
      }
    }
    const id = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handleClick); };
  }, [onClose, isImporting]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isImporting) onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, isImporting]);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith(".aicreator.json") && !f.name.endsWith(".json")) {
      setErrorMsg(t("dataImport.invalidFormat"));
      return;
    }
    setFile(f);
    setErrorMsg("");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const info = extractPreview(json);
        if (!info) {
          setErrorMsg(t("dataImport.invalidFormat"));
          return;
        }
        if (info.version !== 1) {
          setErrorMsg(t("dataImport.unsupportedVersion"));
          return;
        }
        setParsedData(json);
        setPreview(info);
        setStage("preview");
      } catch {
        setErrorMsg(t("dataImport.invalidFormat"));
      }
    };
    reader.readAsText(f);
  }, [t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleImport = () => {
    if (!parsedData) return;
    setStage("importing");
    setErrorMsg("");
    importWorldMut.mutate({ data: parsedData, overwriteMemory });
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div ref={panelRef} className="glass-panel-solid rounded-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white/90">{t("dataImport.title")}</h2>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="p-1 rounded text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto scrollbar-none">
          {/* Stage: select */}
          {stage === "select" && (
            <div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
                  dragOver ? "border-teal-400/50 bg-teal-400/5" : "border-white/20 hover:border-white/30"
                }`}
              >
                {file ? (
                  <>
                    <FileText className="w-8 h-8 text-teal-400/60" />
                    <div className="text-sm text-white/80">{file.name}</div>
                    <div className="text-xs text-white/40">
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-white/30" />
                    <div className="text-sm text-white/50">{t("dataImport.dropHint")}</div>
                    <div className="text-xs text-white/30">{t("dataImport.supportedFormats")}</div>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".json,.aicreator.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>

              {errorMsg && (
                <div className="mt-3 flex items-center gap-2 text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {errorMsg}
                </div>
              )}
            </div>
          )}

          {/* Stage: preview */}
          {stage === "preview" && preview && (
            <div className="space-y-3">
              <div className="rounded-lg bg-white/5 p-4 space-y-2">
                {preview.worldName && (
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">{t("dataImport.worldName")}</span>
                    <span className="text-white/80">{preview.worldName}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-white/50">{t("dataImport.exportedAt")}</span>
                  <span className="text-white/80">{formatDate(preview.exportedAt)}</span>
                </div>
              </div>

              {/* Entity counts */}
              <div className="rounded-lg bg-white/5 p-4 space-y-1.5">
                {preview.characters > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">{t("dataImport.characters")}</span>
                    <span className="text-white/80">{preview.characters}</span>
                  </div>
                )}
                {preview.worldSettings > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">{t("dataImport.worldSettings")}</span>
                    <span className="text-white/80">{preview.worldSettings}</span>
                  </div>
                )}
                {preview.drafts > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">{t("dataImport.drafts")}</span>
                    <span className="text-white/80">{preview.drafts}</span>
                  </div>
                )}
                {preview.projects > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">{t("dataImport.projects")}</span>
                    <span className="text-white/80">{preview.projects}</span>
                  </div>
                )}
                {preview.chapters > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">{t("dataImport.chapters")}</span>
                    <span className="text-white/80">{preview.chapters}</span>
                  </div>
                )}
              </div>

              {/* Memory overwrite option */}
              {preview.hasMemory && (
                <label className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overwriteMemory}
                    onChange={(e) => setOverwriteMemory(e.target.checked)}
                    className="mt-0.5 accent-amber-400"
                  />
                  <div>
                    <div className="text-xs text-amber-300/90 font-medium">{t("dataImport.overwriteMemory")}</div>
                    <div className="text-xs text-white/40 mt-0.5">{t("dataImport.overwriteMemoryHint")}</div>
                  </div>
                </label>
              )}

              {/* Warning: world ID mismatch */}
              {currentWorldId && preview.worldId && preview.worldId !== currentWorldId && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-300/90">
                    {t("dataImport.worldMismatchWarning")}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stage: importing */}
          {stage === "importing" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
              <div className="text-sm text-white/60">{t("dataImport.importing")}</div>
            </div>
          )}

          {/* Stage: done */}
          {stage === "done" && (
            <div className="flex flex-col items-center gap-3 py-8">
              {errorMsg ? (
                <>
                  <AlertCircle className="w-8 h-8 text-red-400" />
                  <div className="text-sm text-red-400">{t("dataImport.error")}</div>
                  <div className="text-xs text-white/40 text-center max-w-xs">{errorMsg}</div>
                </>
              ) : (
                <>
                  <Check className="w-8 h-8 text-teal-400" />
                  <div className="text-sm text-white/80">{t("dataImport.done")}</div>
                  <div className="text-xs text-white/40">
                    {merged ? t("dataImport.mergedHint") : t("dataImport.doneHint")}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 pb-4 pt-2 border-t border-white/10">
          {stage === "preview" && (
            <>
              <button
                onClick={() => { setStage("select"); setFile(null); setParsedData(null); setPreview(null); setErrorMsg(""); }}
                className="px-4 py-2 text-xs text-white/50 hover:text-white/70 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleImport}
                className="px-4 py-2 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors font-medium"
              >
                {t("dataImport.startImport")}
              </button>
            </>
          )}
          {stage === "done" && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded-lg transition-colors"
            >
              {t("dataImport.close")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
