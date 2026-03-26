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
} from "lucide-react";

export type EditorVariant = "default" | "immersive";

interface EditorToolbarProps {
  editor: Editor | null;
  onDelete?: () => void;
  deleteTitle?: string;
  variant?: EditorVariant;
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

export function EditorToolbar({ editor, onDelete, deleteTitle, variant = "default" }: EditorToolbarProps) {
  if (!editor) {
    return null;
  }

  const immersive = variant === "immersive";

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

      {onDelete && (
        <>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onDelete}
            title={deleteTitle ?? "Delete"}
            className={`px-2 py-1 rounded text-sm font-medium transition-colors ${immersive ? "text-white/50 hover:bg-white/10 hover:text-red-400" : "text-gray-400 hover:bg-red-50 hover:text-red-600"}`}
          >
            <Trash2 className="w-4 h-4" strokeWidth={2} />
          </button>
        </>
      )}
    </div>
  );
}
