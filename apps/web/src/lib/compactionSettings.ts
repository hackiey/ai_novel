const STORAGE_KEY = "compaction-settings";

export interface CompactionSettings {
  threshold: number; // token count
}

export function getCompactionSettings(): CompactionSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.threshold === "number" && parsed.threshold > 0) {
      return { threshold: parsed.threshold };
    }
    return null;
  } catch {
    return null;
  }
}

export function setCompactionSettings(settings: CompactionSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearCompactionSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}
