import type { AgentDefinition } from "./types.js";
import { t } from "../i18n.js";

export const fileImportAgent: AgentDefinition = {
  id: "file-import",
  label: "File Import Extractor",
  tools: [
    "semantic_search",
    "write",
    "update",
    "get_entity",
    "delete_entity",
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
