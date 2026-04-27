import { ObjectId } from "mongodb";

export interface EntityScopeFilterIds {
  projectId?: string;
  worldId?: string;
  /** When provided, restricts results to documents owned by this user. */
  userId?: string;
}

function idIn(id: string): { $in: (string | ObjectId)[] } {
  return { $in: [id, new ObjectId(id)] };
}

/** Match a userId stored as either a string or an ObjectId. */
export function userIdMatcher(userId: string): { $in: (string | ObjectId)[] } {
  let asObjectId: ObjectId | undefined;
  try {
    asObjectId = new ObjectId(userId);
  } catch {
    asObjectId = undefined;
  }
  return { $in: asObjectId ? [userId, asObjectId] : [userId] };
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
 * Tenant isolation:
 * - When `userId` is provided, an additional `userId` clause is added so the
 *   filter can never escape the calling user's tenant — even if the agent
 *   passes a hallucinated or copied projectId/worldId from another user.
 *
 * The same filter shape works for both regular Mongo find queries and the
 * `$vectorSearch.filter` stage, so vector search needs no JS post-filter
 * (and avoids the candidate-pool dilution problem).
 */
export function entityScopeFilter(ids: EntityScopeFilterIds): Record<string, unknown> {
  const { projectId, worldId, userId } = ids;
  const filter: Record<string, unknown> = (() => {
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
  })();
  if (userId) filter.userId = userIdMatcher(userId);
  return filter;
}
