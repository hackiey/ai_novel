import { t, type Locale } from "./i18n.js";
import type { SkillData } from "./skills.js";

export function buildSystemPrompt(projectId: string, worldId?: string, locale: Locale = "zh"): string {
  const texts = t(locale);
  const idSection = worldId
    ? texts.idSectionWithWorld(projectId, worldId)
    : texts.idSectionNoWorld(projectId);

  return `${texts.systemRole}
${idSection}

${texts.coreAbilities}

${texts.principles}

${texts.interaction}

${texts.notes}`;
}

export function buildSystemPromptWithContext(
  projectId: string,
  worldId?: string,
  memory?: string,
  worldSummary?: string,
  locale: Locale = "zh",
  projectMemory?: string,
  workingEnvironment?: string,
  conversationSummary?: string,
  skills?: SkillData[],
): string {
  const texts = t(locale);
  let prompt = buildSystemPrompt(projectId, worldId, locale);

  if (workingEnvironment) {
    prompt += `\n\n${texts.workingEnvironmentHeading}\n\n${workingEnvironment}`;
  }

  if (conversationSummary) {
    prompt += `\n\n${texts.conversationSummaryHeading}\n\n${texts.conversationSummaryIntro}\n\n${conversationSummary}`;
  }

  if (worldSummary) {
    prompt += `\n\n${texts.worldOverviewHeading}\n\n${texts.worldOverviewIntro}\n\n${worldSummary}`;
  }

  if (memory) {
    prompt += `\n\n${texts.memoryHeading}\n\n${texts.memoryIntro}\n\n${memory}\n\n${texts.memoryFooter}`;
  }

  if (projectMemory) {
    prompt += `\n\n${texts.projectMemoryHeading}\n\n${texts.projectMemoryIntro}\n\n${projectMemory}\n\n${texts.memoryFooter}`;
  }

  if (skills && skills.length > 0) {
    const heading = locale === "zh" ? "## 可用技能" : "## Available Skills";
    const intro = locale === "zh"
      ? "你可以通过调用 invoke_skill 工具来使用以下技能。每个技能提供专业化的创作指导。当用户的需求匹配某个技能时，优先使用技能。"
      : "Use the invoke_skill tool to activate the skills below. Each skill provides specialized creative writing guidance. Prefer skills when the user's request matches.";
    const whenLabel = locale === "zh" ? "使用时机" : "When to use";
    const lines = skills.map(s => {
      const name = s.name[locale] || s.name.zh;
      const desc = s.description[locale] || s.description.zh;
      const when = s.whenToUse[locale] || s.whenToUse.zh;
      const argDesc = s.arguments.length > 0
        ? ` (${s.arguments.map(a => `${a.name}: ${(a.description[locale] || a.description.zh)}`).join(", ")})`
        : "";
      return `- **${name}** (\`${s.skillId}\`): ${desc}${argDesc}\n  ${whenLabel}: ${when}`;
    });
    prompt += `\n\n${heading}\n\n${intro}\n\n${lines.join("\n")}`;
  }

  return prompt;
}
