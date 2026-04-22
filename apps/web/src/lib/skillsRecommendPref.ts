import { useCallback, useEffect, useState } from "react";

const PREFIX = "ai-creator:skillsRecommend:";

type Listener = (projectId: string, enabled: boolean) => void;
const listeners = new Set<Listener>();

function read(projectId: string | undefined): boolean {
  if (!projectId) return true;
  try {
    const raw = window.localStorage.getItem(PREFIX + projectId);
    if (raw === null) return true; // default ON for fresh projects
    return raw === "true";
  } catch {
    return true;
  }
}

function write(projectId: string, enabled: boolean): void {
  try {
    window.localStorage.setItem(PREFIX + projectId, enabled ? "true" : "false");
  } catch {
    // ignore quota / private-mode errors — UI just won't persist
  }
  for (const cb of listeners) cb(projectId, enabled);
}

/**
 * Per-project Skills 推荐 preference, stored in localStorage. Components in different
 * subtrees (the chat input checkbox and the SkillSettingsDialog toggle) share state
 * via the in-memory listener pub-sub so toggling in one updates the other immediately.
 */
export function useSkillsRecommend(projectId: string | undefined): {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
} {
  const [enabled, setLocal] = useState<boolean>(() => read(projectId));

  useEffect(() => {
    setLocal(read(projectId));
    const cb: Listener = (id, v) => {
      if (id === projectId) setLocal(v);
    };
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, [projectId]);

  const setEnabled = useCallback((next: boolean) => {
    if (!projectId) return;
    write(projectId, next);
  }, [projectId]);

  return { enabled, setEnabled };
}
