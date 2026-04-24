const STORAGE_KEY = "ai_creator_byok";

export type BYOKProvider = "openai" | "anthropic" | "google" | "openrouter" | "custom";

export interface BYOKConfig {
  provider: BYOKProvider;
  apiKey: string;
  baseURL?: string;       // only for "custom" provider
  models: string[];       // model IDs without provider prefix, e.g. ["gpt-4o", "gpt-4o-mini"]
  contextWindows?: Record<string, number>; // modelId -> context window size in tokens
}

export function getBYOKConfig(): BYOKConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.apiKey || !parsed?.provider) return null;
    // Migrate old single contextWindow to contextWindows map
    if (typeof parsed.contextWindow === "number" && !parsed.contextWindows) {
      const models = Array.isArray(parsed.models) ? parsed.models as string[] : [];
      if (models.length > 0) {
        parsed.contextWindows = Object.fromEntries(models.map((m: string) => [m, parsed.contextWindow]));
      }
      delete parsed.contextWindow;
    }
    return parsed as BYOKConfig;
  } catch {
    return null;
  }
}

export function setBYOKConfig(config: BYOKConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearBYOKConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Get full model specs (provider:modelId) from BYOK config */
export function getBYOKModelSpecs(): string[] {
  const config = getBYOKConfig();
  if (!config?.apiKey || !config.models?.length) return [];
  return config.models.map((m) => `${config.provider}:${m}`);
}

/** Return BYOK credentials if the model matches the configured provider */
export function getBYOKForModel(modelSpec: string): { apiKey: string; baseURL?: string; contextWindow?: number } | null {
  const config = getBYOKConfig();
  if (!config?.apiKey) return null;

  const colonIdx = modelSpec.indexOf(":");
  const provider = colonIdx !== -1 ? modelSpec.slice(0, colonIdx) : "";
  const modelId = colonIdx !== -1 ? modelSpec.slice(colonIdx + 1) : modelSpec;

  if (provider !== config.provider) return null;

  const contextWindow = config.contextWindows?.[modelId];

  return {
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    ...(contextWindow ? { contextWindow } : {}),
  };
}

/** Check if BYOK is configured */
export function hasBYOKKeys(): boolean {
  const config = getBYOKConfig();
  return !!config?.apiKey;
}
