import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

export interface AgentEvent {
  type: "text" | "tool_use" | "tool_result" | "done" | "error" | "session";
  text?: string;
  toolName?: string;
  toolInput?: any;
  result?: any;
  fullResponse?: string;
  error?: string;
  sessionId?: string;
}

type Segment =
  | { type: "text"; content: string }
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
    return <span className="text-emerald-700">&quot;{data}&quot;</span>;
  }
  if (typeof data === "number" || typeof data === "boolean") {
    return <span className="text-blue-700">{String(data)}</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-gray-500">[]</span>;
    return (
      <div className="pl-3 border-l border-gray-200">
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
      <div className="pl-3 border-l border-gray-200">
        {keys.map((key) => (
          <div key={key} className="flex gap-1">
            <span className="text-purple-700 shrink-0">{key}:</span>
            <JsonView data={data[key]} />
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(data)}</span>;
}

function CollapsibleSection({ label, children, defaultOpen = false }: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
      >
        <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        {label}
      </button>
      {open && <div className="mt-1 text-[11px] text-gray-600 max-h-60 overflow-y-auto">{children}</div>}
    </div>
  );
}

export function ToolCallBlock({ toolName, toolInput, result, pending }: {
  toolName: string;
  toolInput?: any;
  result?: string;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  const label = t(`tool.${toolName}`, toolName);

  let parsedResult: any = null;
  if (result) {
    try {
      parsedResult = JSON.parse(result);
    } catch {
      parsedResult = result;
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 text-xs overflow-hidden px-3 py-1.5 space-y-1">
      <div className="flex items-center gap-2">
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 text-teal-500 shrink-0 animate-spin" strokeWidth={2} />
        ) : (
          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" strokeWidth={2} />
        )}
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="text-gray-400 font-mono text-[10px]">{toolName}</span>
      </div>
      {toolInput && (
        <CollapsibleSection label={t("chat.parameters")}>
          <JsonView data={toolInput} />
        </CollapsibleSection>
      )}
      {parsedResult !== null && (
        <CollapsibleSection label={t("chat.results")}>
          <JsonView data={parsedResult} />
        </CollapsibleSection>
      )}
    </div>
  );
}

export function AssistantMessageContent({ events, content, isStreaming }: {
  events?: AgentEvent[];
  content: string;
  isStreaming: boolean;
}) {
  const { t } = useTranslation();
  const segments = buildSegments(events, content, isStreaming);

  if (segments.length === 0 && isStreaming) {
    return (
      <div className="flex items-center gap-2 text-xs text-teal-600">
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
            <div key={i} className="max-w-[90%] px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-800 text-sm shadow-sm agent-markdown">
              <Markdown remarkPlugins={[remarkGfm, remarkBreaks]}>{seg.content}</Markdown>
            </div>
          );
        }
        return (
          <div key={i} className="space-y-1 max-w-[90%]">
            {seg.calls.map((call, j) => (
              <ToolCallBlock key={j} {...call} />
            ))}
          </div>
        );
      })}
    </>
  );
}
