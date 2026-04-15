import type { Locale } from "./i18n.js";

export interface SkillArgument {
  name: string;
  description: Record<Locale, string>;
  required: boolean;
}

export interface SkillData {
  skillId: string;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  whenToUse: Record<Locale, string>;
  prompt: Record<Locale, string>;
  arguments: SkillArgument[];
}

/** Render a skill prompt template, replacing {{argName}} placeholders */
export function renderSkillPrompt(skill: SkillData, args: Record<string, unknown>, locale: Locale): string {
  let prompt = skill.prompt[locale] || skill.prompt.zh;
  for (const arg of skill.arguments) {
    const value = args[arg.name];
    const placeholder = `{{${arg.name}}}`;
    prompt = prompt.replaceAll(placeholder, value != null ? String(value) : (locale === "zh" ? "（未指定）" : "(not specified)"));
  }
  return prompt;
}
