import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { getCompactionSettings, setCompactionSettings, clearCompactionSettings } from "../lib/compactionSettings.js";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CompactionSettingsDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  const [thresholdText, setThresholdText] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    if (!open) return;
    const settings = getCompactionSettings();
    setThresholdText(settings ? String(settings.threshold) : "");
    setSaveStatus("");
  }, [open]);

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

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const parsedThreshold = Number(thresholdText);
  const isValid = thresholdText.trim() === "" || (Number.isFinite(parsedThreshold) && parsedThreshold >= 10000);

  function handleSave() {
    if (!thresholdText.trim()) {
      clearCompactionSettings();
      setSaveStatus(t("chat.compactionSaved"));
      setTimeout(() => setSaveStatus(""), 2000);
      return;
    }
    if (!isValid) return;
    setCompactionSettings({ threshold: Math.floor(parsedThreshold) });
    setSaveStatus(t("chat.compactionSaved"));
    setTimeout(() => setSaveStatus(""), 2000);
  }

  function handleReset() {
    clearCompactionSettings();
    setThresholdText("");
    setSaveStatus(t("chat.compactionSaved"));
    setTimeout(() => setSaveStatus(""), 2000);
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 backdrop-blur-sm">
      <div className="min-h-full flex items-center justify-center p-4">
        <div ref={panelRef} className="glass-panel-solid rounded-2xl w-full max-w-sm mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-white text-sm font-medium">{t("chat.compactionSettings")}</h2>
            <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-white/60 font-medium">{t("chat.compactionThreshold")}</label>
              <input
                type="number"
                value={thresholdText}
                onChange={(e) => setThresholdText(e.target.value)}
                placeholder="150000"
                min={10000}
                step={10000}
                className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-xs text-white/80 placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                  isValid ? "border-white/10" : "border-red-500/50"
                }`}
              />
              <p className="text-[10px] text-white/25">{t("chat.compactionThresholdHint")}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between">
            <button
              onClick={handleReset}
              className="text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              {t("chat.compactionResetDefault")}
            </button>
            <div className="flex items-center gap-3">
              {saveStatus && <span className="text-[10px] text-teal-400">{saveStatus}</span>}
              <button
                onClick={handleSave}
                disabled={!isValid}
                className="px-4 py-1.5 bg-teal-500/20 text-teal-400 rounded-lg text-sm hover:bg-teal-500/30 disabled:opacity-50 transition-colors"
              >
                {t("chat.compactionSave")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
