import { z } from "zod";
import { objectIdSchema } from "@ai-novel/types";
import { router, publicProcedure } from "../trpc.js";
import { getEmbeddingService } from "../services/embeddingService.js";

export const searchRouter = router({
  search: publicProcedure
    .input(
      z.object({
        projectId: objectIdSchema.optional(),
        worldId: objectIdSchema.optional(),
        query: z.string().min(1).max(500),
        scope: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(50).optional().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const embeddingService = getEmbeddingService();

      // If embedding service is available, use vector search
      if (embeddingService && (input.projectId || input.worldId)) {
        try {
          const results = await embeddingService.vectorSearch(
            { projectId: input.projectId, worldId: input.worldId },
            input.query,
            { scope: input.scope, limit: input.limit }
          );
          return { results, method: "vector" as const };
        } catch (err) {
          console.error("[Search] Vector search failed, falling back to regex:", err);
          // Fall through to regex search
        }
      }

      // Fallback: regex-based search across collections
      const collections = input.scope?.length
        ? input.scope
        : ["characters", "world_settings", "drafts", "chapters"];

      const escapedQuery = input.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapedQuery, "i");

      const results: Array<{
        collection: string;
        id: string;
        title: string;
        excerpt: string;
        score: number;
      }> = [];

      // Build base filter from projectId/worldId
      const baseFilter: Record<string, any> = {};
      if (input.projectId) baseFilter.projectId = input.projectId;
      if (input.worldId) baseFilter.worldId = input.worldId;

      const searches = collections.map(async (collName) => {
        try {
          const col = ctx.db.collection(collName);

          // Build search filter based on collection type
          const textFields: Record<string, string[]> = {
            characters: ["name", "profile.personality", "profile.background", "profile.goals"],
            world_settings: ["title", "content"],
            drafts: ["title", "content"],
            chapters: ["title", "synopsis", "content"],
          };

          const fields = textFields[collName] || ["title", "content"];
          const orConditions = fields.map((field) => ({ [field]: regex }));

          // Characters and world_settings use worldId, chapters use projectId
          const collFilter: Record<string, any> = {};
          if (collName === "characters" || collName === "world_settings") {
            if (input.worldId) collFilter.worldId = input.worldId;
          } else if (collName === "chapters") {
            if (input.projectId) collFilter.projectId = input.projectId;
          } else {
            // drafts can have either
            if (input.projectId) collFilter.projectId = input.projectId;
            if (input.worldId) collFilter.worldId = input.worldId;
          }

          const docs = await col
            .find({
              ...collFilter,
              $or: orConditions,
            })
            .limit(input.limit)
            .toArray();

          return docs.map((doc) => {
            let title = "";
            let excerpt = "";

            switch (collName) {
              case "characters":
                title = doc.name || "Untitled Character";
                excerpt = doc.profile?.background || doc.profile?.personality || "";
                break;
              case "chapters":
                title = doc.title || `Chapter ${doc.order ?? ""}`.trim();
                excerpt = doc.synopsis || doc.content?.slice(0, 200) || "";
                break;
              default:
                title = doc.title || "Untitled";
                excerpt = doc.content?.slice(0, 200) || "";
            }

            if (excerpt.length > 200) {
              excerpt = excerpt.slice(0, 200) + "...";
            }

            return {
              collection: collName,
              id: doc._id.toHexString(),
              title,
              excerpt,
              score: 1, // Regex matches don't have a real score
            };
          });
        } catch (err) {
          console.error(`[Search] Regex search failed for ${collName}:`, err);
          return [];
        }
      });

      const allResults = await Promise.all(searches);
      for (const batch of allResults) {
        results.push(...batch);
      }

      return { results: results.slice(0, input.limit), method: "regex" as const };
    }),
});
