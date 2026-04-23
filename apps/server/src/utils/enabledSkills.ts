/**
 * Resolve a project/world's enabled skill slugs. Missing field defaults to
 * `[]` — callers should treat that as "no skills enabled at this scope".
 */
export function resolveEnabledSkillSlugs(
  doc: Record<string, unknown> | null | undefined,
): string[] {
  if (!doc) return [];
  if (Array.isArray(doc.enabledSkillSlugs)) {
    return doc.enabledSkillSlugs as string[];
  }
  return [];
}
