import type { AgentDefinition } from "./types.js";
import { t } from "../i18n.js";

export const fileImportAgent: AgentDefinition = {
  id: "file-import",
  label: "File Import Extractor",
  tools: [
    "semantic_search",
    "write",
    "update_character",
    "get_entity",
    "delete_entity",
    "update_world_setting",
  ],
  buildSystemPrompt(ctx) {
    const locale = ctx.locale ?? "zh";
    const texts = t(locale);

    let prompt = texts.fileImport.extractionSystemPrompt;

    if (ctx.worldSummary) {
      prompt += `\n\n${texts.worldOverviewHeading}\n\n${texts.worldOverviewIntro}\n\n${ctx.worldSummary}`;
    }

    return prompt;
  },
};
