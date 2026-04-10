const STORAGE_KEY = "ai_creator_byok";

export type BYOKProvider = "openai" | "anthropic" | "openrouter" | "custom";

export interface BYOKConfig {
  provider: BYOKProvider;
  apiKey: string;
  baseURL?: string;       // only for "custom" provider
  models: string[];       // model IDs without provider prefix, e.g. ["gpt-4o", "gpt-4o-mini"]
}

export function getBYOKConfig(): BYOKConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.apiKey || !parsed?.provider) return null;
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
export function getBYOKForModel(modelSpec: string): { apiKey: string; baseURL?: string } | null {
  const config = getBYOKConfig();
  if (!config?.apiKey) return null;

  const colonIdx = modelSpec.indexOf(":");
  const provider = colonIdx !== -1 ? modelSpec.slice(0, colonIdx) : "";

  if (provider !== config.provider) return null;

  return {
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  };
}

/** Check if BYOK is configured */
export function hasBYOKKeys(): boolean {
  const config = getBYOKConfig();
  return !!config?.apiKey;
}
