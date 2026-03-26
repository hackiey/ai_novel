import { useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  Trash2,
  ChevronDown,
} from "lucide-react";

export type EditorVariant = "default" | "immersive";
export type EditorFont = "default" | "longcang" | "liujianmaocao" | "zhimangxing" | "mashanzheng" | "zcoolkuaile" | "zcoolqingkehuangyou" | "zcoolxiaowei" | "xiaolai" | "neoxihei" | "markergothic";

interface EditorToolbarProps {
  editor: Editor | null;
  onDelete?: () => void;
  deleteTitle?: string;
  variant?: EditorVariant;
  font?: EditorFont;
  onFontChange?: (font: EditorFont) => void;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

interface ToolbarButtonInternalProps extends ToolbarButtonProps {
  variant?: EditorVariant;
}

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
  variant = "default",
}: ToolbarButtonInternalProps) {
  const immersive = variant === "immersive";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        px-2 py-1 rounded text-sm font-medium transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        ${
          isActive
            ? immersive ? "bg-white/20 text-white" : "bg-teal-50 text-teal-700"
            : immersive
              ? "bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
              : "bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        }
      `}
    >
      {children}
    </button>
  );
}

function Separator({ variant = "default" }: { variant?: EditorVariant }) {
  return <div className={`w-px h-6 mx-1 ${variant === "immersive" ? "bg-white/20" : "bg-gray-200"}`} />;
}

const FONT_OPTIONS: { key: EditorFont; label: string; family: string }[] = [
  { key: "default", label: "楷体", family: '"LXGW WenKai", serif' },
  { key: "longcang", label: "龙藏", family: '"Long Cang", cursive' },
  { key: "liujianmaocao", label: "毛草", family: '"Liu Jian Mao Cao", cursive' },
  { key: "zhimangxing", label: "芒行", family: '"Zhi Mang Xing", cursive' },
  { key: "mashanzheng", label: "马善", family: '"Ma Shan Zheng", cursive' },
  { key: "zcoolkuaile", label: "快乐", family: '"ZCOOL KuaiLe", cursive' },
  { key: "zcoolqingkehuangyou", label: "黄油", family: '"ZCOOL QingKe HuangYou", cursive' },
  { key: "zcoolxiaowei", label: "小薇", family: '"ZCOOL XiaoWei", serif' },
  { key: "xiaolai", label: "小赖", family: '"Xiaolai SC", serif' },
  { key: "neoxihei", label: "晰黑", family: '"LXGW Neo XiHei", sans-serif' },
  { key: "markergothic", label: "漫黑", family: '"LXGW Marker Gothic", sans-serif' },
];

export function EditorToolbar({ editor, onDelete, deleteTitle, variant = "default", font, onFontChange }: EditorToolbarProps) {
  const [fontMenuOpen, setFontMenuOpen] = useState(false);

  if (!editor) {
    return null;
  }

  const immersive = variant === "immersive";
  const currentFont = FONT_OPTIONS.find((f) => f.key === font) ?? FONT_OPTIONS[0];

  return (
    <div className={`flex items-center gap-0.5 flex-wrap px-2 py-1.5 rounded-t-lg ${immersive ? "border-b border-white/10 bg-white/5" : "border-b border-gray-200 bg-gray-50"}`}>
      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        title="Bold (Ctrl+B)"
        variant={variant}
      >
        <Bold className="w-4 h-4" strokeWidth={2.5} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        title="Italic (Ctrl+I)"
        variant={variant}
      >
        <Italic className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        disabled={!editor.can().chain().focus().toggleUnderline().run()}
        title="Underline (Ctrl+U)"
        variant={variant}
      >
        <Underline className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        disabled={!editor.can().chain().focus().toggleStrike().run()}
        title="Strikethrough"
        variant={variant}
      >
        <Strikethrough className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <Separator variant={variant} />

      {/* Headings */}
      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
        isActive={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
        variant={variant}
      >
        H1
      </ToolbarButton>

      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        isActive={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
        variant={variant}
      >
        H2
      </ToolbarButton>

      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        isActive={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
        variant={variant}
      >
        H3
      </ToolbarButton>

      <Separator variant={variant} />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="Bullet List"
        variant={variant}
      >
        <List className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="Ordered List"
        variant={variant}
      >
        <ListOrdered className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <Separator variant={variant} />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        title="Blockquote"
        variant={variant}
      >
        <Quote className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
        variant={variant}
      >
        <Minus className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <Separator variant={variant} />

      {/* Undo / Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().chain().focus().undo().run()}
        title="Undo (Ctrl+Z)"
        variant={variant}
      >
        <Undo className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().chain().focus().redo().run()}
        title="Redo (Ctrl+Shift+Z)"
        variant={variant}
      >
        <Redo className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <div className="flex-1" />

      {/* Font selector */}
      {onFontChange && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setFontMenuOpen(!fontMenuOpen)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${immersive ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"}`}
            style={{ fontFamily: currentFont.family }}
          >
            {currentFont.label}
            <ChevronDown className={`w-3 h-3 transition-transform ${fontMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {fontMenuOpen && (
            <div className={`absolute right-0 top-full mt-1 rounded-lg py-1 shadow-xl z-50 min-w-[100px] ${immersive ? "glass-panel-solid" : "bg-white border border-gray-200"}`}>
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => { onFontChange(f.key); setFontMenuOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                    font === f.key
                      ? immersive ? "text-white bg-white/15" : "text-teal-700 bg-teal-50"
                      : immersive ? "text-white/70 hover:text-white hover:bg-white/10" : "text-gray-600 hover:bg-gray-100"
                  }`}
                  style={{ fontFamily: f.family }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          title={deleteTitle ?? "Delete"}
          className={`px-2 py-1 rounded text-sm font-medium transition-colors ${immersive ? "text-white/50 hover:bg-white/10 hover:text-red-400" : "text-gray-400 hover:bg-red-50 hover:text-red-600"}`}
        >
          <Trash2 className="w-4 h-4" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
