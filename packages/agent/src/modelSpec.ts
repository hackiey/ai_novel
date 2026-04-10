import { getModel, getProviders, getModels } from "@mariozechner/pi-ai";
import type { ThinkingLevel } from "@mariozechner/pi-ai";

const VALID_REASONING = ["minimal", "low", "medium", "high", "xhigh"] as const;

export interface ParsedModelSpec {
  provider: string;
  modelId: string;
  reasoning?: ThinkingLevel;
}

export function parseModelSpec(spec: string): ParsedModelSpec {
  const idx = spec.indexOf(":");
  let provider: string;
  let rest: string;

  if (idx === -1) {
    provider = "anthropic";
    rest = spec;
  } else {
    provider = spec.slice(0, idx);
    rest = spec.slice(idx + 1);
  }

  const slashIdx = rest.lastIndexOf("/");
  if (slashIdx !== -1) {
    const maybeReasoning = rest.slice(slashIdx + 1);
    if (VALID_REASONING.includes(maybeReasoning as ThinkingLevel)) {
      return {
        provider,
        modelId: rest.slice(0, slashIdx),
        reasoning: maybeReasoning as ThinkingLevel,
      };
    }
  }

  return { provider, modelId: rest };
}

export function getModelContextWindowFromSpec(spec: string): number {
  const { provider, modelId } = parseModelSpec(spec);
  return getModel(provider as any, modelId as any).contextWindow || 0;
}

export function getModelInfoFromSpec(spec: string): { contextWindow: number; maxTokens: number } | null {
  const { provider, modelId } = parseModelSpec(spec);

  // 1. Try exact provider:modelId match
  try {
    const model = getModel(provider as any, modelId as any);
    if (model) return { contextWindow: model.contextWindow || 0, maxTokens: model.maxTokens || 0 };
  } catch {
    // not found, fall through
  }

  // 2. Search by modelId across all providers
  for (const p of getProviders()) {
    const models = getModels(p);
    const found = models.find((m) => m.id === modelId);
    if (found) return { contextWindow: found.contextWindow || 0, maxTokens: found.maxTokens || 0 };
  }

  return null;
}
