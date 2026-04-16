import type { AgentDefinition } from "./types.js";
import { buildSystemPromptWithContext } from "../systemPrompt.js";

export const creatorAgent: AgentDefinition = {
  id: "creator",
  label: "Creative Writing Assistant",
  tools: ["*"],
  buildSystemPrompt(ctx) {
    return buildSystemPromptWithContext(
      ctx.projectId,
      ctx.worldId,
      ctx.memory,
      ctx.worldSummary,
      ctx.locale,
      ctx.projectMemory,
      ctx.workingEnvironment,
      ctx.conversationSummary,
      ctx.skills,
    );
  },
};
