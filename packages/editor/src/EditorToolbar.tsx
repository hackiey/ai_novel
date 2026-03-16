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
} from "lucide-react";

interface EditorToolbarProps {
  editor: Editor | null;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
}: ToolbarButtonProps) {
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
            ? "bg-teal-50 text-teal-700"
            : "bg-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        }
      `}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div className="w-px h-6 bg-gray-200 mx-1" />;
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  if (!editor) {
    return null;
  }

  return (
    <div className="flex items-center gap-0.5 flex-wrap border-b border-gray-200 bg-gray-50 px-2 py-1.5 rounded-t-lg">
      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        title="Bold (Ctrl+B)"
      >
        <Bold className="w-4 h-4" strokeWidth={2.5} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        title="Italic (Ctrl+I)"
      >
        <Italic className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        disabled={!editor.can().chain().focus().toggleUnderline().run()}
        title="Underline (Ctrl+U)"
      >
        <Underline className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        disabled={!editor.can().chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <Strikethrough className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <Separator />

      {/* Headings */}
      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
        isActive={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        H1
      </ToolbarButton>

      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        isActive={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        H2
      </ToolbarButton>

      <ToolbarButton
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        isActive={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        H3
      </ToolbarButton>

      <Separator />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="Bullet List"
      >
        <List className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="Ordered List"
      >
        <ListOrdered className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <Separator />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        title="Blockquote"
      >
        <Quote className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <Minus className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <Separator />

      {/* Undo / Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().chain().focus().undo().run()}
        title="Undo (Ctrl+Z)"
      >
        <Undo className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().chain().focus().redo().run()}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo className="w-4 h-4" strokeWidth={2} />
      </ToolbarButton>
    </div>
  );
}
