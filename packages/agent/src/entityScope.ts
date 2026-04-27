import { ObjectId } from "mongodb";

export interface EntityScopeFilterIds {
  projectId?: string;
  worldId?: string;
}

function idIn(id: string): { $in: (string | ObjectId)[] } {
  return { $in: [id, new ObjectId(id)] };
}

/**
 * Storage convention for entities that support world-vs-project scope
 * (currently drafts, characters, world_settings):
 * - Every entity has `worldId`.
 * - Every entity has `projectId` written explicitly. World-level entities store
 *   `projectId: null`; project-level entities store the ObjectId. Writing the
 *   field (even as null) is required so Atlas Vector Search can filter on it
 *   via `$in: [<pid>, null]` — the index does not support `$exists`.
 *
 * Visibility rules:
 * - Project context (projectId + worldId): see this world's entities where
 *   projectId == current OR projectId == null.
 * - World-only context (worldId, no projectId): see only world-level entities.
 * - Project-only context (projectId, no worldId): see only that project's entities.
 *
 * The same filter shape works for both regular Mongo find queries and the
 * `$vectorSearch.filter` stage, so vector search needs no JS post-filter
 * (and avoids the candidate-pool dilution problem).
 */
export function entityScopeFilter(ids: EntityScopeFilterIds): Record<string, unknown> {
  const { projectId, worldId } = ids;
  if (projectId && worldId) {
    return {
      worldId: idIn(worldId),
      projectId: { $in: [projectId, new ObjectId(projectId), null] },
    };
  }
  if (projectId) {
    return { projectId: idIn(projectId) };
  }
  if (worldId) {
    return { worldId: idIn(worldId), projectId: null };
  }
  return {};
}
