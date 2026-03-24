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

export interface HistoryToolCall {
  toolName: string;
  toolInput?: unknown;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: HistoryToolCall[];
}

export function buildSystemPromptWithHistory(
  projectId: string,
  worldId?: string,
  history?: HistoryMessage[],
  memory?: string,
  worldSummary?: string,
  locale: Locale = "zh",
  projectMemory?: string,
  workingEnvironment?: string,
): string {
  const texts = t(locale);
  let prompt = buildSystemPrompt(projectId, worldId, locale);

  if (workingEnvironment) {
    prompt += `\n\n${texts.workingEnvironmentHeading}\n\n${workingEnvironment}`;
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

  if (history && history.length > 0) {
    prompt += `\n\n${texts.historyHeading}\n\n${texts.historyIntro}\n\n`;
    for (const msg of history) {
      if (msg.role === "user") {
        prompt += `${texts.historyUser} ${msg.content}\n\n`;
      } else {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const toolSummary = msg.toolCalls
            .map((tc) => {
              const inputStr = tc.toolInput ? ` ${JSON.stringify(tc.toolInput)}` : "";
              return `  - ${tc.toolName}${inputStr}`;
            })
            .join("\n");
          prompt += `${texts.historyAssistantTool}\n${toolSummary}\n\n`;
        }
        if (msg.content) {
          prompt += `${texts.historyAssistant} ${msg.content}\n\n`;
        }
      }
    }
    prompt += texts.historyFooter;
  }

  return prompt;
}
