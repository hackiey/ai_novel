import type { AgentDefinition } from "./types.js";
import { t } from "../i18n.js";

export const skillRecommendAgent: AgentDefinition = {
  id: "skill-recommend",
  label: "Skill Recommender",
  tools: ["search_skills", "propose_skills"],
  buildSystemPrompt(ctx) {
    const locale = ctx.locale ?? "zh";
    const texts = t(locale);
    return texts.skillRecommend.systemPrompt;
  },
};
