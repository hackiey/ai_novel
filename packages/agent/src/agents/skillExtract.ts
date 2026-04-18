import type { AgentDefinition } from "./types.js";
import { t } from "../i18n.js";

export const skillExtractAgent: AgentDefinition = {
  id: "skill-extract",
  label: "Skill Extractor",
  tools: [
    "search_skills",
    "create_skill",
    "update_skill",
    "delete_skill",
  ],
  buildSystemPrompt(ctx) {
    const locale = ctx.locale ?? "zh";
    const texts = t(locale);
    return texts.skillExtract.systemPrompt;
  },
};
