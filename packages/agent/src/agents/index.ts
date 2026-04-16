import type { AgentDefinition } from "./types.js";
import { creatorAgent } from "./creator.js";
import { fileImportAgent } from "./fileImport.js";

/** All registered agent definitions, keyed by id */
const registry = new Map<string, AgentDefinition>([
  [creatorAgent.id, creatorAgent],
  [fileImportAgent.id, fileImportAgent],
]);

/** Look up an agent definition. Throws if not found. */
export function getAgentDefinition(agentType: string): AgentDefinition {
  const def = registry.get(agentType);
  if (!def) {
    throw new Error(`Unknown agent type: "${agentType}". Available: ${[...registry.keys()].join(", ")}`);
  }
  return def;
}

/** List all registered agent type ids */
export function getAgentTypes(): string[] {
  return [...registry.keys()];
}

export type { AgentDefinition, ToolName, SystemPromptContext } from "./types.js";
export { creatorAgent } from "./creator.js";
export { fileImportAgent } from "./fileImport.js";
