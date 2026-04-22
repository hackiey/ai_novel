import { ObjectId, type Db } from "mongodb";

/**
 * Resolve a project/world's enabled skills as a slug array.
 *
 * Handles three states + legacy migration:
 * - `enabledSkillSlugs: string[]` → returned as-is (post-migration shape)
 * - `enabledSkillIds: ObjectId[]` (legacy) → translated to slugs via the skills collection
 * - neither field present → returns `undefined` (caller should treat as "all enabled")
 *
 * Returns `[]` (empty array, NOT undefined) when the field is set but empty —
 * this distinguishes "user explicitly disabled everything" from "legacy default".
 */
export async function resolveEnabledSkillSlugs(
  db: Db,
  doc: Record<string, unknown> | null | undefined,
): Promise<string[] | undefined> {
  if (!doc) return undefined;

  if (Array.isArray(doc.enabledSkillSlugs)) {
    return doc.enabledSkillSlugs as string[];
  }

  if (Array.isArray(doc.enabledSkillIds)) {
    const ids = doc.enabledSkillIds as unknown[];
    if (ids.length === 0) return [];
    const oids = ids
      .map((id): ObjectId | null => {
        if (id instanceof ObjectId) return id;
        if (typeof id === "string" && /^[a-f0-9]{24}$/i.test(id)) return new ObjectId(id);
        return null;
      })
      .filter((x): x is ObjectId => x !== null);
    if (oids.length === 0) return [];
    const skillDocs = await db
      .collection("skills")
      .find({ _id: { $in: oids } })
      .project({ slug: 1 })
      .toArray();
    return skillDocs.map((d) => d.slug as string);
  }

  return undefined;
}
