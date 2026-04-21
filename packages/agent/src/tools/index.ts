import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { ObjectId, type Db } from "mongodb";
import * as handlers from "./handlers.js";
import { t, type Locale } from "../i18n.js";
import { type SkillData } from "../skills.js";

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

type SearchResult = { collection: string; id: string; title: string; excerpt: string; score: number };

function rrfMerge(rankedLists: SearchResult[][], k = 60): SearchResult[] {
  const merged = new Map<string, { result: SearchResult; rrfScore: number }>();
  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const contribution = 1 / (k + rank + 1);
      const existing = merged.get(item.id);
      if (existing) {
        existing.rrfScore += contribution;
        if (item.score > existing.result.score) existing.result = item;
      } else {
        merged.set(item.id, { result: item, rrfScore: contribution });
      }
    }
  }
  return Array.from(merged.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(({ result, rrfScore }) => ({ ...result, score: rrfScore }));
}

const MAX_SEARCH_SKILLS_CALLS = 3;

export function createNovelTools(db: Db, vectorSearchFn?: VectorSearchFn, onDocumentChanged?: OnDocumentChangedFn, userId?: string, onWorldSummaryStale?: OnWorldSummaryStaleFn, locale: Locale = "zh", worldId?: string, projectId?: string, skills?: SkillData[], skillCollection: string = "skills"): AgentTool<any>[] {
  const d = t(locale).tools;
  const skillScope = skillCollection === "skill_drafts" ? "skill_draft" : "skill";
  let searchSkillsCallCount = 0;

  const tools: AgentTool<any>[] = [
    {
      name: "semantic_search",
      label: "Semantic Search",
      description: d.semantic_search,
      parameters: Type.Object({
        query: Type.Union([
          Type.String({ description: d.semantic_search_query }),
          Type.Array(Type.String(), { maxItems: 5, description: d.semantic_search_query }),
        ], { description: d.semantic_search_query }),
        scope: Type.Optional(Type.Array(
          StringEnum(["character", "world", "draft", "chapter"] as const),
          { description: d.semantic_search_scope },
        )),
        limit: Type.Optional(Type.Number({ description: d.semantic_search_limit })),
      }),
      async execute(_toolCallId, args) {
        const queries: string[] = (typeof args.query === "string" ? [args.query] : args.query).slice(0, 5);
        const limit = args.limit ?? 15;
        const baseArgs = { scope: args.scope, limit, projectId, worldId };

        console.log("[semantic_search] called with", queries.length, "queries:", JSON.stringify(queries));

        const resultLists = await Promise.all(
          queries.map(async (q): Promise<SearchResult[]> => {
            const fullArgs = { ...baseArgs, query: q };
            if (vectorSearchFn) {
              try {
                const result = await vectorSearchFn(fullArgs);
                return result.results;
              } catch (err) {
                console.error("[semantic_search] Vector search failed for query, falling back to regex:", q, err);
              }
            }
            const result = await handlers.semanticSearch(fullArgs, db) as { results: SearchResult[]; total: number };
            return result.results.map((r, i) => ({ ...r, score: r.score ?? (1 - i * 0.01) }));
          })
        );

        if (queries.length === 1) {
          const results = resultLists[0];
          return textResult({ results, total: results.length });
        }

        const merged = rrfMerge(resultLists).slice(0, limit);
        console.log("[semantic_search] merged:", merged.length, "results from", queries.length, "queries");
        return textResult({ results: merged, total: merged.length });
      },
    },

    {
      name: "update_character",
      label: "Update Character",
      description: d.update_character,
      parameters: Type.Object({
        id: Type.String({ description: d.update_character_id }),
        name: Type.Optional(Type.String({ description: d.update_character_name })),
        importance: Type.Optional(StringEnum(
          ["core", "major", "minor"] as const,
          { description: d.update_character_importance },
        )),
        summary: Type.Optional(Type.String({ description: d.update_character_summary })),
        aliases: Type.Optional(Type.Array(Type.String(), { description: d.update_character_aliases })),
        tags: Type.Optional(Type.Array(Type.String(), { description: d.update_character_tags })),
        content: Type.Optional(Type.String({ description: d.update_character_content })),
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
        importance: Type.Optional(StringEnum(
          ["core", "major", "minor"] as const,
          { description: d.create_character_importance },
        )),
        summary: Type.Optional(Type.String({ description: d.create_character_summary })),
        aliases: Type.Optional(Type.Array(Type.String(), { description: d.create_character_aliases })),
        tags: Type.Optional(Type.Array(Type.String(), { description: d.create_character_tags })),
        content: Type.Optional(Type.String({ description: d.create_character_content })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.createCharacter({ ...args, worldId, projectId }, db, userId);
        if ((result as any)?._id) onDocumentChanged?.("characters", String((result as any)._id));
        if (worldId) onWorldSummaryStale?.(worldId);
        return textResult(result);
      },
    },

    {
      name: "get_entity",
      label: "Get Entity",
      description: d.get_entity,
      parameters: Type.Object({
        type: StringEnum(["character", "world_setting", "draft", "chapter"] as const, { description: d.get_entity_type }),
        id: Type.String({ description: d.get_entity_id }),
      }),
      async execute(_toolCallId, args) {
        switch (args.type) {
          case "character": return textResult(await handlers.getCharacter(args, db));
          case "world_setting": return textResult(await handlers.getWorldSetting(args, db));
          case "draft": return textResult(await handlers.getDraft(args, db));
          default: return textResult(await handlers.getChapter(args, db));
        }
      },
    },

    {
      name: "delete_entity",
      label: "Delete Entity",
      description: d.delete_entity,
      parameters: Type.Object({
        type: StringEnum(["character", "world_setting", "draft", "chapter"] as const, { description: d.delete_entity_type }),
        id: Type.String({ description: d.delete_entity_id }),
      }),
      async execute(_toolCallId, args) {
        switch (args.type) {
          case "character": {
            const charDoc = await db.collection("characters").findOne({ _id: new ObjectId(args.id) });
            const result = await handlers.deleteCharacter(args, db);
            if (charDoc?.worldId) onWorldSummaryStale?.(charDoc.worldId.toHexString());
            return textResult(result);
          }
          case "world_setting": {
            const wsDoc = await db.collection("world_settings").findOne({ _id: new ObjectId(args.id) });
            const result = await handlers.deleteWorldSetting(args, db);
            if (wsDoc?.worldId) onWorldSummaryStale?.(wsDoc.worldId.toHexString());
            return textResult(result);
          }
          case "draft":
            return textResult(await handlers.deleteDraft(args, db));
          default:
            return textResult(await handlers.deleteChapter(args, db));
        }
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
      name: "update_chapter",
      label: "Update Chapter",
      description: d.update_chapter,
      parameters: Type.Object({
        id: Type.String({ description: d.update_chapter_id }),
        new_string: Type.String({ description: d.update_chapter_new_string }),
        old_string: Type.Optional(Type.String({ description: d.update_chapter_old_string })),
        field: Type.Optional(Type.String({ description: d.update_chapter_field })),
        append: Type.Optional(Type.Boolean({ description: d.update_chapter_append })),
        prepend: Type.Optional(Type.Boolean({ description: d.update_chapter_prepend })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.updateChapter(args, db);
        onDocumentChanged?.("chapters", args.id);
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
      name: "update_draft",
      label: "Update Draft",
      description: d.update_draft,
      parameters: Type.Object({
        id: Type.String({ description: d.update_draft_id }),
        title: Type.Optional(Type.String({ description: d.update_draft_title })),
        content: Type.Optional(Type.String({ description: d.update_draft_content })),
        tags: Type.Optional(Type.Array(Type.String(), { description: d.update_draft_tags })),
        linkedCharacters: Type.Optional(Type.Array(Type.String(), { description: d.update_draft_linkedCharacters })),
        linkedWorldSettings: Type.Optional(Type.Array(Type.String(), { description: d.update_draft_linkedWorldSettings })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.updateDraft(args, db);
        onDocumentChanged?.("drafts", args.id);
        return textResult(result);
      },
    },


    {
      name: "update_memory",
      label: "Update Memory",
      description: d.update_memory,
      parameters: Type.Object({
        content: Type.String({ description: d.update_memory_content }),
        scope: Type.Optional(StringEnum(
          ["world", "project"] as const,
          { description: d.update_memory_scope },
        )),
      }),
      async execute(_toolCallId, args) {
        const scope = args.scope ?? (projectId ? "project" : "world");
        const result = await handlers.updateMemory({ content: args.content, scope, worldId, projectId }, db);
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

    {
      name: "search_skills",
      label: "Search Skills",
      description: d.search_skills,
      parameters: Type.Object({
        query: Type.Union([
          Type.String({ description: d.search_skills_query }),
          Type.Array(Type.String(), { maxItems: 5, description: d.search_skills_query }),
        ], { description: d.search_skills_query }),
        limit: Type.Optional(Type.Number({ description: d.search_skills_limit })),
      }),
      async execute(_toolCallId, args) {
        if (searchSkillsCallCount >= MAX_SEARCH_SKILLS_CALLS) {
          return textResult({
            error: `search_skills 已达本轮调用上限（${MAX_SEARCH_SKILLS_CALLS} 次）。请基于已有结果做决策，不要继续搜索。`,
          });
        }
        searchSkillsCallCount++;

        const queries: string[] = (typeof args.query === "string" ? [args.query] : args.query).slice(0, 5);
        const limit = args.limit ?? 10;

        console.log("[search_skills] call", searchSkillsCallCount, "with", queries.length, "queries:", JSON.stringify(queries));

        const resultLists = await Promise.all(
          queries.map(async (q): Promise<SearchResult[]> => {
            if (vectorSearchFn) {
              try {
                const result = await vectorSearchFn({ query: q, scope: [skillScope], limit });
                return result.results;
              } catch (err) {
                console.error("[search_skills] Vector search failed for query, falling back to regex:", q, err);
              }
            }
            const result = await handlers.searchSkills({ query: q, limit }, db, skillCollection) as { results: SearchResult[]; total: number };
            return result.results.map((r, i) => ({ ...r, score: r.score ?? (1 - i * 0.01) }));
          })
        );

        const ranked = queries.length === 1 ? resultLists[0] : rrfMerge(resultLists).slice(0, limit);

        // Fetch full docs by _id and return all fields
        const ids = ranked.map((r) => new ObjectId(r.id));
        const fullDocs = ids.length === 0 ? [] : await db
          .collection(skillCollection)
          .find({ _id: { $in: ids } })
          .project({ embedding: 0, embeddingText: 0, embeddingUpdatedAt: 0 })
          .toArray();
        const docMap = new Map(fullDocs.map((d) => [d._id.toHexString(), d]));

        const results = ranked
          .map((r) => {
            const doc = docMap.get(r.id);
            if (!doc) return null;
            return {
              _id: doc._id.toHexString(),
              slug: doc.slug,
              name: doc.name,
              description: doc.description,
              tags: doc.tags ?? [],
              content: doc.content,
              score: r.score,
            };
          })
          .filter(Boolean);

        console.log("[search_skills] returning", results.length, "results with full content");
        return textResult({ results, total: results.length });
      },
    },

    {
      name: "create_skill",
      label: "Create Skill",
      description: d.create_skill,
      parameters: Type.Object({
        slug: Type.String({ description: d.create_skill_slug }),
        name: Type.String({ description: d.create_skill_name }),
        description: Type.String({ description: d.create_skill_description }),
        content: Type.String({ description: d.create_skill_content }),
        tags: Type.Optional(Type.Array(Type.String(), { description: d.create_skill_tags })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.createSkill(args, db, userId, skillCollection);
        if ((result as any)?._id) onDocumentChanged?.(skillCollection, String((result as any)._id));
        return textResult(result);
      },
    },

    {
      name: "update_skill",
      label: "Update Skill",
      description: d.update_skill,
      parameters: Type.Object({
        id: Type.String({ description: d.update_skill_id }),
        slug: Type.Optional(Type.String({ description: d.update_skill_slug })),
        name: Type.Optional(Type.String({ description: d.update_skill_name })),
        description: Type.Optional(Type.String({ description: d.update_skill_description })),
        content: Type.Optional(Type.String({ description: d.update_skill_content })),
        tags: Type.Optional(Type.Array(Type.String(), { description: d.update_skill_tags })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.updateSkill(args, db, skillCollection);
        onDocumentChanged?.(skillCollection, args.id);
        return textResult(result);
      },
    },

    {
      name: "delete_skill",
      label: "Delete Skill",
      description: d.delete_skill,
      parameters: Type.Object({
        id: Type.String({ description: d.delete_skill_id }),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.deleteSkill(args, db, skillCollection);
        return textResult(result);
      },
    },
  ];

  // Add invoke_skill tool if skills are available
  if (skills && skills.length > 0) {
    tools.push({
      name: "invoke_skill",
      label: "Invoke Skill",
      description: d.invoke_skill,
      parameters: Type.Object({
        skill_name: StringEnum(
          skills.map(s => s.slug) as [string, ...string[]],
          { description: d.invoke_skill_skill_name },
        ),
      }),
      async execute(_toolCallId, toolArgs) {
        const skill = skills.find(s => s.slug === toolArgs.skill_name);
        if (!skill) {
          return textResult({ error: `Unknown skill: ${toolArgs.skill_name}` });
        }
        return {
          content: [{ type: "text", text: skill.content }],
          details: undefined,
        };
      },
    });
  }

  return tools;
}
