import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import AgentChatPanel from "../AgentChatPanel.js";

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  worldId?: string;
  currentChapterId?: string;
  onChapterEdit: (chapterId: string) => Promise<void>;
}

export default function ChatDrawer({
  open,
  onClose,
  projectId,
  worldId,
  currentChapterId,
  onChapterEdit,
}: ChatDrawerProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 transition-opacity z-40 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[420px] z-50 glass-panel border-l border-white/10 flex flex-col transform transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
          <span className="text-sm font-semibold text-white/80">{t("chat.aiAssistant")}</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          <AgentChatPanel
            projectId={projectId}
            worldId={worldId}
            currentChapterId={currentChapterId}
            onChapterEdit={onChapterEdit}
          />
        </div>
      </div>
    </>
  );
}
