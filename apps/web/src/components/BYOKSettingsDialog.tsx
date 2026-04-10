import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, Eye, EyeOff } from "lucide-react";
import { getBYOKConfig, setBYOKConfig, clearBYOKConfig, type BYOKConfig, type BYOKProvider } from "../lib/byokStorage.js";
import { trpc } from "../lib/trpc.js";

const PROVIDERS: { key: BYOKProvider; label: string; showBaseURL: boolean; defaultModels: string }[] = [
  { key: "openai", label: "OpenAI", showBaseURL: false, defaultModels: "gpt-4o" },
  { key: "anthropic", label: "Anthropic", showBaseURL: false, defaultModels: "claude-sonnet-4-6" },
  { key: "openrouter", label: "OpenRouter", showBaseURL: false, defaultModels: "anthropic/claude-sonnet-4.6" },
  { key: "custom", label: "OpenAI Compatible", showBaseURL: true, defaultModels: "" },
];

interface ModelCtxEntry {
  modelId: string;
  contextWindow: string;
  autoFilled: boolean;
  unknown: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function BYOKSettingsDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  const [provider, setProvider] = useState<BYOKProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [modelsText, setModelsText] = useState("");
  const [modelCtxEntries, setModelCtxEntries] = useState<ModelCtxEntry[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const utils = trpc.useUtils();

  // Load config on open
  useEffect(() => {
    if (!open) return;
    const config = getBYOKConfig();
    if (config) {
      setProvider(config.provider);
      setApiKey(config.apiKey);
      setBaseURL(config.baseURL ?? "");
      setModelsText(config.models.join(", "));
      // Initialize entries from stored contextWindows
      setModelCtxEntries(config.models.map((m) => ({
        modelId: m,
        contextWindow: config.contextWindows?.[m] ? String(config.contextWindows[m]) : "",
        autoFilled: false,
        unknown: false,
      })));
    } else {
      setProvider("openai");
      setApiKey("");
      setBaseURL("");
      setModelsText("");
      setModelCtxEntries([]);
    }
    setShowKey(false);
    setSaveStatus("");
  }, [open]);

  // Auto-lookup context windows when models text or provider changes
  const lookupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!open) return;
    clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(async () => {
      const models = modelsText.split(",").map((m) => m.trim()).filter(Boolean);
      if (models.length === 0) {
        setModelCtxEntries([]);
        return;
      }

      // Preserve manually edited values
      const prevMap = new Map(modelCtxEntries.filter((e) => !e.autoFilled).map((e) => [e.modelId, e.contextWindow]));

      const entries: ModelCtxEntry[] = await Promise.all(
        models.map(async (modelId) => {
          // If user manually set a value, keep it
          const manual = prevMap.get(modelId);
          if (manual) {
            return { modelId, contextWindow: manual, autoFilled: false, unknown: false };
          }

          const spec = `${provider}:${modelId}`;
          try {
            const info = await utils.agent.getModelInfo.fetch({ modelSpec: spec });
            if (info) {
              return { modelId, contextWindow: String(info.contextWindow), autoFilled: true, unknown: false };
            }
          } catch { /* ignore */ }
          return { modelId, contextWindow: "", autoFilled: false, unknown: true };
        }),
      );
      setModelCtxEntries(entries);
    }, 500);
    return () => clearTimeout(lookupTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider, modelsText]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const id = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => { clearTimeout(id); document.removeEventListener("mousedown", handleClick); };
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const currentProviderInfo = PROVIDERS.find((p) => p.key === provider)!;

  function handleProviderChange(key: BYOKProvider) {
    setProvider(key);
    const info = PROVIDERS.find((p) => p.key === key)!;
    const currentModels = modelsText.trim();
    const isDefaultFromOther = PROVIDERS.some((p) => p.key !== key && p.defaultModels && currentModels === p.defaultModels);
    if (!currentModels || isDefaultFromOther) {
      setModelsText(info.defaultModels);
    }
    if (key !== "custom") {
      setBaseURL("");
    }
  }

  function handleCtxWindowChange(modelId: string, value: string) {
    setModelCtxEntries((prev) =>
      prev.map((e) => e.modelId === modelId ? { ...e, contextWindow: value, autoFilled: false, unknown: false } : e),
    );
  }

