import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, Eye, EyeOff } from "lucide-react";
import { getBYOKConfig, setBYOKConfig, clearBYOKConfig, type BYOKConfig, type BYOKProvider } from "../lib/byokStorage.js";

const PROVIDERS: { key: BYOKProvider; label: string; showBaseURL: boolean; defaultModels: string }[] = [
  { key: "openai", label: "OpenAI", showBaseURL: false, defaultModels: "gpt-4o" },
  { key: "anthropic", label: "Anthropic", showBaseURL: false, defaultModels: "claude-sonnet-4-6" },
  { key: "openrouter", label: "OpenRouter", showBaseURL: false, defaultModels: "anthropic/claude-sonnet-4.6" },
  { key: "custom", label: "OpenAI Compatible", showBaseURL: true, defaultModels: "" },
];

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
  const [showKey, setShowKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  // Load config on open
  useEffect(() => {
    if (!open) return;
    const config = getBYOKConfig();
    if (config) {
      setProvider(config.provider);
      setApiKey(config.apiKey);
      setBaseURL(config.baseURL ?? "");
      setModelsText(config.models.join(", "));
    } else {
      setProvider("openai");
      setApiKey("");
      setBaseURL("");
      setModelsText("");
    }
    setShowKey(false);
    setSaveStatus("");
  }, [open]);

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
    // Pre-fill default models when switching provider (only if models field is empty or has defaults from another provider)
    const currentModels = modelsText.trim();
    const isDefaultFromOther = PROVIDERS.some((p) => p.key !== key && p.defaultModels && currentModels === p.defaultModels);
    if (!currentModels || isDefaultFromOther) {
      setModelsText(info.defaultModels);
    }
    if (key !== "custom") {
      setBaseURL("");
    }
  }

  function handleSave() {
    const models = modelsText.split(",").map((m) => m.trim()).filter(Boolean);
    if (!apiKey.trim() || models.length === 0) return;

    const config: BYOKConfig = {
      provider,
      apiKey: apiKey.trim(),
      models,
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
