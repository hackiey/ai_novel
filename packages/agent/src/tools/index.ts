import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { ObjectId, type Db } from "mongodb";
import * as handlers from "./handlers.js";
import { t, type Locale } from "../i18n.js";
import { type SkillData } from "../skills.js";
import { QuestionManager, QuestionRejectedError } from "../questionManager.js";

export type VectorSearchFn = (args: {
  projectId?: string;
  worldId?: string;
  query: string;
  scope?: string[];
  limit?: number;
  /**
   * Restrict results to documents owned by this user. Implementations should
   * post-filter (or filter at the index level if userId is in the vector index)
   * to enforce tenant isolation.
   */
  userId?: string;
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

export function createNovelTools(db: Db, vectorSearchFn?: VectorSearchFn, onDocumentChanged?: OnDocumentChangedFn, userId?: string, onWorldSummaryStale?: OnWorldSummaryStaleFn, locale: Locale = "zh", worldId?: string, projectId?: string, skills?: SkillData[], skillCollection: string = "skills", questionManager?: QuestionManager, sessionId?: string): AgentTool<any>[] {
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
        // Default scope must be applied here (not deeper) because the vector
        // path forwards `scope` straight to embeddingService.vectorSearch,
        // which falls back to ALL embeddable collections (including skills /
        // skill_drafts) when scope is undefined. semantic_search is for novel
        // content; skills have their own search_skills tool.
        const scope = args.scope ?? ["character", "world", "draft", "chapter"];
        const baseArgs = { scope, limit, projectId, worldId, userId };

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
            const result = await handlers.semanticSearch(fullArgs, db, userId) as { results: SearchResult[]; total: number };
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
      name: "update",
      label: "Update",
      description: d.update,
      parameters: Type.Object({
        type: StringEnum(["character", "world_setting", "chapter", "draft"] as const, { description: d.update_type }),
        id: Type.String({ description: d.update_id }),
        new_string: Type.String({ description: d.update_new_string }),
        old_string: Type.Optional(Type.String({ description: d.update_old_string })),
        field: Type.Optional(StringEnum(["name", "content", "tags", "importance", "summary"] as const, { description: d.update_field })),
        append: Type.Optional(Type.Boolean({ description: d.update_append })),
        prepend: Type.Optional(Type.Boolean({ description: d.update_prepend })),
      }),
      async execute(_toolCallId, args) {
        // Per-type field whitelist (LLM-facing names — `name` maps to DB `title`
        // for ws/chapter/draft below).
        const allowedByType: Record<string, string[]> = {
          character: ["name", "content", "tags", "importance", "summary"],
          world_setting: ["name", "content", "tags", "importance", "summary"],
          chapter: ["name", "content"],
          draft: ["name", "content", "tags"],
        };
        const allowed = allowedByType[args.type];
        if (!allowed) return textResult({ error: `Unknown update type: ${args.type}` });
        const llmField = args.field ?? "content";
        if (!allowed.includes(llmField)) {
          return textResult({ error: `Field "${llmField}" is not editable on type "${args.type}". Allowed: ${allowed.join(", ")}` });
        }
        // Map name → title for entities whose DB column is `title`.
        const dbField =
          llmField === "name" && args.type !== "character" ? "title" : llmField;
        const handlerArgs = {
          id: args.id,
          old_string: args.old_string,
          new_string: args.new_string,
          field: dbField,
          append: args.append,
          prepend: args.prepend,
        };

        switch (args.type) {
          case "character": {
            const result = await handlers.updateCharacter(handlerArgs, db, userId);
            onDocumentChanged?.("characters", args.id);
            const charDoc = await db.collection("characters").findOne({ _id: new ObjectId(args.id) });
            if (charDoc?.worldId) onWorldSummaryStale?.(charDoc.worldId.toHexString());
            return textResult(result);
          }
          case "world_setting": {
            const result = await handlers.updateWorldSetting(handlerArgs, db, userId);
            onDocumentChanged?.("world_settings", args.id);
            const wsDoc = await db.collection("world_settings").findOne({ _id: new ObjectId(args.id) });
            if (wsDoc?.worldId) onWorldSummaryStale?.(wsDoc.worldId.toHexString());
            return textResult(result);
          }
          case "chapter": {
            const result = await handlers.updateChapter(handlerArgs, db, userId);
            onDocumentChanged?.("chapters", args.id);
            return textResult(result);
          }
          case "draft": {
            const result = await handlers.updateDraft(handlerArgs, db, userId);
            onDocumentChanged?.("drafts", args.id);
            return textResult(result);
          }
          default:
            return textResult({ error: `Unknown update type: ${(args as any).type}` });
        }
      },
    },

    {
      name: "write",
      label: "Write",
      description: d.write,
      parameters: Type.Object({
        type: StringEnum(["character", "world_setting", "chapter", "draft"] as const, { description: d.write_type }),
        id: Type.Optional(Type.String({ description: d.write_id })),
        name: Type.Optional(Type.String({ description: d.write_name })),
        summary: Type.Optional(Type.String({ description: d.write_summary })),
        content: Type.Optional(Type.String({ description: d.write_content })),
        tags: Type.Optional(Type.String({ description: d.write_tags })),
        importance: Type.Optional(StringEnum(["core", "major", "minor"] as const, { description: d.write_importance })),
        scope: Type.Optional(StringEnum(["world", "project"] as const, { description: d.write_scope })),
      }),
      async execute(_toolCallId, args) {
        // tags is exposed as a comma-joined string for symmetry with `update`;
        // parse to string[] before handing to the handlers.
        const tagsArr: string[] | undefined = args.tags === undefined
          ? undefined
          : args.tags.split(",").map((s: string) => s.trim()).filter(Boolean);
        switch (args.type) {
          case "character": {
            if (!args.name) return textResult({ error: "write(character): 'name' is required." });
            if (!args.summary) return textResult({ error: "write(character): 'summary' is required (one-line summary, ≤50 chars). It must reflect the character's content; keep them in sync on every write." });
            if (args.id) {
              const result = await handlers.overwriteCharacter(
                { id: args.id, name: args.name, summary: args.summary, importance: args.importance, tags: tagsArr, content: args.content },
                db,
                userId,
              );
              if ((result as any)?._id) onDocumentChanged?.("characters", String((result as any)._id));
              const charDoc = await db.collection("characters").findOne({ _id: new ObjectId(args.id) });
              if (charDoc?.worldId) onWorldSummaryStale?.(charDoc.worldId.toHexString());
              return textResult(result);
            }
            const scope = args.scope ?? "world";
            if (!worldId) {
              return textResult({ error: "Cannot create a character: no world context." });
            }
            if (scope === "project" && !projectId) {
              return textResult({ error: "Cannot create a project-scoped character: no project context. Use scope=\"world\" or open the chat under a specific project." });
            }
            const ownerProjectId = scope === "project" ? projectId : undefined;
            const result = await handlers.createCharacter(
              { name: args.name, summary: args.summary, importance: args.importance, tags: tagsArr, content: args.content, worldId, projectId: ownerProjectId },
              db,
              userId,
            );
            if ((result as any)?._id) onDocumentChanged?.("characters", String((result as any)._id));
            if (worldId) onWorldSummaryStale?.(worldId);
            return textResult(result);
          }
          case "world_setting": {
            if (!args.name) return textResult({ error: "write(world_setting): 'name' is required (used as the setting title)." });
            if (!args.summary) return textResult({ error: "write(world_setting): 'summary' is required (one-line summary, ≤50 chars). It must reflect the setting's content; keep them in sync on every write." });
            if (args.id) {
              const result = await handlers.overwriteWorldSetting(
                { id: args.id, title: args.name, summary: args.summary, content: args.content, tags: tagsArr, importance: args.importance },
                db,
                userId,
              );
              if ((result as any)?._id) onDocumentChanged?.("world_settings", String((result as any)._id));
              const wsDoc = await db.collection("world_settings").findOne({ _id: new ObjectId(args.id) });
              if (wsDoc?.worldId) onWorldSummaryStale?.(wsDoc.worldId.toHexString());
              return textResult(result);
            }
            const scope = args.scope ?? "world";
            if (!worldId) {
              return textResult({ error: "Cannot create a world setting: no world context." });
            }
            if (scope === "project" && !projectId) {
              return textResult({ error: "Cannot create a project-scoped world setting: no project context. Use scope=\"world\" or open the chat under a specific project." });
            }
            const ownerProjectId = scope === "project" ? projectId : undefined;
            const result = await handlers.createWorldSetting(
              { title: args.name, summary: args.summary, content: args.content, tags: tagsArr, importance: args.importance, worldId, projectId: ownerProjectId },
              db,
              userId,
            );
            if ((result as any)?._id) onDocumentChanged?.("world_settings", String((result as any)._id));
            if (worldId) onWorldSummaryStale?.(worldId);
            return textResult(result);
          }
          case "chapter": {
            if (!args.name) return textResult({ error: "write(chapter): 'name' is required (used as the chapter title)." });
            if (args.id) {
              const result = await handlers.overwriteChapter(
                { id: args.id, title: args.name, content: args.content },
                db,
                userId,
              );
              if ((result as any)?._id) onDocumentChanged?.("chapters", String((result as any)._id));
              return textResult(result);
            }
            if (!projectId) return textResult({ error: "Cannot create a chapter: no project context." });
            const result = await handlers.createChapter(
              { title: args.name, content: args.content, projectId },
              db,
              userId,
            );
            if ((result as any)?._id) onDocumentChanged?.("chapters", String((result as any)._id));
            return textResult(result);
          }
          case "draft": {
            if (!args.name) return textResult({ error: "write(draft): 'name' is required (used as the draft title)." });
            if (args.id) {
              const result = await handlers.overwriteDraft(
                { id: args.id, title: args.name, content: args.content, tags: tagsArr },
                db,
                userId,
              );
              if ((result as any)?._id) onDocumentChanged?.("drafts", String((result as any)._id));
              return textResult(result);
            }
            const scope = args.scope ?? "world";
            if (!worldId) {
              return textResult({ error: "Cannot create a draft: no world context." });
            }
            if (scope === "project" && !projectId) {
              return textResult({ error: "Cannot create a project-scoped draft: no project context. Use scope=\"world\" or open the chat under a specific project." });
            }
            const ownerIds = scope === "project" ? { worldId, projectId } : { worldId };
            const result = await handlers.createDraft(
              { title: args.name, content: args.content, tags: tagsArr, ...ownerIds },
              db,
              userId,
            );
            if ((result as any)?._id) onDocumentChanged?.("drafts", String((result as any)._id));
            return textResult(result);
          }
          default:
            return textResult({ error: `Unknown write type: ${(args as any).type}` });
        }
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
          case "character": return textResult(await handlers.getCharacter(args, db, userId));
          case "world_setting": return textResult(await handlers.getWorldSetting(args, db, userId));
          case "draft": return textResult(await handlers.getDraft(args, db, userId));
          default: return textResult(await handlers.getChapter(args, db, userId));
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
            const result = await handlers.deleteCharacter(args, db, userId);
            if (charDoc?.worldId) onWorldSummaryStale?.(charDoc.worldId.toHexString());
            return textResult(result);
          }
          case "world_setting": {
            const wsDoc = await db.collection("world_settings").findOne({ _id: new ObjectId(args.id) });
            const result = await handlers.deleteWorldSetting(args, db, userId);
            if (wsDoc?.worldId) onWorldSummaryStale?.(wsDoc.worldId.toHexString());
            return textResult(result);
          }
          case "draft":
            return textResult(await handlers.deleteDraft(args, db, userId));
          default:
            return textResult(await handlers.deleteChapter(args, db, userId));
        }
      },
    },

    {
      name: "list",
      label: "List",
      description: d.list,
      parameters: Type.Object({
        type: StringEnum(["character", "world_setting", "draft", "chapter"] as const, { description: d.list_type }),
        projectId: Type.Optional(Type.String({ description: d.list_projectId })),
        worldId: Type.Optional(Type.String({ description: d.list_worldId })),
        limit: Type.Optional(Type.Number({ description: d.list_limit })),
      }),
      async execute(_toolCallId, args) {
        const result = await handlers.listEntities(
          {
            type: args.type,
            projectId: args.projectId ?? projectId,
            worldId: args.worldId ?? worldId,
            limit: args.limit,
          },
          db,
          userId,
        );
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
        const result = await handlers.updateMemory({ content: args.content, scope, worldId, projectId }, db, userId);
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
        const result = await handlers.generateSynopsis(args, db, userId);
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
      name: "propose_skills",
      label: "Propose Skills",
      description: d.propose_skills,
      parameters: Type.Object({
        skill_slugs: Type.Array(Type.String(), { minItems: 1, maxItems: 20, description: d.propose_skills_skill_slugs }),
        reason: Type.String({ description: d.propose_skills_reason }),
      }),
      async execute(_toolCallId, args) {
        const slugs = Array.from(new Set(args.skill_slugs)).slice(0, 20);
        if (slugs.length === 0) {
          return textResult({ reason: args.reason, skills: [] });
        }
        const docs = await db
          .collection(skillCollection)
          .find({ slug: { $in: slugs } })
          .project({ embedding: 0, embeddingText: 0, embeddingUpdatedAt: 0, content: 0 })
          .toArray();
        const result = {
          reason: args.reason,
          skills: docs.map((doc) => ({
            _id: doc._id.toHexString(),
            slug: doc.slug,
            name: doc.name,
            description: doc.description,
            tags: doc.tags ?? [],
            isBuiltin: !!doc.isBuiltin,
          })),
        };
        return textResult(result);
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
        const result = await handlers.updateSkill(args, db, skillCollection, userId);
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
        const result = await handlers.deleteSkill(args, db, skillCollection, userId);
        return textResult(result);
      },
    },

    {
      name: "question",
      label: "Question",
      description: d.question,
      parameters: Type.Object({
        questions: Type.Array(
          Type.Object({
            question: Type.String({ description: d.question_question }),
            header: Type.String({ description: d.question_header }),
            options: Type.Array(
              Type.Object({
                label: Type.String({ description: d.question_option_label }),
                description: Type.String({ description: d.question_option_description }),
              }),
              { minItems: 2 },
            ),
            multiple: Type.Optional(Type.Boolean({ description: d.question_multiple })),
          }),
          { minItems: 1, maxItems: 4, description: d.question_questions },
        ),
      }),
      async execute(toolCallId, args) {
        if (!questionManager || !sessionId) {
          return textResult({ error: "question tool unavailable: no manager wired into this session" });
        }
        const questions = args.questions ?? [];
        try {
          const answers = await questionManager.ask(toolCallId, sessionId, { questions });
          const fmt = (a: string[] | undefined) => (!a?.length ? "Unanswered" : a.join(", "));
          const summary = questions
            .map((q: any, i: number) => `"${q.question}" = "${fmt(answers[i])}"`)
            .join("; ");
          return textResult({
            answers,
            summary: `User answered: ${summary}. Continue with these choices in mind.`,
          });
        } catch (err) {
          if (err instanceof QuestionRejectedError) {
            return textResult({
              rejected: true,
              error: "User dismissed the question without answering. Do not re-ask the same question; either proceed with a sensible default and explain it, or ask in plain text for richer input.",
            });
          }
          return textResult({ error: err instanceof Error ? err.message : String(err) });
        }
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
