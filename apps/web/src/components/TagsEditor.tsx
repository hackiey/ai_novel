import { useState, KeyboardEvent } from "react";

interface TagsEditorProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxLength?: number;
}

export default function TagsEditor({ value, onChange, placeholder, maxLength = 100 }: TagsEditorProps) {
  const [input, setInput] = useState("");

  const commit = (raw: string) => {
    const tag = raw.trim().slice(0, maxLength);
    if (!tag) return;
    if (value.includes(tag)) {
      setInput("");
      return;
    }
    onChange([...value, tag]);
    setInput("");
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(input);
    } else if (e.key === "Backspace" && input === "" && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-white/5 border border-white/20 px-2 py-1.5 focus-within:ring-2 focus-within:ring-teal-500">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-white/10 text-white/70"
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              remove(tag);
            }}
            className="text-white/40 hover:text-white/80"
            aria-label="remove"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => input && commit(input)}
        onClick={(e) => e.stopPropagation()}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[8ch] bg-transparent text-sm text-white/90 placeholder-white/30 focus:outline-none px-1 py-0.5"
      />
    </div>
  );
}
