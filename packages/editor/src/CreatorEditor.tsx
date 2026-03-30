import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Underline from "@tiptap/extension-underline";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { marked } from "marked";
import { EditorToolbar, type EditorVariant, type EditorFont } from "./EditorToolbar";

// Configure marked for synchronous rendering, no extra wrappers
marked.use({
  async: false,
  gfm: true,
  breaks: true, // Convert single \n to <br>
});

const markdownPattern = /^(?:\s{0,3}(?:[-*+]\s+|\d+\.\s+|>\s+|#{1,6}\s+|```|~~~)|\|.+\||(?:-{3,}|_{3,}|\*{3,})\s*$)|(?:\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\))/m;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapPlainTextParagraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

function looksLikeMarkdown(text: string): boolean {
  return markdownPattern.test(text);
}

/**
 * Detect whether content is already well-structured HTML (multiple block elements).
 * If so, return as-is. Otherwise, treat as plain text or markdown and convert to HTML.
 */
function normalizeContent(content: string): string {
  if (!content || !content.trim()) return "";

  // Count existing block-level HTML elements
  const blockTags = content.match(/<(?:p|h[1-6]|ul|ol|blockquote|pre|hr|div|table)\b/gi);
  if (blockTags && blockTags.length > 1) {
    // Already has multiple block elements — well-structured HTML
    return content;
  }

  // Extract raw text: strip all HTML, convert <br> and closing block tags to \n
  let text = content;
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(?:p|div|h[1-6])>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  text = text.trim();

  if (!text) return "";

  text = text.replace(/\r\n?/g, "\n");

  // Check if text has any line breaks to split on
  const hasLineBreaks = /\n/.test(text);

  if (hasLineBreaks) {
    if (looksLikeMarkdown(text)) {
      // Use marked when the source contains actual markdown syntax.
      const html = marked.parse(text) as string;
      return html.trim();
    }

    return wrapPlainTextParagraphs(text);
  }

  // No line breaks at all — single continuous text block.
  // Wrap in a single <p>.
  return `<p>${escapeHtml(text)}</p>`;
}

/**
 * Handle paste: convert plain text clipboard content into properly paragraphed HTML.
 * This ensures pasting from external sources preserves line breaks.
 */
function handlePaste(
  view: any,
  event: ClipboardEvent,
): boolean {
  const clipboardData = event.clipboardData;
  if (!clipboardData) return false;

  // If there's HTML content, let TipTap handle it natively
  const html = clipboardData.getData("text/html");
  if (html) return false;

  // Get plain text
  const text = clipboardData.getData("text/plain");
  if (!text) return false;

  // Check if text has paragraph-like structure (multiple lines)
  if (!text.includes("\n")) return false;

  // Convert text to the same normalized structure used for initial/appended content.
  const converted = normalizeContent(text);
  if (!converted.trim()) return false;

  // Insert converted HTML
  event.preventDefault();

  // Use TipTap's insertContent which handles HTML parsing
  const editor = (view as any).__tiptapEditor;
  if (editor) {
    editor.commands.insertContent(converted);
    return true;
  }

  return false;
}

export interface CreatorEditorProps {
  content: string;
  onUpdate: (content: string) => void;
  placeholder?: string;
  editable?: boolean;
  autoSaveMs?: number;
  className?: string;
  appendText?: string;
  onDelete?: () => void;
  deleteTitle?: string;
  variant?: EditorVariant;
  fontClass?: string;
  font?: EditorFont;
  onFontChange?: (font: EditorFont) => void;
  onStatsChange?: (count: number, isCjk: boolean) => void;
}

export function CreatorEditor({
  content,
  onUpdate,
  placeholder = "Start writing...",
  editable = true,
  autoSaveMs = 2000,
  className,
  appendText,
  onDelete,
  deleteTitle,
  variant = "default",
  fontClass,
  font,
  onFontChange,
  onStatsChange,
}: CreatorEditorProps) {
  const [statCount, setStatCount] = useState(0);
  const [statIsCjk, setStatIsCjk] = useState(false);

  const isInternalUpdate = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onStatsChangeRef = useRef(onStatsChange);
  onStatsChangeRef.current = onStatsChange;
  const contentRef = useRef(content);
  contentRef.current = content;
  const dirtyHtmlRef = useRef<string | null>(null);

  const debouncedUpdate = useCallback(
    (html: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        dirtyHtmlRef.current = null;
        onUpdateRef.current(html);
      }, autoSaveMs);
    },
    [autoSaveMs],
  );

  const initialContent = useMemo(() => normalizeContent(content), []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
      Typography,
      Underline,
    ],
    content: initialContent,
    editable,
    onUpdate: ({ editor: ed }) => {
      isInternalUpdate.current = true;
      const html = ed.getHTML();
      contentRef.current = html;
      dirtyHtmlRef.current = html;
      debouncedUpdate(html);
    },
    editorProps: {
      attributes: {
        class: variant === "immersive"
          ? "tiptap tiptap-immersive h-full overflow-y-auto scrollbar-none box-border focus:outline-none px-6 py-4 leading-relaxed text-lg"
          : "tiptap h-full overflow-y-auto scrollbar-none box-border focus:outline-none px-6 py-4 leading-relaxed text-gray-800 text-lg",
      },
      handlePaste,
    },
  });

  // Store editor reference on the ProseMirror view for paste handler
  useEffect(() => {
    if (editor?.view) {
      (editor.view as any).__tiptapEditor = editor;
    }
  }, [editor]);

  // Word/char count — CJK-aware
  // CJK-dominant text → show character count; otherwise → show word count
  useEffect(() => {
    if (!editor) return;

    const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\u2e80-\u2eff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g;

    const updateStats = () => {
      const text = editor.state.doc.textBetween(
        0,
        editor.state.doc.content.size,
        " ",
        " ",
      );
      const stripped = text.replace(/\s/g, "");
      const cjkMatches = stripped.match(CJK_RE);
      const cjkCount = cjkMatches ? cjkMatches.length : 0;
      const isCjk = stripped.length > 0 && cjkCount / stripped.length > 0.3;

      let count: number;
      if (isCjk) {
        // Character count (excluding whitespace)
        count = stripped.length;
      } else {
        // Word count (whitespace split)
        count = text.split(/\s+/).filter((s) => s.length > 0).length;
      }

      setStatCount(count);
      setStatIsCjk(isCjk);
      onStatsChangeRef.current?.(count, isCjk);
    };

    updateStats();
    editor.on("transaction", updateStats);
    return () => {
      editor.off("transaction", updateStats);
    };
  }, [editor]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // Sync content from props (e.g., when server data updates)
  useEffect(() => {
    if (!editor) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const normalized = normalizeContent(content);
    const currentHTML = editor.getHTML();
    if (normalized !== currentHTML) {
      editor.commands.setContent(normalized, false);
    }
  }, [content, editor]);

  // Append text from agent
  const prevAppendText = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!editor || !appendText) return;
    if (appendText === prevAppendText.current) return;
    prevAppendText.current = appendText;

    // Convert appended text through normalizeContent too
    const html = normalizeContent(appendText);
    editor.chain().focus("end").insertContent(html).run();

    const editorHtml = editor.getHTML();
    contentRef.current = editorHtml;
    onUpdateRef.current(editorHtml);
  }, [appendText, editor]);

  // Ctrl/Cmd+S: prevent browser save and flush immediately
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        const html = dirtyHtmlRef.current ?? editor?.getHTML();
        if (html) {
          dirtyHtmlRef.current = null;
          onUpdateRef.current(html);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        if (dirtyHtmlRef.current !== null) {
          onUpdateRef.current(dirtyHtmlRef.current);
          dirtyHtmlRef.current = null;
        }
      }
    };
  }, []);

  const immersive = variant === "immersive";

  return (
    <div
      className={`flex min-h-0 flex-col rounded-lg ${
        immersive
          ? "glass-panel border-0 bg-transparent"
          : "border border-gray-200 bg-white"
      } ${fontClass ?? ""} ${className ?? ""}`}
    >
      <EditorToolbar
        editor={editor}
        onDelete={onDelete}
        deleteTitle={deleteTitle}
        font={font}
        onFontChange={onFontChange}
        variant={variant}
      />

      <div
        className="flex-1 min-h-0 cursor-text overflow-hidden"
        onClick={(e) => {
          if (!editor) return;
          const target = e.target as HTMLElement;
          if (target.closest(".tiptap")) return;
          editor.chain().focus("end").run();
        }}
      >
        <EditorContent editor={editor} className="h-full" />
      </div>

      {!immersive && (
        <div className="flex items-center justify-end gap-4 border-t border-gray-200 px-4 py-1.5 text-xs text-gray-400 shrink-0">
          <span>{statCount} {statIsCjk ? "字" : "words"}</span>
        </div>
      )}
    </div>
  );
}
