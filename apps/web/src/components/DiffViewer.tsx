import { useMemo } from "react";
import * as Diff from "diff";

interface Props {
  oldContent: string;
  newContent: string;
  fontClass?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|div|br|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

type Row =
  | { kind: "context"; text: string }
  | { kind: "removed"; text: string }
  | { kind: "added"; text: string };

export default function DiffViewer({ oldContent, newContent, fontClass }: Props) {
  const rows = useMemo<Row[]>(() => {
    const oldText = stripHtml(oldContent);
    const newText = stripHtml(newContent);
    const parts = Diff.diffLines(oldText, newText);
    const out: Row[] = [];
    parts.forEach((part) => {
      const lines = splitLines(part.value);
      lines.forEach((line) => {
        if (part.removed) out.push({ kind: "removed", text: line });
        else if (part.added) out.push({ kind: "added", text: line });
        else out.push({ kind: "context", text: line });
      });
    });
    return out;
  }, [oldContent, newContent]);

  return (
    <div
      className={`tiptap-immersive flex-1 overflow-y-auto px-10 py-8 text-[17px] leading-[1.9] scrollbar-none ${fontClass ?? ""}`}
    >
      {rows.map((row, i) => {
        if (row.kind === "context") {
          if (row.text === "") return <div key={i} className="h-[0.9em]" />;
          return (
            <div key={i} className="text-white/40 whitespace-pre-wrap">
              {row.text}
            </div>
          );
        }
        if (row.kind === "removed") {
          return (
            <div
              key={i}
              className="relative whitespace-pre-wrap rounded-sm pl-4 pr-2 py-0.5 my-px"
              style={{ background: "rgba(239, 68, 68, 0.08)" }}
            >
              <span
                className="absolute left-1 top-1/2 -translate-y-1/2 text-[11px] font-mono text-rose-300/70 select-none"
                aria-hidden
              >
                −
              </span>
              <span className="text-rose-200/85 line-through decoration-rose-300/40 decoration-1">
                {row.text || " "}
              </span>
            </div>
          );
        }
        return (
          <div
            key={i}
            className="relative whitespace-pre-wrap rounded-sm pl-4 pr-2 py-0.5 my-px"
            style={{ background: "rgba(16, 185, 129, 0.10)" }}
          >
            <span
              className="absolute left-1 top-1/2 -translate-y-1/2 text-[11px] font-mono text-emerald-300/80 select-none"
              aria-hidden
            >
              +
            </span>
            <span className="text-emerald-100/95">{row.text || " "}</span>
          </div>
        );
      })}
    </div>
  );
}
