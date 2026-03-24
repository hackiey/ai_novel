import { useMemo } from "react";
import * as Diff from "diff";

interface Props {
  oldContent: string;
  newContent: string;
}

function stripHtml(html: string): string {
  // Replace block elements with newlines, then strip remaining tags
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

export default function DiffViewer({ oldContent, newContent }: Props) {
  const parts = useMemo(() => {
    const oldText = stripHtml(oldContent);
    const newText = stripHtml(newContent);
    return Diff.diffLines(oldText, newText);
  }, [oldContent, newContent]);

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 font-serif text-base leading-relaxed text-gray-800">
      {parts.map((part, i) => {
        if (part.removed) {
          return (
            <div key={i} className="bg-red-50 border-l-4 border-red-300 pl-3 py-1 my-1">
              <del className="text-red-800 decoration-red-400/60 whitespace-pre-wrap">{part.value}</del>
            </div>
          );
        }
        if (part.added) {
          return (
            <div key={i} className="bg-green-50 border-l-4 border-green-300 pl-3 py-1 my-1">
              <ins className="text-green-800 no-underline whitespace-pre-wrap">{part.value}</ins>
            </div>
          );
        }
        return <div key={i} className="whitespace-pre-wrap">{part.value}</div>;
      })}
    </div>
  );
}
