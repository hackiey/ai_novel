export interface SkillData {
  name: string;
  description: string;
  argumentHint?: string;
  content: string;
}

/** Render a skill content template, replacing $ARGUMENTS / $0 / $1 placeholders */
export function renderSkillPrompt(skill: SkillData, args: string): string {
  let content = skill.content;

  // Split args into individual arguments
  const argParts = args.trim() ? args.trim().split(/\s+/) : [];

  // Replace $ARGUMENTS with the full argument string
  if (content.includes("$ARGUMENTS")) {
    content = content.replaceAll("$ARGUMENTS", args.trim());
  } else if (args.trim()) {
    // If no $ARGUMENTS placeholder exists, append arguments
    content += `\n\nARGUMENTS: ${args.trim()}`;
  }

  // Replace $ARGUMENTS[N] and $N with positional arguments
  for (let i = 0; i < argParts.length; i++) {
    content = content.replaceAll(`$ARGUMENTS[${i}]`, argParts[i]);
    content = content.replaceAll(`$${i}`, argParts[i]);
  }

  return content;
}
