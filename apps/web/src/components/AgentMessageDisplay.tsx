import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

export interface AgentEvent {
  type: "text" | "tool_use" | "tool_result" | "done" | "error" | "session" | "usage" | "compaction";
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
  usage?: {
    model: string;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
    isSummary?: boolean;
  };
}

type Segment =
  | { type: "text"; content: string }
  | { type: "status"; content: string }
  | { type: "tools"; calls: Array<{ toolName: string; toolInput?: any; result?: string; pending?: boolean }> };

/** Split flat event list into ordered text/tool segments */
export function buildSegments(events: AgentEvent[] | undefined, content: string, isStreaming: boolean): Segment[] {
  if (!events || events.length === 0) {
    return content ? [{ type: "text", content }] : [];
  }

  const segments: Segment[] = [];
  let textAcc = "";
  let currentToolGroup: Segment & { type: "tools" } | null = null;
  const toolUseList: Array<{ toolName: string; toolInput?: any; result?: string; pending?: boolean }> = [];
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
      const call = { toolName: ev.toolName || "unknown", toolInput: ev.toolInput, pending: true };
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

function JsonView({ data }: { data: any }) {
  if (data === null || data === undefined) return null;

  if (typeof data === "string") {
    return <span className="text-emerald-400">&quot;{data}&quot;</span>;
  }
  if (typeof data === "number" || typeof data === "boolean") {
    return <span className="text-blue-400">{String(data)}</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-gray-500">[]</span>;
    return (
      <div className="pl-3 border-l border-gray-300/40">
        {data.map((item, i) => (
          <div key={i} className="flex gap-1">
            <span className="text-gray-400 shrink-0">{i}:</span>
            <JsonView data={item} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof data === "object") {
    const keys = Object.keys(data);
    if (keys.length === 0) return <span className="text-gray-500">{"{}"}</span>;
    return (
      <div className="pl-3 border-l border-gray-300/40">
        {keys.map((key) => (
          <div key={key} className="flex gap-1">
            <span className="text-purple-400 shrink-0">{key}:</span>
            <JsonView data={data[key]} />
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(data)}</span>;
}


export function ToolCallBlock({ toolName, toolInput, result, pending, immersive }: {
  toolName: string;
  toolInput?: any;
  result?: string;
  pending?: boolean;
  immersive?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const label = t(`tool.${toolName}`, toolName);

  let parsedResult: any = null;
  if (result) {
    try {
      parsedResult = JSON.parse(result);
    } catch {
      parsedResult = result;
    }
  }

  const hasDetails = toolInput || parsedResult !== null;

  return (
    <div className={`rounded-lg border text-xs overflow-hidden px-3 py-1.5 ${
      immersive
        ? "border-white/10 bg-white/5 backdrop-blur-sm"
        : "border-gray-200 bg-gray-50"
    }`}>
      <div
        className={`flex items-center gap-2 ${hasDetails ? "cursor-pointer" : ""}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 text-teal-500 shrink-0 animate-spin" strokeWidth={2} />
        ) : (
          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" strokeWidth={2} />
        )}
        <span className={`font-medium shrink-0 whitespace-nowrap ${immersive ? "text-white/70" : "text-gray-600"}`}>{label}</span>
        {hasDetails && !expanded && toolInput && (
          <span className={`font-mono text-[10px] truncate ${immersive ? "text-white/30" : "text-gray-400"}`}>
            {Object.entries(toolInput).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ")}
          </span>
        )}
        {hasDetails && (
          <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ml-auto ${
            expanded ? "rotate-90" : ""
          } ${immersive ? "text-white/30" : "text-gray-400"}`} />
        )}
      </div>
      {expanded && (
        <div className={`mt-1.5 pt-1.5 space-y-2 border-t ${
          immersive ? "border-white/10" : "border-gray-200"
        }`}>
          {toolInput && (
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-1 ${
                immersive ? "text-white/30" : "text-gray-400"
              }`}>{t("chat.parameters")}</div>
              <div className="text-[11px] text-gray-600 max-h-60 overflow-y-auto scrollbar-none">
                <JsonView data={toolInput} />
              </div>
            </div>
          )}
          {parsedResult !== null && (
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-1 ${
                immersive ? "text-white/30" : "text-gray-400"
              }`}>{t("chat.results")}</div>
              <div className="text-[11px] text-gray-600 max-h-60 overflow-y-auto scrollbar-none">
                <JsonView data={parsedResult} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AssistantMessageContent({ events, content, isStreaming, immersive }: {
  events?: AgentEvent[];
  content: string;
  isStreaming: boolean;
  immersive?: boolean;
}) {
  const { t } = useTranslation();
  const segments = buildSegments(events, content, isStreaming);

  const showThinking = isStreaming && (
    segments.length === 0 ||
    (segments[segments.length - 1].type === "tools" &&
      (segments[segments.length - 1] as Extract<Segment, { type: "tools" }>).calls.every(c => !c.pending))
  );

  if (segments.length === 0 && showThinking) {
    return (
      <div className={`flex items-center gap-2 text-xs ${immersive ? "text-teal-400" : "text-teal-600"}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>{t("chat.thinking")}</span>
      </div>
    );
  }

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return (
            <div key={i} className={`max-w-[90%] text-sm agent-markdown ${
              immersive
                ? "agent-markdown-dark text-white/90"
                : "text-gray-800"
            }`}>
              <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}>{seg.content}</Markdown>
            </div>
          );
        }

        if (seg.type === "status") {
          return (
            <div
              key={i}
              className={`max-w-[90%] rounded-lg border px-3 py-2 text-xs ${
                immersive
                  ? "border-amber-300/20 bg-amber-300/10 text-amber-100/80"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {seg.content}
            </div>
          );
        }

        return (
          <div key={i} className="space-y-1 max-w-[90%]">
            {seg.calls.map((call, j) => (
              <ToolCallBlock key={j} {...call} immersive={immersive} />
            ))}
          </div>
        );
      })}
      {showThinking && segments.length > 0 && (
        <div className={`flex items-center gap-2 text-xs mt-2 ${immersive ? "text-teal-400" : "text-teal-600"}`}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t("chat.thinking")}</span>
        </div>
      )}
    </>
  );
}
