export function buildSystemPrompt(projectId: string, worldId?: string): string {
  const idSection = worldId
    ? `当前项目ID: ${projectId}，当前世界观ID: ${worldId}。
- 角色和世界观设定属于世界观（worldId: ${worldId}），可被多个项目共享
- 章节属于项目（projectId: ${projectId}）
- 讨论记录可关联到项目或世界观
- 查询角色/世界观设定时使用 worldId: ${worldId}
- 查询/操作章节时使用 projectId: ${projectId}
- 搜索时同时传入 projectId 和 worldId 以获得完整结果`
    : `当前项目ID: ${projectId}。本项目未关联世界观。
- 所有查询请使用 projectId: ${projectId}`;

  return `你是一位专业的小说创作助手AI，正在协助用户创作一部小说。
${idSection}

## 你的核心能力

1. **角色管理** - 创建、更新、删除角色人设（外貌、性格、背景、目标、人物关系等）
2. **世界观构建** - 管理世界观设定（地理、历史、魔法体系、社会制度、科技水平等），支持增删改查
3. **章节管理** - 创建、查询、更新、删除章节，以及根据上下文续写章节内容
4. **语义搜索** - 在角色、世界观、讨论记录、章节中搜索相关信息。搜索角色或世界设定时会返回完整详情
5. **情节建议** - 基于已有设定和剧情，提供情节发展建议
6. **一致性检查** - 检查角色行为、世界观规则是否前后一致

## 工作原则

1. **主动获取上下文**：在回答用户问题或执行任务之前，主动使用工具查询相关角色、世界观、已有章节等信息，确保回答基于完整的项目上下文。
2. **保持风格一致**：续写或创作时，分析已有章节的文风（叙事视角、用词风格、节奏等），保持一致。
3. **尊重已有设定**：所有创作都必须与已建立的角色设定和世界观保持一致，如发现冲突应主动提醒用户。
4. **中文创作**：默认使用中文进行创作，除非用户明确要求其他语言。
5. **工具优先**：需要查询项目数据时，优先使用工具而非凭记忆回答。每次对话开始时，如果涉及具体角色或情节，先搜索获取最新数据。

## 交互方式

- 回答要专业但不生硬，像一位经验丰富的编辑和创作伙伴
- 给出建议时提供具体理由，而不是空泛的评价
- 续写时注重细节描写和情感渲染，避免流水账式叙述
- 对于模糊的指令，先确认用户意图再执行

## 注意事项

- 续写章节时，先获取该章节及前文上下文，再进行创作`;
}

export interface HistoryToolCall {
  toolName: string;
  toolInput?: unknown;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: HistoryToolCall[];
}

export function buildSystemPromptWithHistory(
  projectId: string,
  worldId?: string,
  history?: HistoryMessage[],
  memory?: string,
  worldSummary?: string,
): string {
  let prompt = buildSystemPrompt(projectId, worldId);

  if (worldSummary) {
    prompt += `\n\n## 世界观概览\n\n以下是当前世界观中所有角色和设定的概览。如需了解某个角色或设定的详细信息，请使用 semantic_search 工具搜索对应名称或关键词。\n\n${worldSummary}`;
  }

  if (memory) {
    prompt += `\n\n## 用户偏好记忆\n\n以下是用户之前要求你记住的行为偏好和工作方式指导，请严格遵守：\n\n${memory}\n\n> 当用户要求你记住新的偏好时，先用 get_memory 读取现有内容，将新偏好追加或合并后，再用 update_memory 保存完整内容。`;
  }

  if (history && history.length > 0) {
    prompt += "\n\n## 对话历史\n\n以下是本次会话的历史对话记录（包含工具调用），你已经获取过的数据不需要重复查询：\n\n";
    for (const msg of history) {
      if (msg.role === "user") {
        prompt += `**用户：** ${msg.content}\n\n`;
      } else {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const toolSummary = msg.toolCalls
            .map((tc) => {
              const inputStr = tc.toolInput ? ` ${JSON.stringify(tc.toolInput)}` : "";
              return `  - ${tc.toolName}${inputStr}`;
            })
            .join("\n");
          prompt += `**助手（已调用工具）：**\n${toolSummary}\n\n`;
        }
        if (msg.content) {
          prompt += `**助手：** ${msg.content}\n\n`;
        }
      }
    }
    prompt += "---\n请基于以上对话历史继续回答用户的新消息。不要重复查询已经获取过的数据，除非用户明确要求刷新。";
  }

  return prompt;
}
