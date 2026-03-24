import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
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

function textResult(data: unknown): AgentToolResult<undefined> {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    details: undefined,
  };
}

export function createNovelTools(db: Db, vectorSearchFn?: VectorSearchFn, onDocumentChanged?: OnDocumentChangedFn, userId?: string, onWorldSummaryStale?: OnWorldSummaryStaleFn, locale: Locale = "zh", worldId?: string, projectId?: string): AgentTool<any>[] {
  const d = t(locale).tools;

  return [
    {
      name: "semantic_search",
      label: "Semantic Search",
      description: d.semantic_search,
      parameters: Type.Object({
        query: Type.String({ description: d.semantic_search_query }),
        scope: Type.Optional(Type.Array(
          StringEnum(["character", "world", "draft", "chapter"] as const),
          { description: d.semantic_search_scope },
        )),
        limit: Type.Optional(Type.Number({ description: d.semantic_search_limit })),
      }),
      async execute(_toolCallId, args) {
        const fullArgs = { ...args, projectId, worldId };
        console.log("[semantic_search] called with:", JSON.stringify(fullArgs));
        console.log("[semantic_search] vectorSearchFn available:", !!vectorSearchFn);
        if (vectorSearchFn) {
          try {
            const result = await vectorSearchFn(fullArgs);
            console.log("[semantic_search] vector result count:", result.results?.length);
            return textResult(result);
          } catch (err) {
            console.error("[semantic_search] Vector search failed, falling back to regex:", err);
          }
        }
        const result = await handlers.semanticSearch(fullArgs, db);
        console.log("[semantic_search] regex result count:", (result as any).results?.length);
        return textResult(result);
      },
    },

    {
      name: "update_character",
      label: "Update Character",
      description: d.update_character,
      parameters: Type.Object({
        id: Type.String({ description: d.update_character_id }),
        name: Type.Optional(Type.String({ description: d.update_character_name })),
        role: Type.Optional(StringEnum(
          ["protagonist", "antagonist", "supporting", "minor", "other"] as const,
          { description: d.update_character_role },
        )),
        importance: Type.Optional(StringEnum(
          ["core", "major", "minor"] as const,
          { description: d.update_character_importance },
        )),
        summary: Type.Optional(Type.String({ description: d.update_character_summary })),
        aliases: Type.Optional(Type.Array(Type.String(), { description: d.update_character_aliases })),
        profile: Type.Optional(Type.Object({
          appearance: Type.Optional(Type.String({ description: d.update_character_appearance })),
          personality: Type.Optional(Type.String({ description: d.update_character_personality })),
          background: Type.Optional(Type.String({ description: d.update_character_background })),
          goals: Type.Optional(Type.String({ description: d.update_character_goals })),
        }, { description: d.update_character_profile })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.updateCharacter(args, db);
        onDocumentChanged?.("characters", args.id);
        const charDoc = await db.collection("characters").findOne({ _id: new ObjectId(args.id) });
        if (charDoc?.worldId) onWorldSummaryStale?.(charDoc.worldId.toHexString());
        return textResult(result);
      },
    },

    {
      name: "create_character",
      label: "Create Character",
      description: d.create_character,
      parameters: Type.Object({
        name: Type.String({ description: d.create_character_name }),
        role: Type.Optional(StringEnum(
          ["protagonist", "antagonist", "supporting", "minor", "other"] as const,
          { description: d.create_character_role },
        )),
        importance: Type.Optional(StringEnum(
          ["core", "major", "minor"] as const,
          { description: d.create_character_importance },
        )),
        summary: Type.Optional(Type.String({ description: d.create_character_summary })),
        aliases: Type.Optional(Type.Array(Type.String(), { description: d.create_character_aliases })),
        profile: Type.Optional(Type.Object({
          appearance: Type.Optional(Type.String()),
          personality: Type.Optional(Type.String()),
          background: Type.Optional(Type.String()),
          goals: Type.Optional(Type.String()),
        }, { description: d.create_character_profile })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.createCharacter({ ...args, worldId, projectId }, db, userId);
        if ((result as any)?._id) onDocumentChanged?.("characters", String((result as any)._id));
        if (worldId) onWorldSummaryStale?.(worldId);
        return textResult(result);
      },
    },

    {
      name: "delete_character",
      label: "Delete Character",
      description: d.delete_character,
      parameters: Type.Object({
        id: Type.String({ description: d.delete_character_id }),
      }),
      async execute(_toolCallId, args) {
        const charDoc = await db.collection("characters").findOne({ _id: new ObjectId(args.id) });
        const result = await handlers.deleteCharacter(args, db);
        if (charDoc?.worldId) onWorldSummaryStale?.(charDoc.worldId.toHexString());
        return textResult(result);
      },
    },

    {
      name: "update_world_setting",
      label: "Update World Setting",
      description: d.update_world_setting,
      parameters: Type.Object({
        id: Type.String({ description: d.update_world_setting_id }),
        category: Type.Optional(Type.String({ description: d.update_world_setting_category })),
        title: Type.Optional(Type.String({ description: d.update_world_setting_title })),
        content: Type.Optional(Type.String({ description: d.update_world_setting_content })),
        tags: Type.Optional(Type.Array(Type.String(), { description: d.update_world_setting_tags })),
        importance: Type.Optional(StringEnum(
          ["core", "major", "minor"] as const,
          { description: d.update_world_setting_importance },
        )),
        summary: Type.Optional(Type.String({ description: d.update_world_setting_summary })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.updateWorldSetting(args, db);
        onDocumentChanged?.("world_settings", args.id);
        const wsDoc = await db.collection("world_settings").findOne({ _id: new ObjectId(args.id) });
        if (wsDoc?.worldId) onWorldSummaryStale?.(wsDoc.worldId.toHexString());
        return textResult(result);
      },
    },

    {
      name: "create_world_setting",
      label: "Create World Setting",
      description: d.create_world_setting,
      parameters: Type.Object({
        category: Type.String({ description: d.create_world_setting_category }),
        title: Type.String({ description: d.create_world_setting_title }),
        content: Type.Optional(Type.String({ description: d.create_world_setting_content })),
        tags: Type.Optional(Type.Array(Type.String(), { description: d.create_world_setting_tags })),
        importance: Type.Optional(StringEnum(
          ["core", "major", "minor"] as const,
          { description: d.create_world_setting_importance },
        )),
        summary: Type.Optional(Type.String({ description: d.create_world_setting_summary })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.createWorldSetting({ ...args, worldId, projectId }, db, userId);
        if ((result as any)?._id) onDocumentChanged?.("world_settings", String((result as any)._id));
        if (worldId) onWorldSummaryStale?.(worldId);
        return textResult(result);
      },
    },

    {
      name: "delete_world_setting",
      label: "Delete World Setting",
      description: d.delete_world_setting,
      parameters: Type.Object({
        id: Type.String({ description: d.delete_world_setting_id }),
      }),
      async execute(_toolCallId, args) {
        const wsDoc = await db.collection("world_settings").findOne({ _id: new ObjectId(args.id) });
        const result = await handlers.deleteWorldSetting(args, db);
        if (wsDoc?.worldId) onWorldSummaryStale?.(wsDoc.worldId.toHexString());
        return textResult(result);
      },
    },

    {
      name: "create_chapter",
      label: "Create Chapter",
      description: d.create_chapter,
      parameters: Type.Object({
        title: Type.String({ description: d.create_chapter_title }),
        content: Type.Optional(Type.String({ description: d.create_chapter_content })),
        synopsis: Type.Optional(Type.String({ description: d.create_chapter_synopsis })),
        order: Type.Optional(Type.Number({ description: d.create_chapter_order })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.createChapter({ ...args, projectId: projectId! }, db, userId);
        if ((result as any)?._id) onDocumentChanged?.("chapters", String((result as any)._id));
        return textResult(result);
      },
    },

    {
      name: "get_chapter",
      label: "Get Chapter",
      description: d.get_chapter,
      parameters: Type.Object({
        id: Type.String({ description: d.get_chapter_id }),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.getChapter(args, db);
        return textResult(result);
      },
    },

    {
      name: "list_chapters",
      label: "List Chapters",
      description: d.list_chapters,
      parameters: Type.Object({}),
      async execute() {
        const result = await handlers.listChapters({ projectId: projectId! }, db);
        return textResult(result);
      },
    },

    {
      name: "continue_writing",
      label: "Continue Writing",
      description: d.continue_writing,
      parameters: Type.Object({
        chapterId: Type.String({ description: d.continue_writing_chapterId }),
        instructions: Type.Optional(Type.String({ description: d.continue_writing_instructions })),
        wordCount: Type.Optional(Type.Number({ description: d.continue_writing_wordCount })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.continueWriting(args, db);
        return textResult(result);
      },
    },

    {
      name: "update_chapter",
      label: "Update Chapter",
      description: d.update_chapter,
      parameters: Type.Object({
        id: Type.String({ description: d.update_chapter_id }),
        title: Type.Optional(Type.String({ description: d.update_chapter_title })),
        content: Type.Optional(Type.String({ description: d.update_chapter_content })),
        synopsis: Type.Optional(Type.String({ description: d.update_chapter_synopsis })),
        status: Type.Optional(StringEnum(
          ["draft", "revision", "final"] as const,
          { description: d.update_chapter_status },
        )),
        order: Type.Optional(Type.Number({ description: d.update_chapter_order })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.updateChapter(args, db);
        onDocumentChanged?.("chapters", args.id);
        return textResult(result);
      },
    },

    {
      name: "delete_chapter",
      label: "Delete Chapter",
      description: d.delete_chapter,
      parameters: Type.Object({
        id: Type.String({ description: d.delete_chapter_id }),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.deleteChapter(args, db);
        return textResult(result);
      },
    },

    {
      name: "get_draft",
      label: "Get Draft",
      description: d.get_draft,
      parameters: Type.Object({
        id: Type.String({ description: d.get_draft_id }),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.getDraft(args, db);
        return textResult(result);
      },
    },

    {
      name: "create_draft",
      label: "Create Draft",
      description: d.create_draft,
      parameters: Type.Object({
        title: Type.String({ description: d.create_draft_title }),
        content: Type.Optional(Type.String({ description: d.create_draft_content })),
        tags: Type.Optional(Type.Array(Type.String(), { description: d.create_draft_tags })),
        linkedCharacters: Type.Optional(Type.Array(Type.String(), { description: d.create_draft_linkedCharacters })),
        linkedWorldSettings: Type.Optional(Type.Array(Type.String(), { description: d.create_draft_linkedWorldSettings })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.createDraft({ ...args, projectId, worldId }, db, userId);
        if ((result as any)?._id) onDocumentChanged?.("drafts", String((result as any)._id));
        return textResult(result);
      },
    },

    {
      name: "delete_draft",
      label: "Delete Draft",
      description: d.delete_draft,
      parameters: Type.Object({
        id: Type.String({ description: d.delete_draft_id }),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.deleteDraft(args, db);
        return textResult(result);
      },
    },

    {
      name: "update_memory",
      label: "Update Memory",
      description: d.update_memory,
      parameters: Type.Object({
        content: Type.String({ description: d.update_memory_content }),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.updateMemory({ ...args, worldId: worldId! }, db);
        return textResult(result);
      },
    },

    {
      name: "generate_synopsis",
      label: "Generate Synopsis",
      description: d.generate_synopsis,
      parameters: Type.Object({
        chapterId: Type.String({ description: d.generate_synopsis_chapterId }),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.generateSynopsis(args, db);
        return textResult(result);
      },
    },
  ];
}
