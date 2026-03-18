import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { ObjectId, type Db } from "mongodb";
import * as handlers from "./handlers.js";
import { t, type Locale } from "../i18n.js";

export type VectorSearchFn = (args: {
  projectId?: string;
  worldId?: string;
  query: string;
  scope?: string[];
  limit?: number;
}) => Promise<{ results: Array<{ collection: string; id: string; title: string; excerpt: string; score: number }>; total: number }>;

export type OnDocumentChangedFn = (collection: string, id: string) => void;
export type OnWorldSummaryStaleFn = (worldId: string) => void;

export function createNovelToolsServer(db: Db, vectorSearchFn?: VectorSearchFn, onDocumentChanged?: OnDocumentChangedFn, userId?: string, onWorldSummaryStale?: OnWorldSummaryStaleFn, locale: Locale = "zh", worldId?: string, projectId?: string) {
  const d = t(locale).tools;

  return createSdkMcpServer({
    name: "novel-tools",
    version: "1.0.0",
    tools: [
      tool(
        "semantic_search",
        d.semantic_search,
        {
          query: z.string().describe(d.semantic_search_query),
          scope: z
            .array(z.enum(["character", "world", "draft", "chapter"]))
            .optional()
            .describe(d.semantic_search_scope),
          limit: z.number().optional().describe(d.semantic_search_limit),
        },
        async (args) => {
          const fullArgs = { ...args, projectId, worldId };
          console.log("[semantic_search] called with:", JSON.stringify(fullArgs));
          console.log("[semantic_search] vectorSearchFn available:", !!vectorSearchFn);
          // Prefer vector search if available, fall back to regex
          if (vectorSearchFn) {
            try {
              const result = await vectorSearchFn(fullArgs);
              console.log("[semantic_search] vector result count:", result.results?.length);
              return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
            } catch (err) {
              console.error("[semantic_search] Vector search failed, falling back to regex:", err);
            }
          }
          const result = await handlers.semanticSearch(fullArgs, db);
          console.log("[semantic_search] regex result count:", (result as any).results?.length);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "update_character",
        d.update_character,
        {
          id: z.string().describe(d.update_character_id),
          name: z.string().optional().describe(d.update_character_name),
          role: z
            .enum(["protagonist", "antagonist", "supporting", "minor", "other"])
            .optional()
            .describe(d.update_character_role),
          importance: z.enum(["core", "major", "minor"]).optional().describe(d.update_character_importance),
          summary: z.string().optional().describe(d.update_character_summary),
          aliases: z.array(z.string()).optional().describe(d.update_character_aliases),
          profile: z
            .object({
              appearance: z.string().optional().describe(d.update_character_appearance),
              personality: z.string().optional().describe(d.update_character_personality),
              background: z.string().optional().describe(d.update_character_background),
              goals: z.string().optional().describe(d.update_character_goals),
            })
            .optional()
            .describe(d.update_character_profile),
        },
        async (args) => {
          const result = await handlers.updateCharacter(args, db);
          onDocumentChanged?.("characters", args.id);
          // Look up the character's worldId to mark summary stale
          const charDoc = await db.collection("characters").findOne({ _id: new ObjectId(args.id) });
          if (charDoc?.worldId) onWorldSummaryStale?.(charDoc.worldId.toHexString());
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "create_character",
        d.create_character,
        {
          name: z.string().describe(d.create_character_name),
          role: z
            .enum(["protagonist", "antagonist", "supporting", "minor", "other"])
            .optional()
            .describe(d.create_character_role),
          importance: z.enum(["core", "major", "minor"]).optional().describe(d.create_character_importance),
          summary: z.string().optional().describe(d.create_character_summary),
          aliases: z.array(z.string()).optional().describe(d.create_character_aliases),
          profile: z
            .object({
              appearance: z.string().optional(),
              personality: z.string().optional(),
              background: z.string().optional(),
              goals: z.string().optional(),
            })
            .optional()
            .describe(d.create_character_profile),
        },
        async (args) => {
          const result = await handlers.createCharacter({ ...args, worldId, projectId }, db, userId);
          if ((result as any)?._id) onDocumentChanged?.("characters", String((result as any)._id));
          if (worldId) onWorldSummaryStale?.(worldId);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "delete_character",
        d.delete_character,
        {
          id: z.string().describe(d.delete_character_id),
        },
        async (args) => {
          const charDoc = await db.collection("characters").findOne({ _id: new ObjectId(args.id) });
          const result = await handlers.deleteCharacter(args, db);
          if (charDoc?.worldId) onWorldSummaryStale?.(charDoc.worldId.toHexString());
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "update_world_setting",
        d.update_world_setting,
        {
          id: z.string().describe(d.update_world_setting_id),
          category: z.string().optional().describe(d.update_world_setting_category),
          title: z.string().optional().describe(d.update_world_setting_title),
          content: z.string().optional().describe(d.update_world_setting_content),
          tags: z.array(z.string()).optional().describe(d.update_world_setting_tags),
          importance: z.enum(["core", "major", "minor"]).optional().describe(d.update_world_setting_importance),
          summary: z.string().optional().describe(d.update_world_setting_summary),
        },
        async (args) => {
          const result = await handlers.updateWorldSetting(args, db);
          onDocumentChanged?.("world_settings", args.id);
          const wsDoc = await db.collection("world_settings").findOne({ _id: new ObjectId(args.id) });
          if (wsDoc?.worldId) onWorldSummaryStale?.(wsDoc.worldId.toHexString());
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "create_world_setting",
        d.create_world_setting,
        {
          category: z.string().describe(d.create_world_setting_category),
          title: z.string().describe(d.create_world_setting_title),
          content: z.string().optional().describe(d.create_world_setting_content),
          tags: z.array(z.string()).optional().describe(d.create_world_setting_tags),
          importance: z.enum(["core", "major", "minor"]).optional().describe(d.create_world_setting_importance),
          summary: z.string().optional().describe(d.create_world_setting_summary),
        },
        async (args) => {
          const result = await handlers.createWorldSetting({ ...args, worldId, projectId }, db, userId);
          if ((result as any)?._id) onDocumentChanged?.("world_settings", String((result as any)._id));
          if (worldId) onWorldSummaryStale?.(worldId);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "delete_world_setting",
        d.delete_world_setting,
        {
          id: z.string().describe(d.delete_world_setting_id),
        },
        async (args) => {
          const wsDoc = await db.collection("world_settings").findOne({ _id: new ObjectId(args.id) });
          const result = await handlers.deleteWorldSetting(args, db);
          if (wsDoc?.worldId) onWorldSummaryStale?.(wsDoc.worldId.toHexString());
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "create_chapter",
        d.create_chapter,
        {
          title: z.string().describe(d.create_chapter_title),
          content: z.string().optional().describe(d.create_chapter_content),
          synopsis: z.string().optional().describe(d.create_chapter_synopsis),
          order: z.number().optional().describe(d.create_chapter_order),
        },
        async (args) => {
          const result = await handlers.createChapter({ ...args, projectId: projectId! }, db, userId);
          if ((result as any)?._id) onDocumentChanged?.("chapters", String((result as any)._id));
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "get_chapter",
        d.get_chapter,
        {
          id: z.string().describe(d.get_chapter_id),
        },
        async (args) => {
          const result = await handlers.getChapter(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "list_chapters",
        d.list_chapters,
        {},
        async () => {
          const result = await handlers.listChapters({ projectId: projectId! }, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "continue_writing",
        d.continue_writing,
        {
          chapterId: z.string().describe(d.continue_writing_chapterId),
          instructions: z.string().optional().describe(d.continue_writing_instructions),
          wordCount: z.number().optional().describe(d.continue_writing_wordCount),
        },
        async (args) => {
          const result = await handlers.continueWriting(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "update_chapter",
        d.update_chapter,
        {
          id: z.string().describe(d.update_chapter_id),
          title: z.string().optional().describe(d.update_chapter_title),
          content: z.string().optional().describe(d.update_chapter_content),
          synopsis: z.string().optional().describe(d.update_chapter_synopsis),
          status: z.enum(["draft", "revision", "final"]).optional().describe(d.update_chapter_status),
          order: z.number().optional().describe(d.update_chapter_order),
        },
        async (args) => {
          const result = await handlers.updateChapter(args, db);
          onDocumentChanged?.("chapters", args.id);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "delete_chapter",
        d.delete_chapter,
        {
          id: z.string().describe(d.delete_chapter_id),
        },
        async (args) => {
          const result = await handlers.deleteChapter(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "get_draft",
        d.get_draft,
        {
          id: z.string().describe(d.get_draft_id),
        },
        async (args) => {
          const result = await handlers.getDraft(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "create_draft",
        d.create_draft,
        {
          title: z.string().describe(d.create_draft_title),
          content: z.string().optional().describe(d.create_draft_content),
          tags: z.array(z.string()).optional().describe(d.create_draft_tags),
          linkedCharacters: z.array(z.string()).optional().describe(d.create_draft_linkedCharacters),
          linkedWorldSettings: z.array(z.string()).optional().describe(d.create_draft_linkedWorldSettings),
        },
        async (args) => {
          const result = await handlers.createDraft({ ...args, projectId, worldId }, db, userId);
          if ((result as any)?._id) onDocumentChanged?.("drafts", String((result as any)._id));
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "delete_draft",
        d.delete_draft,
        {
          id: z.string().describe(d.delete_draft_id),
        },
        async (args) => {
          const result = await handlers.deleteDraft(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "update_memory",
        d.update_memory,
        {
          content: z.string().describe(d.update_memory_content),
        },
        async (args) => {
          const result = await handlers.updateMemory({ ...args, worldId: worldId! }, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "generate_synopsis",
        d.generate_synopsis,
        {
          chapterId: z.string().describe(d.generate_synopsis_chapterId),
        },
        async (args) => {
          const result = await handlers.generateSynopsis(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),
    ],
  });
}
