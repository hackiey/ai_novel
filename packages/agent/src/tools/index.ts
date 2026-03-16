import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { Db } from "mongodb";
import * as handlers from "./handlers.js";

export type VectorSearchFn = (args: {
  projectId?: string;
  worldId?: string;
  query: string;
  scope?: string[];
  limit?: number;
}) => Promise<{ results: Array<{ collection: string; id: string; title: string; excerpt: string; score: number }>; total: number }>;

export function createNovelToolsServer(db: Db, vectorSearchFn?: VectorSearchFn) {
  return createSdkMcpServer({
    name: "novel-tools",
    version: "1.0.0",
    tools: [
      tool(
        "semantic_search",
        "搜索角色、世界观设定、草稿、章节中的相关内容。支持语义搜索（向量匹配）和关键词搜索。",
        {
          projectId: z.string().optional().describe("项目ID（用于搜索章节和项目级草稿）"),
          worldId: z.string().optional().describe("世界观ID（用于搜索角色、世界观设定和世界观级草稿）"),
          query: z.string().describe("搜索内容（支持语义理解，不必完全匹配关键词）"),
          scope: z
            .array(z.enum(["character", "world", "draft", "chapter"]))
            .optional()
            .describe("搜索范围，可选。默认搜索所有类型。可指定一个或多个: character, world, draft, chapter"),
          limit: z.number().optional().describe("返回结果数量上限，默认5"),
        },
        async (args) => {
          console.log("[semantic_search] called with:", JSON.stringify(args));
          console.log("[semantic_search] vectorSearchFn available:", !!vectorSearchFn);
          // Prefer vector search if available, fall back to regex
          if (vectorSearchFn) {
            try {
              const result = await vectorSearchFn(args);
              console.log("[semantic_search] vector result count:", result.results?.length);
              return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
            } catch (err) {
              console.error("[semantic_search] Vector search failed, falling back to regex:", err);
            }
          }
          const result = await handlers.semanticSearch(args, db);
          console.log("[semantic_search] regex result count:", (result as any).results?.length);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "get_character",
        "根据ID获取角色的完整信息，包括外貌、性格、背景、人物关系等。",
        {
          id: z.string().describe("角色ID"),
        },
        async (args) => {
          const result = await handlers.getCharacter(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "list_characters",
        "列出所有角色。优先使用worldId查询，如无worldId则使用projectId。",
        {
          worldId: z.string().optional().describe("世界观ID（优先使用）"),
          projectId: z.string().optional().describe("项目ID（无worldId时使用）"),
        },
        async (args) => {
          const result = await handlers.listCharacters(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "update_character",
        "更新角色信息。可以更新名称、角色类型、人设详情等。profile 中的字段会合并更新而非整体替换。",
        {
          id: z.string().describe("角色ID"),
          name: z.string().optional().describe("角色名称"),
          role: z
            .enum(["protagonist", "antagonist", "supporting", "minor", "other"])
            .optional()
            .describe("角色类型"),
          aliases: z.array(z.string()).optional().describe("角色别名列表"),
          profile: z
            .object({
              appearance: z.string().optional().describe("外貌描述"),
              personality: z.string().optional().describe("性格特点"),
              background: z.string().optional().describe("背景故事"),
              goals: z.string().optional().describe("目标动机"),
            })
            .optional()
            .describe("角色详细信息"),
        },
        async (args) => {
          const result = await handlers.updateCharacter(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "create_character",
        "创建新角色。优先使用worldId，如无worldId则使用projectId。",
        {
          worldId: z.string().optional().describe("世界观ID（优先使用）"),
          projectId: z.string().optional().describe("项目ID（无worldId时使用）"),
          name: z.string().describe("角色名称"),
          role: z
            .enum(["protagonist", "antagonist", "supporting", "minor", "other"])
            .optional()
            .describe("角色类型，默认 other"),
          aliases: z.array(z.string()).optional().describe("角色别名"),
          profile: z
            .object({
              appearance: z.string().optional(),
              personality: z.string().optional(),
              background: z.string().optional(),
              goals: z.string().optional(),
            })
            .optional()
            .describe("角色详细信息"),
        },
        async (args) => {
          const result = await handlers.createCharacter(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "delete_character",
        "删除指定角色。此操作不可撤销，会同时删除相关的嵌入数据。",
        {
          id: z.string().describe("要删除的角色ID"),
        },
        async (args) => {
          const result = await handlers.deleteCharacter(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "get_world_setting",
        "根据ID获取世界观设定详情。",
        {
          id: z.string().describe("世界观设定ID"),
        },
        async (args) => {
          const result = await handlers.getWorldSetting(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "list_world_settings",
        "列出世界观设定条目，可按分类筛选。优先使用worldId查询，如无worldId则使用projectId。",
        {
          worldId: z.string().optional().describe("世界观ID（优先使用）"),
          projectId: z.string().optional().describe("项目ID（无worldId时使用）"),
          category: z.string().optional().describe("按分类筛选，如: 地理、历史、魔法体系、社会制度等"),
        },
        async (args) => {
          const result = await handlers.listWorldSettings(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "update_world_setting",
        "更新世界观设定。",
        {
          id: z.string().describe("世界观设定ID"),
          category: z.string().optional().describe("分类"),
          title: z.string().optional().describe("标题"),
          content: z.string().optional().describe("内容"),
          tags: z.array(z.string()).optional().describe("标签"),
        },
        async (args) => {
          const result = await handlers.updateWorldSetting(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "create_world_setting",
        "创建新的世界观设定。优先使用worldId，如无worldId则使用projectId。",
        {
          worldId: z.string().optional().describe("世界观ID（优先使用）"),
          projectId: z.string().optional().describe("项目ID（无worldId时使用）"),
          category: z.string().describe("分类，如: 地理、历史、魔法体系"),
          title: z.string().describe("标题"),
          content: z.string().optional().describe("内容"),
          tags: z.array(z.string()).optional().describe("标签"),
        },
        async (args) => {
          const result = await handlers.createWorldSetting(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "delete_world_setting",
        "删除指定世界观设定。此操作不可撤销。",
        {
          id: z.string().describe("要删除的世界观设定ID"),
        },
        async (args) => {
          const result = await handlers.deleteWorldSetting(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "create_chapter",
        "创建新章节。如果不指定 order，会自动排在最后。",
        {
          projectId: z.string().describe("项目ID"),
          title: z.string().describe("章节标题"),
          content: z.string().optional().describe("章节初始内容"),
          synopsis: z.string().optional().describe("章节梗概"),
          order: z.number().optional().describe("章节排序，不指定则自动排在最后"),
        },
        async (args) => {
          const result = await handlers.createChapter(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "get_chapter",
        "根据ID获取章节完整内容。",
        {
          id: z.string().describe("章节ID"),
        },
        async (args) => {
          const result = await handlers.getChapter(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "list_chapters",
        "列出项目的所有章节，按章节顺序排列。",
        {
          projectId: z.string().describe("项目ID"),
        },
        async (args) => {
          const result = await handlers.listChapters(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "continue_writing",
        "续写章节。获取当前章节内容和前文上下文，供续写使用。返回章节内容和上下文信息，由AI根据这些信息生成续写内容。",
        {
          chapterId: z.string().describe("要续写的章节ID"),
          instructions: z.string().optional().describe("续写指导说明，如情节方向、场景描写要求等"),
          wordCount: z.number().optional().describe("目标续写字数，默认500"),
        },
        async (args) => {
          const result = await handlers.continueWriting(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "update_chapter",
        "更新章节内容、标题、状态等。",
        {
          id: z.string().describe("章节ID"),
          title: z.string().optional().describe("章节标题"),
          content: z.string().optional().describe("章节内容"),
          synopsis: z.string().optional().describe("章节梗概"),
          status: z.enum(["draft", "revision", "final"]).optional().describe("章节状态"),
          order: z.number().optional().describe("章节排序"),
        },
        async (args) => {
          const result = await handlers.updateChapter(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "delete_chapter",
        "删除指定章节。此操作不可撤销，会同时删除相关的嵌入数据。",
        {
          id: z.string().describe("要删除的章节ID"),
        },
        async (args) => {
          const result = await handlers.deleteChapter(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "get_draft",
        "根据ID获取草稿详情。",
        {
          id: z.string().describe("草稿ID"),
        },
        async (args) => {
          const result = await handlers.getDraft(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "create_draft",
        "创建草稿，用于保存创作过程中的想法、灵感、决策等。可关联到项目或世界观。",
        {
          projectId: z.string().optional().describe("项目ID（可选，与worldId至少提供一个）"),
          worldId: z.string().optional().describe("世界观ID（可选，与projectId至少提供一个）"),
          title: z.string().describe("草稿标题"),
          content: z.string().optional().describe("草稿内容"),
          tags: z.array(z.string()).optional().describe("标签"),
          linkedCharacters: z.array(z.string()).optional().describe("关联角色ID列表"),
          linkedWorldSettings: z.array(z.string()).optional().describe("关联世界观设定ID列表"),
        },
        async (args) => {
          const result = await handlers.createDraft(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "delete_draft",
        "删除指定草稿。此操作不可撤销。",
        {
          id: z.string().describe("要删除的草稿ID"),
        },
        async (args) => {
          const result = await handlers.deleteDraft(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "get_memory",
        "读取当前世界观的用户偏好记忆。返回之前保存的用户行为偏好和工作方式指导。",
        {
          worldId: z.string().describe("世界观ID"),
        },
        async (args) => {
          const result = await handlers.getMemory(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "update_memory",
        "更新用户偏好记忆。整体覆盖 content 字段。当用户要求你记住某些做事方式、行为偏好时调用此工具保存。",
        {
          worldId: z.string().describe("世界观ID"),
          content: z.string().describe("完整的记忆内容（会整体覆盖旧内容，请先读取再追加）"),
        },
        async (args) => {
          const result = await handlers.updateMemory(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),

      tool(
        "generate_synopsis",
        "获取章节内容，用于生成章节梗概。返回章节全文供AI总结。",
        {
          chapterId: z.string().describe("章节ID"),
        },
        async (args) => {
          const result = await handlers.generateSynopsis(args, db);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        }
      ),
    ],
  });
}
