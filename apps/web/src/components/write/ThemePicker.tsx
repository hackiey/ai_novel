import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type WriteTheme } from "../../contexts/WriteThemeContext.js";

interface ThemePickerProps {
  open: boolean;
  onClose: () => void;
  current: WriteTheme;
  onSelect: (theme: WriteTheme) => void;
}

const THEMES: { key: WriteTheme; gradient: string }[] = [
  { key: "rain", gradient: "linear-gradient(135deg, #0a0c12 0%, #1a2030 100%)" },
  { key: "starfield", gradient: "linear-gradient(135deg, #050510 0%, #151530 100%)" },
];

export default function ThemePicker({ open, onClose, current, onSelect }: ThemePickerProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const id = setTimeout(() => document.addEventListener("mousedown", handleClick), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, onClose]);

  return (
    <div
      ref={panelRef}
      className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 glass-panel-solid rounded-xl p-3 min-w-[220px]
        transition-all duration-200 ease-out origin-bottom
        ${open
          ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
          : "opacity-0 scale-95 translate-y-2 pointer-events-none"
        }`}
    >
      <div className="text-xs text-white/60 mb-2 text-center">{t("write.theme")}</div>
      <div className="flex gap-2 justify-center">
        {THEMES.map(({ key, gradient }) => (
          <button
            key={key}
            onClick={() => { onSelect(key); onClose(); }}
            className={`w-16 h-16 rounded-lg border-2 transition-all flex flex-col items-center justify-end pb-1 ${
              current === key ? "border-teal-400 scale-105" : "border-white/20 hover:border-white/40"
            }`}
            style={{ background: gradient }}
          >
            <span className="text-[10px] font-medium text-white/80">
              {t(`write.theme_${key}`)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
