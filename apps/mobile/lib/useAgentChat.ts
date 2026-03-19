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

export function useAgentChat(worldId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const sessionsQuery = trpc.agent.listSessions.useQuery(
    { worldId },
    { enabled: !!worldId }
  );

  const loadSession = useCallback(
    async (sid: string) => {
      setSessionId(sid);
      setIsLoading(true);
      try {
        const token = getTokenSync();
        const baseUrl = getApiBaseUrlSync();
        const res = await fetch(
          `${baseUrl}/trpc/agent.getHistory?input=${encodeURIComponent(
            JSON.stringify({ sessionId: sid })
          )}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );
        const json = await res.json();
        const history = json.result?.data;
        if (history) {
          const loaded: ChatMessage[] = history.map((doc: any) => ({
            role: doc.role,
            content: doc.content || "",
            events: doc.events,
            createdAt: doc.createdAt,
          }));
          setMessages(loaded);
        }
      } catch {
        // silently fail
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (text: string) => {
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

      try {
        const token = getTokenSync();
        const baseUrl = getApiBaseUrlSync();
        const response = await fetch(`${baseUrl}/api/agent/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            worldId,
            message: text,
            sessionId,
            locale: "zh-CN",
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";
        const allEvents: AgentEvent[] = [];
        const mutatedTools: string[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            if (payload === "[DONE]") continue;

            try {
              const event: AgentEvent = JSON.parse(payload);

              if (event.type === "session" && event.sessionId) {
                setSessionId(event.sessionId);
                continue;
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
            } catch {
              // skip malformed JSON
            }
          }
        }

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
    [isLoading, sessionId, worldId, queryClient, sessionsQuery]
  );

  const newSession = useCallback(() => {
    setSessionId(undefined);
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    isLoading,
    sessionId,
    sessionsQuery,
    loadSession,
    newSession,
  };
}
