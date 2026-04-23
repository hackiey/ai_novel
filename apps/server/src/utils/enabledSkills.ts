/**
 * Resolve a project/world's enabled skill slugs.
 *
 * Always returns a string array. Missing field defaults to `[]` — callers
 * should treat that as "no skills enabled at this scope". Persisted documents
 * are guaranteed to carry `enabledSkillSlugs` after the one-time migration
 * (see scripts/migrate-enabled-skill-slugs.ts); the `[]` fallback only guards
 * against rows inserted by code paths that forget the default.
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
