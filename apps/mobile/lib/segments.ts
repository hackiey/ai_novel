export interface AgentEvent {
  type: "text" | "tool_use" | "tool_result" | "done" | "error" | "session" | "compaction";
  text?: string;
  toolName?: string;
  toolInput?: any;
  result?: any;
  fullResponse?: string;
  error?: string;
  sessionId?: string;
  message?: string;
  threshold?: number;
  contextTokens?: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  events?: AgentEvent[];
  createdAt?: string;
}

export type Segment =
  | { type: "text"; content: string }
  | { type: "status"; content: string }
  | {
      type: "tools";
      calls: Array<{
        toolName: string;
        toolInput?: any;
        result?: string;
        pending?: boolean;
      }>;
    };

/** Split flat event list into ordered text/tool segments */
export function buildSegments(
  events: AgentEvent[] | undefined,
  content: string,
  isStreaming: boolean
): Segment[] {
  if (!events || events.length === 0) {
    return content ? [{ type: "text", content }] : [];
  }

  const segments: Segment[] = [];
  let textAcc = "";
  let currentToolGroup: (Segment & { type: "tools" }) | null = null;
  const toolUseList: Array<{
    toolName: string;
    toolInput?: any;
    result?: string;
    pending?: boolean;
  }> = [];
  let resultIdx = 0;

  for (const ev of events) {
    if (ev.type === "text") {
      if (currentToolGroup) {
        segments.push(currentToolGroup);
        currentToolGroup = null;
      }
      textAcc += ev.text || "";
    } else if (ev.type === "tool_use") {
      if (textAcc.trim()) {
        segments.push({ type: "text", content: textAcc });
        textAcc = "";
      }
      if (!currentToolGroup) {
        currentToolGroup = { type: "tools", calls: [] };
      }
      const call = {
        toolName: ev.toolName || "unknown",
        toolInput: ev.toolInput,
        pending: true,
      };
      currentToolGroup.calls.push(call);
      toolUseList.push(call);
    } else if (ev.type === "tool_result") {
      if (resultIdx < toolUseList.length) {
        toolUseList[resultIdx].result = ev.result;
        toolUseList[resultIdx].pending = false;
        resultIdx++;
      }
    } else if (ev.type === "compaction") {
      if (currentToolGroup) {
        segments.push(currentToolGroup);
        currentToolGroup = null;
      }
      if (textAcc.trim()) {
        segments.push({ type: "text", content: textAcc });
        textAcc = "";
      }
      if (ev.message) {
        segments.push({ type: "status", content: ev.message });
      }
    }
  }

  if (isStreaming) {
    for (const call of toolUseList) {
      if (call.pending && call.result === undefined) {
        call.pending = true;
      }
    }
  } else {
    for (const call of toolUseList) {
      call.pending = false;
    }
  }

  if (currentToolGroup) {
    segments.push(currentToolGroup);
  }
  if (textAcc.trim()) {
    segments.push({ type: "text", content: textAcc });
  }

  return segments;
}

// Tools that mutate data — map tool names to tRPC query keys to invalidate
export const MUTATION_TOOL_INVALIDATIONS: Record<string, string[][]> = {
  write: [["character"], ["worldSetting"], ["chapter"], ["draft"]],
  update_character: [["character"]],
  update_world_setting: [["worldSetting"]],
  update_chapter: [["chapter"]],
  update_draft: [["draft"]],
  delete_entity: [["character"], ["worldSetting"], ["chapter"], ["draft"]],
};
