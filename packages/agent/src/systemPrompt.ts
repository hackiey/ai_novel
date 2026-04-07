import { t, type Locale } from "./i18n.js";

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

  return prompt;
}
