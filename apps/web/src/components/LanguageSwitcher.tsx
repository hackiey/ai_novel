import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const isZh = i18n.language?.startsWith("zh");

  function toggle() {
    i18n.changeLanguage(isZh ? "en" : "zh-CN");
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-gray-500 hover:text-teal-600 hover:bg-gray-100 transition-colors cursor-pointer"
      title={isZh ? "Switch to English" : "切换到中文"}
    >
      <Languages className="w-3.5 h-3.5" />
      <span>{isZh ? "EN" : "中"}</span>
    </button>
  );
}
