import { getModel } from "@mariozechner/pi-ai";
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
