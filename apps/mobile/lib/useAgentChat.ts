import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getTokenSync } from "./auth";
import { getApiBaseUrlSync } from "./config";
import {
  type AgentEvent,
  type ChatMessage,
  MUTATION_TOOL_INVALIDATIONS,
} from "./segments";
import { trpc } from "./trpc";

/**
 * SSE fetch using XMLHttpRequest for React Native compatibility.
 * React Native's fetch doesn't support response.body (ReadableStream).
 */
function sseRequest(
  url: string,
  body: any,
  token: string | null,
  signal: AbortSignal,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastIndex = 0;
    let buffer = "";

    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/json");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    signal.addEventListener("abort", () => xhr.abort());

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
        if (xhr.status !== 200) {
          let errorMsg = `HTTP ${xhr.status}`;
          try {
            const errBody = JSON.parse(xhr.responseText);
            if (errBody?.error) errorMsg = errBody.error;
          } catch {}
          reject(new Error(errorMsg));
          xhr.abort();
          return;
        }
      }

      if (xhr.readyState >= XMLHttpRequest.LOADING && xhr.responseText) {
        const newData = xhr.responseText.substring(lastIndex);
        lastIndex = xhr.responseText.length;
        buffer += newData;

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const event: AgentEvent = JSON.parse(payload);
            onEvent(event);
          } catch {
            // skip malformed JSON
          }
        }
      }
    };

    xhr.onload = () => {
      // Process any remaining buffer
      if (buffer.trim()) {
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            onEvent(JSON.parse(payload));
          } catch {}
        }
      }
      resolve();
    };

    xhr.onerror = () => reject(new Error("Network request failed"));
    xhr.onabort = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));

    xhr.send(JSON.stringify(body));
  });
}

export function useAgentChat(worldId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [selectedModel, setSelectedModel] = useState<string | undefined>();
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const sessionsQuery = trpc.agent.listSessions.useQuery(
    { worldId },
    { enabled: !!worldId }
  );

  const modelsQuery = trpc.agent.getModels.useQuery();
  const activeSession = sessionsQuery.data?.find((session: any) => session.sessionId === sessionId) as any;
  const currentModelSpec = selectedModel || activeSession?.model || modelsQuery.data?.default;

  const truncateMut = trpc.agent.truncateMessages.useMutation();

  const loadSession = useCallback(
    async (sid: string) => {
      setSessionId(sid);
      setIsLoading(true);
      try {
        const token = getTokenSync();
        const baseUrl = getApiBaseUrlSync();
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};
        const [historyRes, pendingRes] = await Promise.all([
          fetch(
            `${baseUrl}/trpc/agent.getHistory?input=${encodeURIComponent(
              JSON.stringify({ sessionId: sid })
            )}`,
            { headers }
          ),
          fetch(`${baseUrl}/api/agent/question?sessionId=${encodeURIComponent(sid)}`, {
            headers,
          }).catch(() => null),
        ]);
        const json = await historyRes.json();
        const history = json.result?.data;
        const loaded: ChatMessage[] = Array.isArray(history)
          ? history.map((doc: any) => ({
              role: doc.role,
              content: doc.content || "",
              events: doc.events,
              createdAt: doc.createdAt,
            }))
          : [];
        // Surface any still-pending `question` tool calls that haven't yet been
        // persisted (the assistant turn is still running on the server). The
        // QuestionCard re-renders so the user can answer and unblock the agent.
        if (pendingRes && pendingRes.ok) {
          const pendingJson: any = await pendingRes.json().catch(() => null);
          const pendingList: Array<{ callId: string; info: { questions: any[] } }> =
            Array.isArray(pendingJson?.pending) ? pendingJson.pending : [];
          if (pendingList.length > 0) {
            const events = pendingList.map((p) => ({
              type: "tool_use" as const,
              toolName: "question",
              toolCallId: p.callId,
              toolInput: { questions: p.info.questions },
            }));
            loaded.push({ role: "assistant", content: "", events });
          }
        }
        setMessages(loaded);
      } catch {
        // silently fail
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (text: string, model?: string) => {
      if (!text || isLoading) return;

      setIsLoading(true);
      const userMsg: ChatMessage = { role: "user", content: text };
      setMessages((prev) => [
        ...prev,
        userMsg,
        { role: "assistant", content: "", events: [] },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      let fullText = "";
      const allEvents: AgentEvent[] = [];
      const mutatedTools: string[] = [];

      try {
        const token = getTokenSync();
        const baseUrl = getApiBaseUrlSync();
        const modelToUse = model || currentModelSpec;

        await sseRequest(
          `${baseUrl}/api/agent/chat`,
          {
            worldId,
            message: text,
            sessionId,
            locale: "zh-CN",
            ...(modelToUse ? { model: modelToUse } : {}),
          },
          token,
          controller.signal,
          (event) => {
            if (event.type === "session" && event.sessionId) {
              setSessionId(event.sessionId);
              return;
            }

            allEvents.push(event);

            if (event.type === "text" && event.text) {
              fullText += event.text;
            }

            if (event.type === "tool_use" && event.toolName) {
              mutatedTools.push(event.toolName);
            }

            if (event.type === "done" && event.fullResponse) {
              fullText = event.fullResponse;
            }

            if (event.type === "error") {
              fullText = fullText || `Error: ${event.error}`;
            }

            // Update assistant message in-place
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: fullText,
                  events: [...allEvents],
                };
              }
              return updated;
            });
          },
        );

        // Final update
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: fullText,
              events: allEvents,
            };
          }
          return updated;
        });

        // Invalidate queries for mutated tools
        const keysToInvalidate = new Set<string>();
        for (const toolName of mutatedTools) {
          const keys = MUTATION_TOOL_INVALIDATIONS[toolName];
          if (keys) {
            for (const key of keys) keysToInvalidate.add(JSON.stringify(key));
          }
        }
        for (const keyStr of keysToInvalidate) {
          queryClient.invalidateQueries({ queryKey: JSON.parse(keyStr) });
        }

        sessionsQuery.refetch();
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: `Error: ${err.message || "Failed to get response"}`,
            };
          }
          return updated;
        });
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [currentModelSpec, isLoading, sessionId, worldId, queryClient, sessionsQuery]
  );

  const truncateAndResend = useCallback(
    async (index: number, newContent: string) => {
      if (isLoading || !sessionId) return;
      const msg = messages[index];
      if (!msg || msg.role !== "user") return;

      // Truncate server-side messages at this point
      if (msg.createdAt) {
        await truncateMut.mutateAsync({
          sessionId,
          afterCreatedAt: msg.createdAt,
        });
      }

      // Truncate local messages: keep messages before this index
      setMessages((prev) => prev.slice(0, index));

      // Re-send with new content
      await sendMessage(newContent);
    },
    [isLoading, sessionId, messages, truncateMut, sendMessage]
  );

  const newSession = useCallback(() => {
    setSessionId(undefined);
    setMessages([]);
  }, []);

  return {
    messages,
    setMessages,
    sendMessage,
    isLoading,
    sessionId,
    sessionsQuery,
    loadSession,
    newSession,
    modelsQuery,
    selectedModel,
    setSelectedModel,
    truncateAndResend,
  };
}