  function handleSave() {
    const models = modelsText.split(",").map((m) => m.trim()).filter(Boolean);
    if (!apiKey.trim() || models.length === 0) return;

    const contextWindows: Record<string, number> = {};
    for (const entry of modelCtxEntries) {
      const val = Number(entry.contextWindow);
      if (Number.isFinite(val) && val > 0) {
        contextWindows[entry.modelId] = Math.floor(val);
      }
    }

    const config: BYOKConfig = {
      provider,
      apiKey: apiKey.trim(),
      models,
      ...(Object.keys(contextWindows).length > 0 ? { contextWindows } : {}),
    };
    if (provider === "custom" && baseURL.trim()) {
      config.baseURL = baseURL.trim();
    }
    setBYOKConfig(config);
    setSaveStatus(t("byok.saved"));
    setTimeout(() => setSaveStatus(""), 2000);
  }

  function handleClear() {
    clearBYOKConfig();
    setApiKey("");
    setBaseURL("");
    setModelsText("");
    setModelCtxEntries([]);
    setSaveStatus(t("byok.cleared"));
    setTimeout(() => setSaveStatus(""), 2000);
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 backdrop-blur-sm">
      <div className="min-h-full flex items-center justify-center p-4">
        <div ref={panelRef} className="glass-panel-solid rounded-2xl w-full max-w-md mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-white text-sm font-medium">{t("byok.title")}</h2>
            <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Security notice */}
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <span className="text-amber-400/70 text-xs leading-relaxed">{t("byok.securityNotice")}</span>
            </div>

            {/* Provider selector */}
            <div className="space-y-1.5">
              <label className="text-xs text-white/60 font-medium">{t("byok.provider")}</label>
              <div className="flex gap-1.5">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => handleProviderChange(p.key)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      provider === p.key
                        ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                        : "bg-white/5 text-white/50 border border-white/10 hover:border-white/20"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-xs text-white/60 font-medium">{t("byok.apiKey")}</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t("byok.apiKeyPlaceholder")}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-teal-500 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Base URL (only for custom) */}
            {currentProviderInfo.showBaseURL && (
              <div className="space-y-1.5">
                <label className="text-xs text-white/60 font-medium">{t("byok.baseURL")}</label>
                <input
                  type="text"
                  value={baseURL}
                  onChange={(e) => setBaseURL(e.target.value)}
                  placeholder={t("byok.baseURLPlaceholder")}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            )}

            {/* Models */}
            <div className="space-y-1.5">
              <label className="text-xs text-white/60 font-medium">{t("byok.models")}</label>
              <input
                type="text"
                value={modelsText}
                onChange={(e) => setModelsText(e.target.value)}
                placeholder={t("byok.modelsPlaceholder")}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <p className="text-[10px] text-white/25">{t("byok.modelsHint")}</p>
            </div>

            {/* Per-model context windows */}
            {modelCtxEntries.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs text-white/60 font-medium">{t("byok.contextWindow")}</label>
                <div className="space-y-1.5">
                  {modelCtxEntries.map((entry) => (
                    <div key={entry.modelId} className="flex items-center gap-2">
                      <span className="text-[11px] text-white/50 truncate min-w-0 flex-1" title={entry.modelId}>
                        {entry.modelId}
                      </span>
                      <input
                        type="number"
                        value={entry.contextWindow}
                        onChange={(e) => handleCtxWindowChange(entry.modelId, e.target.value)}
                        placeholder="128000"
                        min={1000}
                        step={1000}
                        className={`w-28 bg-white/5 border rounded-md px-2 py-1 text-xs text-white/80 placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                          entry.autoFilled ? "border-teal-500/30" : entry.unknown ? "border-amber-500/30" : "border-white/10"
                        }`}
                      />
                    </div>
                  ))}
                </div>
                {modelCtxEntries.some((e) => e.unknown) && (
                  <p className="text-[10px] text-amber-400/70">{t("byok.contextWindowUnknown")}</p>
                )}
                {modelCtxEntries.some((e) => e.autoFilled) && !modelCtxEntries.some((e) => e.unknown) && (
                  <p className="text-[10px] text-white/25">{t("byok.contextWindowAutoFilled")}</p>
                )}
                <p className="text-[10px] text-white/25">{t("byok.contextWindowHint")}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between">
            <button
              onClick={handleClear}
              className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
            >
              {t("byok.clear")}
            </button>
            <div className="flex items-center gap-3">
              {saveStatus && <span className="text-[10px] text-teal-400">{saveStatus}</span>}
              <button
                onClick={handleSave}
                disabled={!apiKey.trim() || !modelsText.trim()}
                className="px-4 py-1.5 bg-teal-500/20 text-teal-400 rounded-lg text-sm hover:bg-teal-500/30 disabled:opacity-50 transition-colors"
              >
                {t("byok.save")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
