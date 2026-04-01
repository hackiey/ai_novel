import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

interface EditableTextProps {
  value: string;
  onSave: (newValue: string) => void;
  onClick?: () => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}

export default function EditableText({
  value,
  onSave,
  onClick,
  className = "",
  inputClassName = "",
  placeholder,
}: EditableTextProps) {
  const { t } = useTranslation();
  const defaultPlaceholder = placeholder ?? t("editable.untitled");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
    setEditing(false);
  }, [draft, value, onSave]);

  const stopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onClick={stopPropagation}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={`bg-white border border-teal-300 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-teal-400 ${inputClassName}`}
        placeholder={defaultPlaceholder}
      />
    );
  }

  return (
    <span
      onClick={onClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={`cursor-default select-none ${className}`}
      title={t("editable.doubleClickEdit")}
    >
      {value || defaultPlaceholder}
    </span>
  );
}
