import type { Locale } from "../i18n.js";
import type { SkillData } from "../skills.js";

/** Names of all tools that createNovelTools can produce */
export type ToolName =
  | "semantic_search"
  | "update_character"
  | "create_character"
  | "get_entity"
  | "delete_entity"
  | "update_world_setting"
  | "create_world_setting"
  | "create_chapter"
  | "list_chapters"
  | "update_chapter"
  | "create_draft"
  | "update_draft"
  | "update_memory"
  | "generate_synopsis"
  | "invoke_skill";

/** Context available when building a system prompt */
export interface SystemPromptContext {
  projectId: string;
  worldId?: string;
  memory?: string;
  worldSummary?: string;
  locale?: Locale;
  projectMemory?: string;
  workingEnvironment?: string;
  conversationSummary?: string;
  skills?: SkillData[];
}

/** Definition of an agent type */
export interface AgentDefinition {
  /** Unique identifier for this agent type */
  id: string;
  /** Human-readable label */
  label: string;
  /**
   * Tool whitelist. Only tools whose name appears here will be
   * given to the LLM. Use ["*"] to mean "all tools."
   */
  tools: ToolName[] | ["*"];
  /** Build the system prompt for this agent */
  buildSystemPrompt: (ctx: SystemPromptContext) => string;
}
