import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import Underline from "@tiptap/extension-underline";
import { useState, useEffect, useRef, useCallback } from "react";
import { EditorToolbar } from "./EditorToolbar";

export interface NovelEditorProps {
  content: string;
  onUpdate: (content: string) => void;
  placeholder?: string;
  editable?: boolean;
  autoSaveMs?: number;
  className?: string;
  appendText?: string;
}

export function NovelEditor({
  content,
  onUpdate,
  placeholder = "Start writing...",
  editable = true,
  autoSaveMs = 2000,
  className,
  appendText,
}: NovelEditorProps) {
  const [words, setWords] = useState(0);
  const [chars, setChars] = useState(0);

  const isInternalUpdate = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const contentRef = useRef(content);
  contentRef.current = content;
  // Tracks the latest editor HTML from user edits only (not from prop sync).
  // Used to flush pending saves on unmount.
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
      Typography,
      Underline,
    ],
    content,
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
        class:
          "tiptap focus:outline-none px-6 py-4 leading-relaxed text-gray-800 text-lg",
      },
    },
  });

  // Compute word/char counts whenever the editor document changes
  useEffect(() => {
    if (!editor) return;

    const updateStats = () => {
      const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, " ", " ");
      const c = text.length;
      const w = text.split(/\s+/).filter((s) => s.length > 0).length;
      setWords(w);
      setChars(c);
    };

    // Initial count
    updateStats();

    // Listen to every transaction
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

  useEffect(() => {
    if (!editor) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const currentHTML = editor.getHTML();
    if (content !== currentHTML) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  const prevAppendText = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!editor || !appendText) return;
    if (appendText === prevAppendText.current) return;
    prevAppendText.current = appendText;

    editor.chain().focus("end").insertContent(appendText).run();

    const html = editor.getHTML();
    contentRef.current = html;
    onUpdateRef.current(html);
  }, [appendText, editor]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        // Flush pending save on unmount so edits aren't lost on chapter switch
        if (dirtyHtmlRef.current !== null) {
          onUpdateRef.current(dirtyHtmlRef.current);
          dirtyHtmlRef.current = null;
        }
      }
    };
  }, []);

  return (
    <div
      className={`flex flex-col border border-gray-200 rounded-lg bg-white ${className ?? ""}`}
    >
      <EditorToolbar editor={editor} />

      <div
        className="flex-1 overflow-y-auto cursor-text"
        onClick={(e) => {
          if (!editor) return;
          const target = e.target as HTMLElement;
          if (target.closest(".tiptap")) return;
          editor.chain().focus("end").run();
        }}
      >
        <EditorContent editor={editor} />
      </div>

      <div className="flex items-center justify-end gap-4 border-t border-gray-200 px-4 py-1.5 text-xs text-gray-400">
        <span>{words} {words === 1 ? "word" : "words"}</span>
        <span>{chars} {chars === 1 ? "character" : "characters"}</span>
      </div>
    </div>
  );
}
